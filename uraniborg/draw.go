// uraniborg/draw.go: Support functions for drawing complex chart items, such as a chart caption or legend,
// or for drawing large collections of items.
// Individual symbol definitions belong in symbols.go (for things like stars) or annotations.go (for things like star name labels and coordinate labels).
// Requires the graphics module github.com/fogleman/gg
package main

import (
	"fmt"
	"math"
	"sort"
	"strconv"

	"codeberg.org/astronexus/brahe"
	"github.com/fogleman/gg"
)

// *******
// Actual star chart drawing and plotting operations
// *******

// PlottedStar associates a star with its plotted position (a ScreenPoint).
// This allows for tracking stars for later purposes, such as labels/annotations (only want the ones actually plotted).
type PlottedStar struct {
	Star     brahe.Star
	Position ScreenPoint
}

func GetStereoOffset(star brahe.Star, config UserConfiguration, topLeft ScreenPoint) float64 {
	stereoOffset := 0.0
	// compute base stereo offset when applicable
	distance := brahe.Distance(star)
	if distance != 0 && config.StereoOffset != 0 {
		stereoOffset = 1.0 * config.StereoOffset / distance
	}
	// reverse it on one side of the plot:
	if topLeft.X == 0 {
		stereoOffset *= -1.0
	}
	return stereoOffset
}

/*
	ApplyStereoOffset applies an offset to a position based on the stereo offset [offset] and the stereo subplot's top left corner topLeft.

Returns the updated position.
*/
func ApplyStereoOffset(originalPosition ScreenPoint, stereoOffset float64, topLeft ScreenPoint) ScreenPoint {
	newPosition := ScreenPoint{originalPosition.X, originalPosition.Y}
	newPosition.X += stereoOffset
	if topLeft.X > 0 || topLeft.Y > 0 {
		newPosition.X += topLeft.X
		newPosition.Y += topLeft.Y
	}
	return newPosition
}

/*
DrawStarSymbols takes a list of Star objects [stars] and plots them to the chart context [ct]. The chart is centered on the point in space defined by [center].
Additional details for the plot come from the chart configuration [config].

Returns a list of stars successfully plotted along with their positions.
*/

func DrawStarSymbols(ct *gg.Context, config UserConfiguration, center brahe.CartesianVector, stars []brahe.Star, topLeft ScreenPoint) []PlottedStar {

	plottedStars := make([]PlottedStar, 0)
	for _, star := range stars {
		displayPosition := GetStarPosition(config, star, center)
		stereoOffset := GetStereoOffset(star, config, topLeft)
		if stereoOffset != 0 {
			displayPosition = ApplyStereoOffset(displayPosition, stereoOffset, topLeft)
		}
		if displayPosition.X > topLeft.X && displayPosition.Y > topLeft.Y && displayPosition.X < (float64(config.Width)+topLeft.X) && displayPosition.Y < float64(ct.Height()) {
			err := DrawStarSymbol(ct, config, star, displayPosition.X, displayPosition.Y)
			if err == nil {
				plottedStars = append(plottedStars, PlottedStar{Star: star, Position: displayPosition})
			} else {
				fmt.Printf("Warning: could not plot symbol for %v\n", star.Name)
			}

		}
	}
	return plottedStars

}

/*
DrawStarAnnotations takes a list of already-plotted Star objects [plottedStars] and adds labels for them to the chart context [ct]. The chart is centered on the point in space defined by [center],
and some labels depend on the exact identity of the star object at the center [toStar]. Additional details for the plot come from the chart configuration [config].
*/

func DrawStarAnnotations(ct *gg.Context, config UserConfiguration, toStar brahe.Star, plottedStars []PlottedStar, topLeft ScreenPoint) {
	if TIME_LOG_ENABLE {
		defer EndTime(Trace(ALERT_HEADER + " annotating the " + strconv.Itoa(len(plottedStars)) + " stars actually plotted."))
	}
	center := toStar.Position
	annotatedPoints := make([]ScreenPoint, 0)
	labelProximity := config.SchemeData.Labels.LabelProximity
	for _, plottedStar := range plottedStars {
		doLabel := true
		star := plottedStar.Star
		position := plottedStar.Position
		for _, existingAnnotation := range annotatedPoints {
			if math.Abs(position.X-existingAnnotation.X) <= labelProximity.X && math.Abs(position.Y-existingAnnotation.Y) <= labelProximity.Y {
				// Don't render this annotation (set of labels). It's too close to an existing one.
				doLabel = false
				break
			}
		}
		if doLabel {
			// ok to label, so add the label and then add it to the tracking list
			currentPosition := ScreenPoint{X: position.X, Y: position.Y}
			annotationGenerated := AnnotateStarSymbol(ct, config, star, center, toStar.ID, currentPosition, topLeft)
			if annotationGenerated {
				annotatedPoints = append(annotatedPoints, currentPosition)
			}
		}
	}
}

/*
DrawStars plots all the stars in the list [stars] to the mage context [ct]. The view is defined by a viewpoint at [fromStar] looking towards [toStar], which is centered.
Value [time] indicates the time before or since the epoch of J2000.0.
*/
func DrawStars(ct *gg.Context, config UserConfiguration, stars []brahe.Star, plotTarget brahe.Star, topLeft ScreenPoint) {
	if TIME_LOG_ENABLE {
		defer EndTime(Trace(ALERT_HEADER + " " + strconv.Itoa(len(stars)) + " stars potentially in range to plot."))
	}

	center := plotTarget.Position

	// Plot each star, centered on the target direction vector towards the target star. Label as appropriate.
	// This logic assumes the stars are sorted in *ascending* brightness, which ensures that bright stars will simply overplot dim ones.
	// Going the other way around requires extra logic to ensure that dim stars don't visibly appear on top of bright ones.

	plottedStars := DrawStarSymbols(ct, config, center, stars, topLeft)

	// Process annotations (name labels, motion markers, etc.)
	// This is best done brightest to dimmest (so that if there is a conflict, the brighter star gets the visible label.)
	sort.Slice(plottedStars, func(i, j int) bool {
		return brahe.ScaledLuminosity(plottedStars[i].Star) > brahe.ScaledLuminosity(plottedStars[j].Star)
	})
	DrawStarAnnotations(ct, config, plotTarget, plottedStars, topLeft)
}

/*
DrawConstellationNames draws constellation names to the graphic context [ct]. The user configuration [config] is needed to get information
like the font and style for the names, and the "target" star [targetStar] is needed to define the center of the chart.
*/
func DrawConstellationNames(ct *gg.Context, config UserConfiguration, plotTarget brahe.Star, topLeft ScreenPoint) error {
	scheme := config.SchemeData
	labelColor := scheme.Colors.ConstellationLabels
	center := plotTarget.Position
	polarCenter := brahe.CartesianToPolar(center)

	// load/set caption font, e.g.
	fontSize := float64(scheme.Fonts.Caption.Size)
	fontFile := GetFontDirectory() + scheme.Fonts.Caption.File
	if err := ct.LoadFontFace(fontFile, fontSize); err != nil {
		return err
	}
	for key := range brahe.CONSTELLATION_DATA {
		name := brahe.GetNameForConstellation(key)
		locations := brahe.GetLabelLocationsForConstellation(key)
		for _, location := range locations {
			ra := brahe.ToRadians(15.0 * location[0])
			dec := brahe.ToRadians(location[1])
			polarTarget := brahe.SphericalVector{ra, dec, 1.0} // this assumes that we're correctly translating everything to a new origin, in which case the distance doesn't matter. If it does matter, use 1000000 or something similarly huge
			if config.UseGalacticCoordinates {
				galacticCoordinates := brahe.EquatorialToGalactic(brahe.PolarToCartesian(polarTarget))
				polarTarget = brahe.CartesianToPolar(galacticCoordinates)
			}

			// Do a map projection on the cartesian coordinates.
			point := GetProjectedLocation(config, polarCenter, polarTarget)
			// Constellation names are always "at infinity" (stereo offset == 0)
			point = ApplyStereoOffset(point, 0, topLeft)

			// The point needs to be offset a bit so the text is centered
			offset := fontSize * float64(len(name)) / 4.0
			if point.X > topLeft.X && point.Y > topLeft.Y && point.X < float64(config.Width)+topLeft.X && point.Y < float64(ct.Height()) {
				ct.SetRGB(labelColor.R, labelColor.G, labelColor.B)
				ct.DrawString(name, point.X-offset, point.Y)
			}
		}
	}
	return nil
}

/*
DrawCoordinateGrid renders a polar coordinate grid (corresponding to R.A. + Dec or galactic longitude + latitude) to the specific context [ct].
The view is defined by a viewpoint at [fromStar] looking towards [toStar], which is centered.
*/

func DrawCoordinateGrid(ct *gg.Context, config UserConfiguration, plotTarget brahe.Star, selectionAngle float64) {
	if TIME_LOG_ENABLE {
		defer EndTime(Trace(ALERT_HEADER + " plotting coordinate grid."))
	}
	target := plotTarget.Position
	coords := GenerateCoordinateLineData(config, target, selectionAngle)
	err := AnnotateCoordinateLines(ct, config, coords)
	if err != nil {
		fmt.Print(err)
	}
}

// getFromLabel gets the label for the "From" or camera location point
func getFromLabel(fromStar brahe.Star, config UserConfiguration) string {
	fromTag := fromStar.Name
	fromConfig := GetStarConfigComponents(config.From)
	if len(fromConfig) > 1 {
		if len(fromConfig) == 4 {
			fromPosition, fromPositionErr := GetStarConfigPosition(fromConfig)
			if fromPositionErr == nil {
				fromTag += " " + PositionToString(fromPosition, config.UseLightyears)
			}
		}
	}
	return fromTag

}

// getToLabel gets the label for the "To" or camera orientation ("looking to") point
func getToLabel(toStar brahe.Star, config UserConfiguration) string {
	toTag := toStar.Name
	toConfig := GetStarConfigComponents(config.To)
	if len(toConfig) > 1 {
		if len(toConfig) == 4 {
			toPosition, toPositionErr := GetStarConfigPosition(toConfig)
			if toPositionErr == nil {
				toTag += " " + PositionToString(toPosition, config.UseLightyears)
			}
		} else if len(toConfig) == 3 {
			ra, _ := strconv.ParseFloat(toConfig[1], 64)
			dec, _ := strconv.ParseFloat(toConfig[2], 64)
			toTag += ": RA =" + fmt.Sprintf("%.4f", ra) + " hr, Dec = " + fmt.Sprintf("%.3f", dec) + " deg."
		}
	}
	return toTag

}

/*
DrawCaption renders a caption on the image context [ct] with information about the two stars [fromStar, toStar] that define the plot.
The distance of the current viewpoint from the Sun [distToSun] is also displayed when nonzero.
*/
func DrawCaption(ct *gg.Context, config UserConfiguration, fromStar brahe.Star, toStar brahe.Star, distToSun float64, topLeft ScreenPoint) error {
	if TIME_LOG_ENABLE {
		defer EndTime(Trace(ALERT_HEADER + " adding caption."))
	}
	fromTag := getFromLabel(fromStar, config)
	toTag := getToLabel(toStar, config)

	scheme := config.SchemeData
	captionColor := scheme.Colors.Caption
	labelConfig := scheme.Labels
	captionOffset := ScreenPoint{labelConfig.CaptionOffset.X, labelConfig.CaptionOffset.Y}

	// The caption is always "at infinity" (stereo offset == 0)
	captionOffset = ApplyStereoOffset(captionOffset, 0, topLeft)

	if err := ct.LoadFontFace(GetFontDirectory()+scheme.Fonts.Caption.File, float64(scheme.Fonts.Caption.Size)); err != nil {
		return err
	}

	dist := brahe.Distance(toStar)
	unit := "parsecs"

	if config.UseLightyears {
		dist = brahe.ParsecsToLightYears(dist)
		distToSun = brahe.ParsecsToLightYears(distToSun)
		unit = "light years"
	}
	distInfoLabel := "Distance " + strconv.FormatFloat(dist, 'f', 2, 64) + " " + unit + ". "
	distSunInfoLabel := ""
	// Label magnitude of the target if it's within a reasonable range (even if it's too dim to plot)

	targetMagnitude := brahe.ApparentMagnitude(toStar)
	if targetMagnitude < MAX_LABEL_MAGNITUDE {
		distInfoLabel += "Apparent magnitude " + strconv.FormatFloat(targetMagnitude, 'f', 2, 64)
	}
	if distToSun > PROXIMITY_LIMIT { // Don't need to label solar distance if already very close.
		distSunInfoLabel = "(" + strconv.FormatFloat(distToSun, 'f', 2, 64) + " " + unit + " from the Sun)"
	}
	ct.SetRGB(captionColor.R, captionColor.G, captionColor.B)
	// Display chart locations
	ct.DrawString("You are at: "+fromTag+" "+distSunInfoLabel, captionOffset.X, captionOffset.Y)
	ct.DrawString("Looking toward: "+toTag, captionOffset.X, captionOffset.Y*2.0)
	if dist <= PLACEHOLDER_DISTANCE {
		ct.DrawString(distInfoLabel, captionOffset.X, captionOffset.Y*3.0)
	}
	// Display time before or after epoch, if set
	time := config.Time
	if time != 0 {
		ct.DrawString("Years since 2000.0: "+strconv.FormatFloat(time, 'f', 3, 64), captionOffset.X, captionOffset.Y*4.0)
	}
	// Display notes, if set
	if config.Notes != "" {
		ct.DrawString(config.Notes, captionOffset.X, captionOffset.Y*5.0)
	}
	return nil
}

/*
DrawChartLegend draws a chart legend. This is currently a set of star symbols for each magnitude in the current chart's range (from 0 to the magnitude limit
set in [config]), drawn to the image context [ct].
*/

func DrawChartLegend(ct *gg.Context, config UserConfiguration, topLeft ScreenPoint) {
	// Get key values for color and label format.
	scheme := config.SchemeData
	captionColor := scheme.Colors.Caption
	backgroundColor := scheme.Colors.Background
	labelConfig := scheme.Labels
	symbolConfig := scheme.Symbols.StarSymbols
	captionInterval := labelConfig.CaptionOffset.Y
	err := ct.LoadFontFace(GetFontDirectory()+scheme.Fonts.Caption.File, float64(scheme.Fonts.Caption.Size))
	if err != nil {
		fmt.Printf("Warning: font %v could not be found. No legend will be drawn.\n", scheme.Fonts.Caption.File)
		return
	}
	// Determine how far to separate the symbols horizontally
	symbolSeparation := labelConfig.CaptionOffset.X * symbolConfig.LegendStarSeparation

	// Size the rectangle to contain all the symbols, one per unit of magnitude, with a little on either side.
	maxMag := int(math.Floor(config.Magnitude))
	intervals := maxMag + 2

	// The rectangle occupies the upper right corner of the screen.
	// The legend offset indicates how much the legend (rectangle plus all contents) should be shifted wrt. the
	// top right corner for a more visually appealing appearance.

	baseOffset := float64(config.Width)
	legendOffset := baseOffset * LEGEND_OFFSET
	rectRight := baseOffset - legendOffset + topLeft.X
	rectLeft := rectRight - (float64(intervals) * symbolSeparation)
	rectTop := legendOffset
	rectBottom := legendOffset + captionInterval*4.0

	// Draw a clean filled rectangle (fill with background color; "edge" with caption color.)
	DrawRectangle(ct, rectLeft, rectRight, rectTop, rectBottom, *backgroundColor, *captionColor)

	// Define starting horizontal (x) position for the symbols
	symbolX := rectLeft + symbolSeparation

	// The label offset is the number of pixels to shift the star magnitude labels leftward, so they are
	// centered underneath the star symbols. This shouldn't be a fixed quantity; it needs to scale
	// with the caption font size over a reasonable range of sizes.
	labelOffset := float64(scheme.Fonts.Caption.Size) / 4.0
	labelX := symbolX - labelOffset

	// Define where the star symbols and their labels go vertically
	headerY := legendOffset + captionInterval
	symbolY := legendOffset + captionInterval*2.0
	labelY := legendOffset + captionInterval*3.25

	// Draw header for this legend
	ct.SetRGB(captionColor.R, captionColor.G, captionColor.B)
	ct.DrawString("Stellar Magnitudes", symbolX, headerY)

	// Draw the symbols and labels
	for i := 0; i <= maxMag; i++ {
		// Draw star symbols
		symbolMagnitude := float64(i)
		magDiff := config.Magnitude - symbolMagnitude
		size := GetStarSymbolSize(*symbolConfig, magDiff)
		grayscaleLevel := GetStarSymbolGrayscaleLevel(*symbolConfig, magDiff)
		DrawBaseStarSymbol(ct, symbolConfig, symbolX, symbolY, size, grayscaleLevel)
		// Draw labels
		magLabel := strconv.Itoa(i)
		ct.SetRGB(captionColor.R, captionColor.G, captionColor.B)
		ct.DrawString(magLabel, labelX, labelY)

		symbolX += symbolSeparation
		labelX += symbolSeparation

	}

}
