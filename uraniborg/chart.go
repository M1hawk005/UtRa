// uraniborg/chart.go: Support functions for calculating and then displaying things on a chart.
// Individual symbol definitions belong in symbols.go or annotations.go,
// and more complex chart drawing operations (such as large collections of symbols) belong in draw.go.
// Requires the graphics module github.com/fogleman/gg
package main

import (
	"errors"
	"fmt"
	"math"
	"runtime"
	"strconv"
	"strings"
	"sync"

	"codeberg.org/astronexus/brahe"
	"github.com/fogleman/gg"
)

/*
InitializeChart takes the specified user configuration [config] and returns an image context [ct].
The user config is used to set values like chart dimensions and aspect ratio.
*/
func InitializeChart(config UserConfiguration) *gg.Context {
	image := gg.NewContext(config.Width, int(float64(config.Width)/config.Aspect))
	bgColor := config.SchemeData.Colors.Background
	image.SetRGB(bgColor.R, bgColor.G, bgColor.B)
	image.Clear()
	return image
}

// ********
// Chart star name/position handling (especially the viewpoint or "from" star and the target or "to" star)
// ********

// GetStarConfigComponents extracts relevant data from string [starConfigString], which can be a CSV string.
func GetStarConfigComponents(starConfigString string) []string {
	return strings.Split(starConfigString, ",")
}

// GetStarConfigPosition creates a vector representing the star's position from data in [starConfigComponents].
func GetStarConfigPosition(starConfigComponents []string) (brahe.CartesianVector, error) {
	position := *new(brahe.CartesianVector)
	x, err1 := strconv.ParseFloat(strings.TrimSpace(starConfigComponents[1]), 64)
	y, err2 := strconv.ParseFloat(strings.TrimSpace(starConfigComponents[2]), 64)
	z, err3 := strconv.ParseFloat(strings.TrimSpace(starConfigComponents[3]), 64)
	if err1 != nil {
		return position, err1
	} else if err2 != nil {
		return position, err2
	} else if err3 != nil {
		return position, err3
	} else {
		position = brahe.CartesianVector{x, y, z}
		return position, nil
	}
}

/*
CreateArbitrarySpacePoint creates a minimal Star object that represents a nominal point in space, for targeting purposes, at
Cartesian position [position] with a name of [name]. This is intended to allow arbitrarily positioned targets to behave
the same way as stars for computing positions and velocities.

However, since arbitrary positions should not represent actually visible objects, the object's intrinsic brightness
(absolute magnitude) must represent something that won't be visible. Note that since the default value of an
unset value is 0, and a star with an absolute magnitude of 0 is actually quite luminous, the absolute magnitude should be set
explicitly to something extremely dim (well below any plausible value that could appear on a plot, regardless of distance).
*/
func CreateArbitrarySpacePoint(name string, position brahe.CartesianVector) *brahe.Star {
	point := new(brahe.Star)
	point.ID = PLACEHOLDER_OBJECT_ID
	point.AbsoluteMag = PLACEHOLDER_ABS_MAG
	point.Name = name
	point.Position = position
	point.Velocity = brahe.CartesianVector{0.0, 0.0, 0.0}
	return point
}

/*
InitializeStarObject creates a Star object. It either extracts a Star object from [athygStars] by a lookup into [athygIndex], or it creates a "custom" Star object from a Cartesian position,
based on the configuration item [starConfigString]. For "custom" stars, the value of [customID] is used for the star's ID field.

[starConfigString] takes one of three formats -- a single undelimited string or a CSV string with 3 or 4 values:
	"name": For regular name/ID lookups using [athygStars] and [athygIndex]

	"name,ra,dec": 3 CSV values. For custom locations where the location is considered arbitrarily far away, at the equatorial coordinates
		given by ra (in hours) and dec (in degrees).

		The "name" portion is used as a label; it doesn't trigger a lookup by name.

		Since this is a direction rather than a specific point, it only makes sense for the "to" value.

	"name,x,y,z": 4 CSV values. For custom locations where the star's position, in Cartesian coordinates, is (x,y,z).

		The "name" portion is used as a label; it doesn't trigger a lookup by name.

In the first case, the star's ID comes from a successful lookup on the "name" value. In the second case, the value of [customID] is used as the star's ID value.

Returns a Star object and an error status. A nil error status means the Star object was successfully created.
*/

func InitializeStarObject(athygStars []brahe.Star, athygIndex map[string]int, starConfigString string, customID int) (*brahe.Star, error) {
	var star *brahe.Star
	star = new(brahe.Star)
	starComponents := GetStarConfigComponents(starConfigString)
	if len(starComponents) == 1 {
		// Do a lookup on the lone text found in the string
		starName := starComponents[0]
		star = brahe.GetAthygStarByName(athygStars, athygIndex, starName)
		if star.ID > 0 {
			return star, nil
		} else {
			return star, errors.New("star lookup by ID failed; no star found for " + starName)
		}
	} else if len(starComponents) == 3 {
		// found RA/Dec-style coordinates, plus a name, e.g. "Some Star, 14.321, -23.456"
		// This requires a bit of work to turn it into something uraniborg digests readily, specifically, 3 Cartesian coordinates.
		// In particular, we're faking an ultra-distant point at those coordinates.
		var starConfigComponents []string

		starName := starComponents[0]
		ra, _ := strconv.ParseFloat(strings.TrimSpace(starComponents[1]), 64)
		dec, _ := strconv.ParseFloat(strings.TrimSpace(starComponents[2]), 64)

		ra = brahe.ToRadians(ra * 15.0) // assumes hours. Degrees may be possible.
		dec = brahe.ToRadians(dec)

		polarPosition := brahe.SphericalVector{ra, dec, PLACEHOLDER_DISTANCE * 1.1} // ensure that this point is well over PLACEHOLDER_DISTANCE from any plausible star
		cartesianPosition := brahe.PolarToCartesian(polarPosition)

		starConfigComponents = append(starConfigComponents, starName)
		starConfigComponents = append(starConfigComponents, strconv.FormatFloat(cartesianPosition[0], 'f', -1, 64))
		starConfigComponents = append(starConfigComponents, strconv.FormatFloat(cartesianPosition[1], 'f', -1, 64))
		starConfigComponents = append(starConfigComponents, strconv.FormatFloat(cartesianPosition[2], 'f', -1, 64))

		position, positionErr := GetStarConfigPosition(starConfigComponents)
		if positionErr != nil {
			return star, positionErr
		} else {
			star = CreateArbitrarySpacePoint(starName, position)
			star.ID = customID
			return star, nil
		}

	} else if len(starComponents) == 4 {
		// found xyz coordinates as well as a name.
		starName := starComponents[0]
		position, positionErr := GetStarConfigPosition(starComponents)
		if positionErr != nil {
			return star, positionErr
		} else {
			star = CreateArbitrarySpacePoint(starName, position)
			star.ID = customID
			return star, nil
		}
	} else {
		return star, errors.New("star configuration format error; must contain a name/ID by itself or a name/ID plus coordinates")
	}
}

/*
GetPlotViewpoint is a convenience function for getting the "viewpoint", or location representing the viewing location for the chart.
*/
func GetPlotViewpoint(config UserConfiguration, athygStars []brahe.Star, athygIndex map[string]int) (*brahe.Star, error) {
	return InitializeStarObject(athygStars, athygIndex, config.From, CUSTOM_VIEWPOINT_ID)
}

/*
GetPlotTarget is a convenience function for getting the "target", or location representing the center of the chart.
*/
func GetPlotTarget(config UserConfiguration, athygStars []brahe.Star, athygIndex map[string]int) (*brahe.Star, error) {
	return InitializeStarObject(athygStars, athygIndex, config.To, CUSTOM_TARGET_ID)
}

// ********
// Chart calculation support (plot angle, plot time, etc.)
// ********

/*
GetViewAngleForConfig calculates the allowed angle of display (the maximum angle between chart center and stars that
are allowed to plot), based on the supplied chart configuration [config].
*/

func GetViewAngleForConfig(config UserConfiguration) float64 {
	aspect := config.Aspect
	if aspect < 1.0 {
		aspect = 1.0 / aspect
	}
	selectionAngle := BASE_ANGLE_MULTIPLIER * aspect / config.Scale
	if selectionAngle > math.Pi {
		selectionAngle = math.Pi
	}
	return selectionAngle
}

/*
GetTimeDifferenceForConfig calculates the time difference to apply to stars, based on
the supplied configuration [config]. This is normally the same as the "Time" configuration item,
but only if the ShowMotions value is false. When ShowMotions is true,
the stars don't move, but instead have a marker showing where they would be at the given time.
*/

func GetTimeDifferenceForConfig(config UserConfiguration) float64 {
	time := 0.0
	if config.Time != 0.0 && !config.ShowMotions {
		time = config.Time
	}
	return time
}

/*
GetDistanceToSunForPlot calculates the distance to the Sun from the center point (the [fromStar]) for
a plot. It does a lookup to find the Sun from [athygStars] and also applies the time before or after the present
[time] when needed to compute stellar motions.
*/

func GetDistanceToSunForPlot(athygStars []brahe.Star, fromStar brahe.Star, time float64) float64 {
	sun := brahe.GetStarByID(athygStars, brahe.ATHYG_SUN_ID)
	distToSun := brahe.Distance(brahe.TranslateStar(*sun, fromStar, time))
	return distToSun
}

/*
GetStarPosition gets the current plot position for the star [star] and user configuration [config].
The position is defined in terms of the center of the chart [center].
*/
func GetStarPosition(config UserConfiguration, star brahe.Star, center brahe.CartesianVector) ScreenPoint {

	// Ensure stars not plotted are marked as well out of bounds
	xDisplay := -1.0 * float64(config.Width)
	yDisplay := -1.0 * float64(config.Width)
	defaultPoint := ScreenPoint{xDisplay, yDisplay}

	// Apply proximity constraints. If the star is too close to the plot's viewpoint (the location the plot is being made from). don't plot it.
	if brahe.Distance(star) < PROXIMITY_LIMIT {
		return defaultPoint
	}
	return GetProjectedLocation(config, brahe.CartesianToPolar(center), brahe.CartesianToPolar(star.Position))
}

/*
GetStarsForConfig calculates the positions and velocities of all the stars in [list], given a star filter configuration [listConfig],
and the processing concurrency level [concurrency]. The filter configuration determines things like the viewpoint to calculate relative positions from,
the allowed range of angles between stars and the target, the time before or after the base epoch, and similar constraints.
*/
func GetStarsForConfig(list []brahe.Star, listConfig brahe.StarListConfig, concurrency int) []brahe.Star {
	if TIME_LOG_ENABLE {
		defer EndTime(Trace("*** Getting full list of stars to plot, looking from " + listConfig.From.Name + " to " + listConfig.To.Name + "."))
	}
	var wg sync.WaitGroup
	var newList []brahe.Star

	if concurrency > runtime.NumCPU() {
		concurrency = runtime.NumCPU()
	}

	if concurrency == 1 {
		// No concurrency; get all data via a single operation.
		newList = brahe.GetViewToTargetStar(list, listConfig, concurrency, 0)
	} else {
		// Manage concurrent operations.
		// sublist: A list from each of the goroutines. Holds a bunch of Star objects. About 1/concurrency of the full list.
		var sublist []brahe.Star
		// sublist: A list of lists. Define it so that the "i"th goroutine will fill the "i"th entry in this list with a list of Star objects.
		var sublists [][]brahe.Star
		sublist = make([]brahe.Star, 0)
		sublists = make([][]brahe.Star, concurrency)

		for n := 0; n < concurrency; n++ {
			wg.Add(1)

			go func(i int) {
				defer wg.Done()
				sublist = brahe.GetViewToTargetStar(list, listConfig, concurrency, i)
				sublists[i] = sublist

			}(n)

		}
		wg.Wait()
		// Create the final list by extracting all the sublists into one long list.
		for i := 0; i < len(sublists); i++ {
			newList = append(newList, sublists[i]...)
		}

	}
	return newList
}

/*
SavePlot writes the graphic context [ct] to PNG or JPEG. This is currently a separate method to permit timing.
*/

func SavePlot(ct *gg.Context, config UserConfiguration) {
	imageFormat := config.ImageFormat
	if TIME_LOG_ENABLE {
		defer EndTime(Trace(ALERT_HEADER + " saving " + strings.ToUpper(imageFormat) + " file."))
	}
	filename := config.ChartName
	if filename == "" {
		filename = OUTPUT_FILE + "." + imageFormat
	}
	if imageFormat == "png" {
		pngDestination := GetChartsDirectory() + filename
		err := ct.SavePNG(pngDestination)
		if err != nil {
			fmt.Printf("Warning: could not save file %v\n", pngDestination)
		} else {
			fmt.Printf("Saved PNG file: %v\n", pngDestination)
		}
	} else if imageFormat == "jpeg" || imageFormat == "jpg" {
		jpegDestination := GetChartsDirectory() + filename
		err := gg.SaveJPG(jpegDestination, ct.Image(), JPEG_QUALITY)
		if err != nil {
			fmt.Printf("Warning: could not save file %v\n", jpegDestination)
		} else {
			fmt.Printf("Saved JPEG file: %v\n", jpegDestination)
		}
	} else {
		panic(fmt.Sprintf("Unsupported image format %v found -- allowed formats are 'png' and 'jpeg'", imageFormat))
	}
}

/* isStereo indicates whether or not this chart is part of a stereo chart pair. */

func isStereo(config UserConfiguration) bool {
	return config.StereoOffset != 0.0
}

/*
CreatePlot creates a plot with a given image context [ct], user configuration [config], list of stars to plot [athygStars],
the two stars that define where we are looking from [fromStar] and to [toStar], and a distance to the Sun from the center of the plot [offsetDistance].
This last one is needed because the Sun is not always in the list of stars [starsToPlot], computed for the plot, but we do want to label how far the center of
the plot is from the Sun, so the distance has to be determined in advance.
*/
func CreatePlot(ct *gg.Context, config UserConfiguration, starsToPlot []brahe.Star, fromStar brahe.Star, toStar brahe.Star, offsetDistance float64, topLeft ScreenPoint) {
	if TIME_LOG_ENABLE {
		defer EndTime(Trace(ALERT_HEADER + " doing main plot logic."))
	}

	// Detect stereo mode
	stereo := isStereo(config)

	// Get current color/text scheme
	scheme := config.SchemeData

	// Offset center position of the chart by the location of the viewpoint (the "from" star).
	time := GetTimeDifferenceForConfig(config)
	plotTarget := brahe.TranslateStar(toStar, fromStar, time)

	// When enabled, plot the constellation names in the background:
	if config.ShowConstellationLabels {
		err := DrawConstellationNames(ct, config, plotTarget, topLeft)
		if err != nil {
			fmt.Print(err)
		}
	}

	// Ensure main font is set
	if err := ct.LoadFontFace(GetFontDirectory()+scheme.Fonts.Label.File, float64(scheme.Fonts.Label.Size)); err != nil {
		fmt.Printf("*** Couldn't find font file %v. Stopping.\n", scheme.Fonts.Label.File)
		panic(err)
	}

	// Actually plot the remaining elements of the chart.

	// * Coordinate grid, if enabled in configuration:
	// Note that at the moment, this option is always disabled in stereo mode.
	// That's because the logic for drawing lines considers a virtual "window" around the chart so
	// lines can be drawn right up to the chart edge. This approach to drawing the coordinate lines doesn't work well when two charts are
	// immediately next to each other as in "stereo" mode.
	if !stereo && config.ShowCoordinates {
		DrawCoordinateGrid(ct, config, plotTarget, GetViewAngleForConfig(config))
	}

	// * Stars:
	DrawStars(ct, config, starsToPlot, plotTarget, topLeft)

	// * Center mark:
	DrawCenterMark(ct, config, topLeft)

	// * Caption:
	err := DrawCaption(ct, config, fromStar, plotTarget, offsetDistance, topLeft)
	if err != nil {
		fmt.Print(err)
	}

	// * Chart legend, if enabled in configuration:
	if config.ShowLegend {
		DrawChartLegend(ct, config, topLeft)
	}

	// if stereo, draw a divider line for easier alignment and, if on the left side
	// of the chart, blank everything to the right of the divider,
	// since some labels on the left side can extend onto the right side if they're long enough.

	if stereo && topLeft.X == 0 {
		color := scheme.Colors.ConstellationLabels // a fairly subdued color
		DrawStereoDivider(ct, *color)

		bg := *scheme.Colors.Background
		width := float64(ct.Width())
		left := width/2.0 + 1.0
		right := width
		top := 0.0
		bottom := float64(ct.Height())
		DrawRectangle(ct, left, right, top, bottom, bg, bg)

	}
}
