// uraniborg/annotations.go: functions to draw star labels, star motion markers, coordinate lines, and similar chart labels.
// "Primitive" (small/basic) symbols belong in symbols.go.
// Rendering more complex groups of objects or labels belongs in draw.go.
// Very high-level plotting logic (e.g., iterating over multiple groups of objects to plot) belongs in chart.go.
package main

import (
	"fmt"
	"math"
	"strconv"

	"codeberg.org/astronexus/brahe"
	"github.com/fogleman/gg"
)

/* Add various things to star symbols */

// ********
// Primary star annotation actions
// ********

/*
GetLabelPriorityOrder defines the priority order for labels in the chart.
Earlier values in the list have priority over later ones. In general, the first
nonempty label found in this list will be used as the primary label, and the next nonempty one
as the secondary label. The order contained in the repository is the same as the default
order given in current versions of the brahe package.

This is a fairly complex setting, so don't want to overcomplicate things early on.
*/
func GetLabelPriorityOrder() []int {
	priorities := []int{
		brahe.LABEL_PROPER_ID,
		brahe.LABEL_BAYER_ID,
		brahe.LABEL_FLAMSTEED_ID,
		brahe.LABEL_HR_ID,
		brahe.LABEL_GLIESE_ID,
		brahe.LABEL_HIP_ID,
		brahe.LABEL_TYCHO_ID,
		brahe.LABEL_GAIA_ID}
	return priorities
}

/*
AnnotateStarSymbol adds various labels and markers to the star symbol for [star] on the image context [ct].
Requires information from the user configuration [config], as well as the star's currently plotted location [plotPosition],
as well as chart data needed to generate the star's label, such as the chart center [center]
Returns a boolean indicating whether or not annotations were generated.
*/
func AnnotateStarSymbol(ct *gg.Context, config UserConfiguration, star brahe.Star, center brahe.CartesianVector, targetID int, plotPosition ScreenPoint, topLeft ScreenPoint) bool {
	// Handle motions. If config.ShowMotions is false, we are done; it's been taken care of by requesting data for a
	// given time and rendering the (appropriately moved) star symbol.
	// If it is true, need to render an arrow pointing to the location the star was (or will be) based on
	// the time interval in question.
	displayMotion := false
	if config.Time != 0.0 && config.ShowMotions {
		// Determine where the star would be at the specific time
		time := config.Time
		starAtTime := brahe.SelfTranslateStar(star, time)
		translatedPolarPosition := brahe.CartesianToPolar(starAtTime.Position)
		newPosition := GetProjectedLocation(config, brahe.CartesianToPolar(center), translatedPolarPosition)
		stereoOffset := GetStereoOffset(starAtTime, config, topLeft)
		if stereoOffset != 0 {
			newPosition = ApplyStereoOffset(newPosition, stereoOffset, topLeft)
		}
		displayMotion = DrawMotionSymbol(ct, config, plotPosition, newPosition)
	}
	// Add a suitable label to the star symbol.
	labelGenerated := DrawTextLabels(ct, config, star, targetID, plotPosition, displayMotion)
	return labelGenerated
}

/*
DrawMotionSymbol draws an arrow from the given star [star]'s current plotted position [oldPosition] to where it will be at a given past or future time [newPosition].
The time is given in the configuration, in years.
The return value indicates whether or not a motion symbol was drawn. This is important to determine whether or not the
star needs special label content or style (e.g. color).
*/
func DrawMotionSymbol(ct *gg.Context, config UserConfiguration, oldPosition ScreenPoint, newPosition ScreenPoint) bool {
	scheme := config.SchemeData
	motionSymbols := scheme.Symbols.MotionSymbols
	markerDrawn := false
	// For proper motions above a certain length on the display, draw a marker pointing to the new position
	motionPx := math.Sqrt(math.Pow(oldPosition.X-newPosition.X, 2) + math.Pow(oldPosition.Y-newPosition.Y, 2))
	if motionPx > motionSymbols.MinimumLength && motionPx < float64(ct.Width()) {
		DrawArrow(ct, oldPosition, newPosition, motionSymbols.ArrowheadLength, motionSymbols.ArrowheadAngle, scheme.Colors.MotionLabel)
		markerDrawn = true
	}

	return markerDrawn
}

/*
GetStarLabelColor gets the color to use for a given star [star]'s label. The color can differ for stars that match the current target ID
or which show stellar motion markers; the information for these details are in the user config [config], the chart target's ID value [targetID],
and the "show proper motion marker" flag [showMotions].
*/
func GetStarLabelColor(config UserConfiguration, star brahe.Star, targetID int, showMotions bool, highlight bool) *ChartColor {
	scheme := config.SchemeData
	colors := scheme.Colors
	annotateMag := config.MagnitudeLabel
	labelType := config.LabelType
	showIfNamed := annotateMag == 0.0 && star.Designations.ProperName != ""
	lowDistance := false

	dist := brahe.Distance(star)
	annotateDist := config.DistanceLabel
	if config.UseLightyears {
		annotateDist = brahe.LightYearsToParsecs(annotateDist)
	}
	if dist < annotateDist {
		lowDistance = true
	}
	mag := brahe.ApparentMagnitude(star)

	// The center ("to") star gets a special label if it's otherwise unlabeled:
	isTarget := star.ID == targetID

	// Assign color based on various types of label.
	color := new(ChartColor)
	if highlight {
		// Highlighted stars get a specific color label, regardless of other details
		color = colors.HighlightedStars
	} else if lowDistance {
		color = colors.DistanceLabel
	} else if mag <= annotateMag || showIfNamed || labelType == LABEL_STAR_ATLAS {
		color = colors.MainLabel
	} else if showMotions {
		color = colors.MotionLabel
	} else if isTarget || star.ID == brahe.ATHYG_SUN_ID {
		color = colors.CenterMark
	} else {
		return nil
	}
	return color
}

/*
getStarTextLabels gets a primary and secondary star label based on hte "label type" in the configuration.
Label levels currently work like this:
		Level 0: [default] Just the top (primary) label on one line.
		Level 1: Just the star's full name (usually primary+secondary label) on one line
		Level 2: Top 2 labels on separate lines
		Level 3: "Star atlas" mode. Only Bayer and/or Flamsteed labels, no constellation ID, for most stars.
*/

func getStarTextLabels(star brahe.Star, scheme *ChartScheme, color *ChartColor, labelLevel int) (string, string) {
	stdPrimary, stdSecondary := brahe.GetAthygStarLabels(&star, GetLabelPriorityOrder())

	primaryLabel := ""
	secondaryLabel := ""

	switch labelLevel {
	case LABEL_PRIMARY:
		{
			primaryLabel = stdPrimary
		}
	case LABEL_NAME:
		{
			primaryLabel = star.Name
		}
	case LABEL_SECONDARY:
		{
			primaryLabel = stdPrimary
			secondaryLabel = stdSecondary
		}
	case LABEL_STAR_ATLAS:
		{
			if color == scheme.Colors.MainLabel {
				// Only the main label is subject to having just a single Bayer and/or Flamsteed ID.
				if star.Designations.Bayer != "" {
					primaryLabel = brahe.MapGreekLetterName(star.Designations.Bayer) + " " + star.Constellation
					secondaryLabel = star.Designations.ProperName
				} else if star.Designations.Flamsteed != "" {
					primaryLabel = star.Designations.Flamsteed + " " + star.Constellation
					secondaryLabel = star.Designations.ProperName
				}
			} else {
				// Things like nearby stars or stars with significant motion. These are handled like a LABEL_SECONDARY.
				primaryLabel = stdPrimary
				secondaryLabel = stdSecondary
			}
		}
	default:
		{
			primaryLabel = stdPrimary
		}
	}
	return primaryLabel, secondaryLabel
}

// isCurrentStarHighlighted checks to see if the current star should be highlighted with  a special color.
func isCurrentStarHighlighted(star brahe.Star, config UserConfiguration) bool {
	highlight := false

	for _, v := range config.HighlightIds {
		if v == star.ID {
			highlight = true
			break
		}
	}
	return highlight
}

// showSecondaryLabel checks to see if the secondary label determined for a star should be shown.
// In general, it must appear if the "label secondary" option is chosen and the secondary label differs from the primary.
func showSecondaryLabel(primaryLabel string, secondaryLabel string, labelLevel int) bool {
	drawLabel := false
	if labelLevel == LABEL_SECONDARY || labelLevel == LABEL_STAR_ATLAS {
		if secondaryLabel != "" && secondaryLabel != primaryLabel {
			drawLabel = true
		}
	}
	return drawLabel
}

/*
DrawTextLabels labels a given Star object [star], plotted at [plotPosition], with various text labels on the image context [ct].

Uses information such as configuration options in [config], the ID of the designated target [targetID], and whether
or not proper motion indicators should be drawn [showMotions].

Returns a boolean indicating whether a label was drawn.
*/
func DrawTextLabels(ct *gg.Context, config UserConfiguration, star brahe.Star, targetID int, plotPosition ScreenPoint, showMotions bool) bool {
	scheme := config.SchemeData

	// Check to see if the star should be highlighted specially:
	highlight := isCurrentStarHighlighted(star, config)

	annotationDrawn := false
	labelLevel := config.LabelType
	color := GetStarLabelColor(config, star, targetID, showMotions, highlight)
	if color != nil {
		ct.SetRGB(color.R, color.G, color.B)

		// Label levels work like this:
		// Level 0: [default] Just the top (primary) label on one line.
		// Level 1: Just the star's full name (usually primary+secondary label) on one line
		// Level 2: Top 2 labels on separate lines
		// Level 3: "Star atlas" mode. Only Bayer and/or Flamsteed labels, no constellation ID, for most stars.

		primaryLabel, secondaryLabel := getStarTextLabels(star, scheme, color, labelLevel)

		// Stars flagged as either nearby or with their motions shown get a distance label
		dist := brahe.Distance(star)
		distDisplay := dist
		unit := "pc"
		distLimit := config.DistanceLabel
		if config.UseLightyears {
			distDisplay = brahe.ParsecsToLightYears(dist)
			unit = "ly"
			distLimit = brahe.LightYearsToParsecs(distLimit)
		}
		if dist < distLimit || showMotions {
			primaryLabel += " [" + strconv.FormatFloat(distDisplay, 'f', 1, 64) + " " + unit + "]"
		}

		// everything looks good to this point; render the first (and possibly only) label
		annotationDrawn = true
		labelOffset := scheme.Labels.LabelOffset
		labelX := plotPosition.X + labelOffset.X
		labelY := plotPosition.Y
		ct.DrawString(primaryLabel, labelX, labelY)

		if labelLevel > LABEL_NAME {
			// LABEL_NAME is names-only; all larger numbers must render the primary label as such, since it is sometimes not a name.
			// Just show the primary label for level <= 1; otherwise, determine whether or not the secondary should be shown
			labelY += labelOffset.Y
			if showSecondaryLabel(primaryLabel, secondaryLabel, labelLevel) {
				ct.DrawString(secondaryLabel, labelX, labelY)
			}

		}
	}
	return annotationDrawn
}

// ********
// Additional support for specific annotation types
// ********

/*
PositionToString takes a 3-vector of position data [pos] and creates a text representation of it.
By default, the positions are in parsecs. [useLy] toggles a conversion to light years.
*/
func PositionToString(pos brahe.CartesianVector, useLy bool) string {
	x := pos[0]
	y := pos[1]
	z := pos[2]
	unit := "pc"

	if useLy {
		x = brahe.ParsecsToLightYears(x)
		y = brahe.ParsecsToLightYears(y)
		z = brahe.ParsecsToLightYears(z)
		unit = "ly"
	}

	// Position string looks like "(x.xx pc, y.yy pc, z.zz pc)" or the equivalent in ly

	xstr := strconv.FormatFloat(x, 'f', 2, 64)
	ystr := strconv.FormatFloat(y, 'f', 2, 64)
	zstr := strconv.FormatFloat(z, 'f', 2, 64)

	return "(" + xstr + " " + unit + ", " + ystr + " " + unit + ", " + zstr + " " + unit + ")"
}

/*
AnnotateCoordinateIntersection labels the specified point [point] with the specified label text [label].
In normal use, this will be an intersection point of two coordinate grid lines.
*/
func AnnotateCoordinateIntersection(ct *gg.Context, config UserConfiguration, label string, point ScreenPoint) error {

	color := config.SchemeData.Colors.CoordinateGrid

	ct.SetRGB(color.R, color.G, color.B)
	labelX := point.X + GRID_LABEL_X_OFFSET
	labelY := point.Y + GRID_LABEL_Y_OFFSET
	ct.DrawString(label, labelX, labelY)
	return nil
}

func isPlottedPolarPoint(testPoint ScreenPoint, config UserConfiguration) bool {
	return IsPointSet(testPoint) && IsPointInRange(config, testPoint)
}

/*
AnnotateCoordinateLines adds coordinate lines based on the supplied map of coordinates
[coords] to 2D points and the given step intervals.
*/
func AnnotateCoordinateLines(ct *gg.Context, config UserConfiguration, coords map[int]ScreenPoint) error {
	// Check to see if a celestial pole exists inside the plot.
	// The coordinate grid size calculator will restrict the number of possible R.A. lines
	// if there is a pole, to avoid congestion.
	hasPole := false

	scpPoint := coords[MapCoordinatesToCoordinateID(0, -90)]
	ncpPoint := coords[MapCoordinatesToCoordinateID(0, 90)]

	if isPlottedPolarPoint(ncpPoint, config) || isPlottedPolarPoint(scpPoint, config) {
		hasPole = true
	}
	// Determine the intervals of RA and Dec to use. Lines will only be plotted at specific values of each.
	steps := GetCoordinateDisplaySteps(config.Scale, hasPole)
	raStep := steps[0]
	decStep := steps[1]
	if raStep <= 0 || decStep <= 0 {
		// this is normal for some scale ranges; it just means "don't plot"
		return nil
	}
	for key, point := range coords {
		eqCoords := MapCoordinateIDToCoordinates(key)
		ra := eqCoords[0]
		dec := eqCoords[1]
		raDrawn := false
		decDrawn := false

		if ra%raStep == 0 && dec > -90 {
			prevPointID := MapCoordinatesToCoordinateID(ra, dec-1)
			prevPoint := coords[prevPointID]
			raDrawn = DrawGridSegment(ct, config, point, prevPoint)
		}
		if dec%decStep == 0 && ra > 0 {
			prevPointID := MapCoordinatesToCoordinateID(ra-1, dec)
			prevPoint := coords[prevPointID]
			decDrawn = DrawGridSegment(ct, config, point, prevPoint)
		}

		if raDrawn && decDrawn && math.Abs(float64(dec)) < 90 {
			// At an intersection of the coordinate lines
			// Note that R.A. is given in degrees instead of hours. This is because, far from the Earth, the
			// connection to sidereal time doesn't exist, and the grid is more useful as a general indicator of
			// scale.

			if ra >= 360 { // Conventionally R.A. runs 0 to 359.999...; exactly 360 is usually labeled as 0
				ra -= 360
			}

			raLabel := strconv.Itoa(ra) + "°"
			decLabel := strconv.Itoa(dec) + "°"
			label := raLabel + ", " + decLabel
			err := AnnotateCoordinateIntersection(ct, config, label, point)
			if err != nil {
				fmt.Printf("Could not print a label for %v.\n", label)
			}

		}
	}
	return nil
}
