// uraniborg/events.go: Support functions for event-based monitors and processors
package main

import (
	"fmt"
	"log"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"codeberg.org/astronexus/brahe"
	"github.com/fsnotify/fsnotify"
)

/*  --------------------- */
/*  Logging tools         */
/*  --------------------- */

// Trace records the time of invocation, along with the arbitrary string [s].
func Trace(s string) (string, time.Time) {
	log.Println("START:", s)
	return s, time.Now()
}

// EndTime records the elapsed time, as of invocation, since the start time [start], along with an arbitrary string [s].
func EndTime(s string, start time.Time) {
	end := time.Now()
	log.Println("END:", s, "Elapsed time:", end.Sub(start))
}

/*  ------------------------------ */
/*  Data acquisition tools         */
/*  ------------------------------ */

/*
LoadUraniborgData loads the correct Uraniborg data source, as defined in the application configuration [applicationConfig].
*/
func LoadUraniborgData(applicationConfig ApplicationConfiguration) []brahe.Star {
	if TIME_LOG_ENABLE {
		defer EndTime(Trace(ALERT_HEADER + " loading star data file."))
	}
	starDataFile := applicationConfig.DataFile
	// Load actual data from file:
	athygStars, err := brahe.ReadAthygData(GetDataDirectory() + starDataFile)
	if err != nil {
		fmt.Printf("Could not load data file '%v'. Loading default catalog '%v'.\n", starDataFile, DEFAULT_DATA_FILE)
		athygStars, err = brahe.ReadAthygData(GetDataDirectory() + DEFAULT_DATA_FILE)
		if err != nil {
			// Can't proceed if even the default data load is bad.
			fmt.Println("*** Could not find a valid star data file to load. Stopping.")
			panic(err)
		}
	}
	fmt.Printf(ALERT_HEADER+" loaded %v stars from catalog.\n", len(athygStars))
	return athygStars
}

/*
GetStarsForEvent is the main computational action. When called with a chart configuration [config], a list of stars from the data source [athygStars],
and the viewpoint [fromStar] and target [toStar] locations, finds a list of stars that are in the correct positions for the specified configuration.
Supports concurrent operations via the allowed number [concurrency] of concurrent processes.
*/

func GetStarsForEvent(config UserConfiguration, athygStars []brahe.Star, fromStar brahe.Star, toStar brahe.Star, concurrency int) []brahe.Star {

	// Generate star filter config (such as magnitude and angle cutoffs)
	selectionAngle := GetViewAngleForConfig(config)
	timeDiff := GetTimeDifferenceForConfig(config)
	starFilterConfig := brahe.StarListConfig{From: fromStar, To: toStar, Angle: selectionAngle, Magnitude: config.Magnitude, Time: timeDiff}

	// Get star data given the star filter configuration (e.g., positions as seen from fromStar; exclude ones further from the center than selectionAngle)
	// and sort by brightness. The sort is ascending, so that dim stars simply get overplotted by bright ones if they are too close.
	starsToUse := GetStarsForConfig(athygStars, starFilterConfig, concurrency)
	sort.Slice(starsToUse, func(i, j int) bool {
		return brahe.ScaledLuminosity(starsToUse[i]) < brahe.ScaledLuminosity(starsToUse[j])
	})
	return starsToUse
}

/*
ConvertStarToGalacticPosition converts the position and velocity of a star with the original (equatorially-based) Cartesian
coordinates to one with galactic coordinates instead.
*/
func ConvertStarToGalacticPosition(star brahe.Star) brahe.Star {
	star.Position = brahe.EquatorialToGalactic(star.Position)
	star.Velocity = brahe.EquatorialToGalactic(star.Velocity)
	return star
}

// GetStarsToHighlight converts a CSV string of star names to highlight into an array.
func GetStarsToHighlight(starConfig string) []string {
	return strings.Split(starConfig, ",")
}

// validateFromTarget checks the "from" or camera position target for validity.
func validateFromTarget(targetLength int) bool {
	return targetLength == 1 || targetLength == 4
}

// validateToTarget checks the "to" or camera orientation ("looking to") target for validity.
func validateToTarget(targetLength int) bool {
	return targetLength == 1 || targetLength == 3 || targetLength == 4
}

// getHighlightIds gets the Ids of stars to highlight with a special color
func getHighlightIds(config UserConfiguration, athygIndex map[string]int) []int {
	toHighlightIds := make([]int, 0)
	if len(config.Highlight) > 0 {
		toHighlight := GetStarsToHighlight(config.Highlight)
		for _, starName := range toHighlight {
			starID := brahe.AthygTargetIDLookup(athygIndex, strings.Trim(starName, " "))
			if starID > 0 {
				toHighlightIds = append(toHighlightIds, starID)
			}
		}
	}
	return toHighlightIds
}

/*
PlotFromConfig is the main event action. When called with a user chart configuration [config], a list of stars [athygStars],
an index of star IDs and labels [athygIndex] and a runtime concurrency [concurrency], it creates a chart based on the specified configuration and data.
The concurrency value is read from application configuration at application launch time.
*/
func PlotFromConfig(config UserConfiguration, athygStars []brahe.Star, athygIndex map[string]int, concurrency int) {
	if TIME_LOG_ENABLE {
		defer EndTime(Trace(ALERT_HEADER + " chart render from " + USER_CONFIG_FILE + " (concurrency level: " + strconv.Itoa(concurrency) + ")."))
	}
	image := InitializeChart(config)
	errorCaption := ""
	fromStar, fromError := GetPlotViewpoint(config, athygStars, athygIndex)
	toStar, toError := GetPlotTarget(config, athygStars, athygIndex)

	fromTargetLength := len(GetStarConfigComponents(config.From))
	toTargetLength := len(GetStarConfigComponents(config.To))
	invalidInput := fromError != nil || toError != nil || fromStar.ID == 0 || toStar.ID == 0
	if !validateFromTarget(fromTargetLength) {
		errorCaption += "Your 'from' location of '" + config.From + "' is invalid; it must be either a single name, or a name plus 3 coordinates. Coordinate pairs (right ascension + declination) are only allowed for the 'to' configuration."
	} else if !validateToTarget(toTargetLength) {
		errorCaption += "Your 'to' location of '" + config.To + "' is invalid; it must be either a single name, or a name plus 2 or 3 coordinates."
	} else if invalidInput {
		fmt.Printf("Invalid from location (source/viewpoint) or to location (target star to center in plot) specified.\n")
		if fromError != nil {
			fmt.Printf("Error for 'from' location: %v\n", fromError)
			errorCaption += "Your 'from' location of '" + config.From + "' was not found. "
		}
		if toError != nil {
			fmt.Printf("Error for 'to' location: %v\n", toError)
			errorCaption += "Your 'to' location of '" + config.To + "' was not found. "
		}
	}
	if errorCaption != "" {
		errorCaption2 := "Please check your input and try again."
		scheme := config.SchemeData
		captionColor := scheme.Colors.Caption
		image.SetRGB(captionColor.R, captionColor.G, captionColor.B)
		if err := image.LoadFontFace(GetFontDirectory()+scheme.Fonts.Caption.File, float64(scheme.Fonts.Caption.Size)); err != nil {
			fmt.Printf("Could not load caption font.")
		} else {
			captionOffset := scheme.Labels.CaptionOffset
			image.DrawString(errorCaption, captionOffset.X, captionOffset.Y)
			image.DrawString(errorCaption2, captionOffset.X, captionOffset.Y*2)
		}
		SavePlot(image, config)
	} else if !invalidInput {
		// Ok to create a plot.
		viewpoint := brahe.CloneStar(*fromStar)
		target := brahe.CloneStar(*toStar)

		// Handle stereo mode. This is done by drawing the chart twice, once for each side of the stereo pair.
		// To do this correctly, each subchart has to have half the width and aspect ratio of the full image.

		// Additionally, the position of one specific corner for each chart (somewhat arbitrarily chosen to be the top left corner)
		// needs to be specified so that each chart is aligned correctly inside the larger image.

		// Set the aspect ratio before getting the list of stars to plot, so we don't need to get as many.

		if config.StereoOffset != 0.0 {
			config.Width /= 2.0
			config.Aspect /= 2.0
		}

		// Need the distance from the Sun to the center of the plot for chart labels. This has to be done with the main list (before computing update star
		// positions for the chart), because the Sun may not be part of the final list submitted to CreatePlot().
		centerDistance := GetDistanceToSunForPlot(athygStars, viewpoint, GetTimeDifferenceForConfig(config))
		// Then actually get the stars to plot. They will come back as a list with the correct positions as seen from the viewpoint
		starsToUse := GetStarsForEvent(config, athygStars, viewpoint, target, concurrency)

		if config.UseGalacticCoordinates {
			viewpoint = ConvertStarToGalacticPosition(viewpoint)
			target = ConvertStarToGalacticPosition(target)
			for i := 0; i < len(starsToUse); i++ {
				updatedStar := starsToUse[i]
				starsToUse[i] = ConvertStarToGalacticPosition(updatedStar)
			}
		}

		// Get stars to highlight in the plot:
		toHighlightIds := getHighlightIds(config, athygIndex)
		// Add them to the configuration if found
		if len(toHighlightIds) > 0 {
			config.HighlightIds = toHighlightIds
		}

		// Main chart
		topLeft := ScreenPoint{X: 0.0, Y: 0.0}
		CreatePlot(image, config, starsToUse, viewpoint, target, centerDistance, topLeft)

		// Second chart, if this is a stereo pair:
		if config.StereoOffset != 0.0 {
			offsetTopLeft := ScreenPoint{X: float64(config.Width) + 1.0, Y: 0.0}
			CreatePlot(image, config, starsToUse, viewpoint, target, centerDistance, offsetTopLeft)
		}
		// Plotting is done. Finally output the image to file
		SavePlot(image, config)
	}
}

// ReadConfigAndPlot reads the specified [configFile] and creates a plot using the supplied list of stars [athygStars],
// star name/ID index [athygIndex], and the desired concurrency.
func ReadConfigAndPlot(configFile string, athygStars []brahe.Star, athygIndex map[string]int, concurrency int) {
	config, err := ReadUserConfigFile(configFile)
	if err == nil {
		updatedConfig, err := MergeUserConfig(config)
		if err == nil {
			PlotFromConfig(updatedConfig, athygStars, athygIndex, concurrency)
		}
	}
}

// FileMonitor monitors the main config file (config/main.yaml) for changes. When it detects one, it calls PlotFromConfig()
// with the config it finds in the file, along with the star data [athygStars], the star index [athygIndex], and the
// desired concurrency [concurrency].
func FileMonitor(athygStars []brahe.Star, athygIndex map[string]int, concurrency int) {

	// Initialize file monitor.
	userFile := GetConfigurationDirectory() + USER_CONFIG_FILE
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		fmt.Println("Error creating file monitor")
		fmt.Println(err)
		return
	}
	defer func(watcher *fsnotify.Watcher) {
		err := watcher.Close()
		if err != nil {
			fmt.Println(err)
		}
	}(watcher)

	if err := watcher.Add(GetConfigurationDirectory()); err != nil {
		fmt.Println("File watcher setup error")
		fmt.Println(err)
		return
	}

	// Always do an initial chart creation upon startup.
	ReadConfigAndPlot(userFile, athygStars, athygIndex, concurrency)

	// Main event loop: watch user configuration file for changes.
	watchedFile := make(chan bool)

	fmt.Printf("%s now ready for updates to config. Edit your config file and save it to create a new chart.\n", ALERT_HEADER)
	fmt.Println("")
	go func() {
		for {
			select {
			// watch for events
			case event := <-watcher.Events:
				if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) {
					if strings.Contains(filepath.FromSlash(userFile), event.Name) {
						// NOTE: an equality check is better, but then there is an issue with event.Name being "config/main.yaml" vs userFile being "./config/main.yaml"
						// in "Quick install" mode (i.e., just running uraniborg from the git cloned repo, using the executable's dir as the reference dir for support file paths)
						// at least on macOS. This file name inconsistency (one side of it is adding a needless "./" in this case) needs to be sorted out more thoroughly at some point.
						fmt.Println("")
						fmt.Printf("%s file was added or changed. %v\n", ALERT_HEADER, event)
						ReadConfigAndPlot(userFile, athygStars, athygIndex, concurrency)
					}
				}
			// watch for errors
			case err := <-watcher.Errors:
				fmt.Println("File watcher processing error occurred: ", err)
			}
		}
	}()

	<-watchedFile
}
