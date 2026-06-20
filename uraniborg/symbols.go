// uraniborg/symbols.go: functions to draw fairly simple, individual symbols, such as a star, a motion marker, or the center marker.
// It also contains a few support functions used by more complex drawing operations.
// Labels for specific chart items belong in annotations.go.
// Drawing groups of items, like a bunch of star labels or motion markers, belongs in draw.go
package main

import (
	"math"

	"codeberg.org/astronexus/brahe"
	"github.com/fogleman/gg"
)

// ********
// Checking points for validity
// ********

// IsPointInRange checks to see if the given point [pt] is within the boundaries of the plot, as defined by the plot dimensions in [config].
func IsPointInRange(config UserConfiguration, pt ScreenPoint) bool {

	width := float64(config.Width)
	height := width / config.Aspect
	minBorder := 0.0 - GRID_BORDER
	maxBorder := 1.0 + GRID_BORDER

	return pt.X > minBorder*width && pt.X < maxBorder*width && pt.Y > minBorder*height && pt.Y < maxBorder*height
}

// EqualPoints compares two ScreenPoint objects [pt1] and [pt2] for equality.
// Since these are floating point, the check is for minimally small differences b/w the values, not strict equality.
func EqualPoints(pt1 ScreenPoint, pt2 ScreenPoint) bool {
	return math.Abs(pt1.X-pt2.X) < POINT_EQUALITY_CRITERION && math.Abs(pt1.Y-pt2.Y) < POINT_EQUALITY_CRITERION
}

// IsPointSet checks to see that the point [pt] does not have a zero value (= unset in Go)
func IsPointSet(pt ScreenPoint) bool {
	defaultPoint := ScreenPoint{X: 0.0, Y: 0.0}
	return !EqualPoints(pt, defaultPoint)
}

// ********
// Basic non-star symbols (e.g., motion arrows)
// ********

/*
DrawArrow draws an arrow symbol with its base at [basePoint] and the tip of its head at [headPoint],
using the specified chart color, to the image context [ct].
Specify length of the "head" as [arrowheadLen] and the angle between each line in the head and the line for the shaft
as [arrowheadAngle] (in degrees)
*/
func DrawArrow(ct *gg.Context, basePoint ScreenPoint, headPoint ScreenPoint, arrowheadLen float64, arrowheadAngle float64, color *ChartColor) {

	lineAngle := math.Atan2(headPoint.Y-basePoint.Y, headPoint.X-basePoint.X) + math.Pi
	ct.SetRGB(color.R, color.G, color.B)
	// Draw the main line
	ct.DrawLine(basePoint.X, basePoint.Y, headPoint.X, headPoint.Y)
	ct.Stroke()
	// Draw the two smaller arrowhead lines
	angle1 := lineAngle + brahe.ToRadians(arrowheadAngle)
	angle2 := lineAngle - brahe.ToRadians(arrowheadAngle)
	x1 := headPoint.X + arrowheadLen*math.Cos(angle1)
	y1 := headPoint.Y + arrowheadLen*math.Sin(angle1)
	x2 := headPoint.X + arrowheadLen*math.Cos(angle2)
	y2 := headPoint.Y + arrowheadLen*math.Sin(angle2)
	ct.DrawLine(headPoint.X, headPoint.Y, x1, y1)
	ct.Stroke()
	ct.DrawLine(headPoint.X, headPoint.Y, x2, y2)
	ct.Stroke()

}

/*
DrawCenterMark puts a crosshair-like mark at the center of the image defined by the graphics context [ct],
using the specified chart scheme [scheme] to define the size and color.
*/
func DrawCenterMark(ct *gg.Context, config UserConfiguration, topLeft ScreenPoint) {

	scheme := config.SchemeData

	markerData := *scheme.Symbols.CenterMarkSymbols
	lineLength := markerData.BarLength
	lineOffset := markerData.BarOffset

	color := *scheme.Colors.CenterMark
	ct.SetRGB(color.R, color.G, color.B)

	center := ScreenPoint{X: float64(config.Width) / 2.0, Y: float64(ct.Height()) / 2.0}
	// Center mark is always "at infinity" (stereo offset == 0)
	center = ApplyStereoOffset(center, 0, topLeft)

	ct.DrawLine(center.X-lineOffset-lineLength, center.Y, center.X-lineOffset, center.Y)
	ct.Stroke()
	ct.DrawLine(center.X+lineOffset+lineLength, center.Y, center.X+lineOffset, center.Y)
	ct.Stroke()
	ct.DrawLine(center.X, center.Y-lineOffset-lineLength, center.X, center.Y-lineOffset)
	ct.Stroke()
	ct.DrawLine(center.X, center.Y+lineOffset+lineLength, center.X, center.Y+lineOffset)
	ct.Stroke()
}

/*
DrawStereoDividerLine draws a vertical divider line through the middle of the chart, to make it easier to visually
align the two subcharts, using the color [lineColor].
*/

func DrawStereoDivider(ct *gg.Context, lineColor ChartColor) {
	x := float64(ct.Width()) / 2.0
	y := float64(ct.Height())
	ct.SetRGB(lineColor.R, lineColor.G, lineColor.B)
	ct.DrawLine(x, 0, x, y)
	ct.Stroke()
}

/*
DrawRectangle draws a rectangular area on the chart. The relevant x (horizontal) offsets are [left] and [right],
and the relevant y (vertical) ones are [top] and [bottom].
The color of the area and of the border are given by [areaColor] and [borderColor] respectively.
*/

func DrawRectangle(ct *gg.Context, left float64, right float64, top float64, bottom float64, areaColor ChartColor, borderColor ChartColor) {
	// Draw the interior area
	ct.DrawRectangle(left, top, right, bottom)
	ct.SetRGB(areaColor.R, areaColor.G, areaColor.B)
	ct.Fill()

	// Draw the borders
	ct.SetRGB(borderColor.R, borderColor.G, borderColor.B)
	ct.DrawLine(left, top, left, bottom)
	ct.Stroke()
	ct.DrawLine(right, top, right, bottom)
	ct.Stroke()
	ct.DrawLine(left, top, right, top)
	ct.Stroke()
	ct.DrawLine(left, bottom, right, bottom)
	ct.Stroke()
}

// ********
// Coordinate grid symbols
// ********

// DrawGridSegment draws a line between [currentPoint] and [previousPoint], in the current graphical context [ct].
// It returns a boolean indicating whether or not a segment was actually drawn.
func DrawGridSegment(ct *gg.Context, config UserConfiguration, currentPoint ScreenPoint, previousPoint ScreenPoint) bool {
	drawn := false
	color := config.SchemeData.Colors.CoordinateGrid
	// In general, when one of the 2 points is in bounds, it's desirable to have the line drawn and simply terminate at the edge.
	// Empty/unset points are equivalent to {0.0,0.0}, and so are out of bounds, but we never want to draw to them,
	// so need to check for those explicitly and not draw :
	if IsPointSet(previousPoint) {
		if IsPointInRange(config, currentPoint) || IsPointInRange(config, previousPoint) {
			ct.SetRGB(color.R, color.G, color.B)
			ct.DrawLine(previousPoint.X, previousPoint.Y, currentPoint.X, currentPoint.Y)
			ct.Stroke()
			drawn = true
		}
	}
	return drawn
}

// ********
// Star symbols
// ********

/*
GetStarSymbolGrayscaleLevel outputs the brightness level (0 = black, 1 = white) for the
specified magnitude delta [magDelta]. In a star chart context, magDelta is mags below (brighter than) a magnitude limit,
so if the limit is +6.50, a magDelta of +1.25 = mag +5.25. Detailed configuration for the level comes from
the chart scheme's symbol configuration [symbolConfig].
*/
func GetStarSymbolGrayscaleLevel(symbolConfig SchemeStarSymbols, magDelta float64) float64 {
	level := magDelta * symbolConfig.StarBrightnessChange
	if level < 0.0 {
		level = 0.0
	}
	if level > 1.0 {
		level = 1.0
	}

	if level < symbolConfig.MinStarLevel {
		level = symbolConfig.MinStarLevel
	} else if level > symbolConfig.MaxStarLevel {
		level = symbolConfig.MaxStarLevel
	}

	return level
}

/*
GetStarSymbolSize computes the size of the star symbol to render (in pixels) given a scheme's symbol configuration [symbolConfig] and a magnitude difference [magDelta].
*/
func GetStarSymbolSize(symbolConfig SchemeStarSymbols, magDelta float64) float64 {
	size := symbolConfig.BaseStarSize + magDelta*symbolConfig.StarSizeChange
	if size <= 1.0 {
		size = 1.0
	}
	return size
}

/*
DrawBaseStarSymbol draws the actual circular star symbol at the specified point [x],[y] with a given size and grayscale level (0.0 = full black to 1.0 = full white).
*/
func DrawBaseStarSymbol(ct *gg.Context, symbolConfig *SchemeStarSymbols, x float64, y float64, size float64, grayscaleLevel float64) {
	ct.DrawPoint(x, y, size)
	ct.SetRGB(grayscaleLevel, grayscaleLevel, grayscaleLevel)
	ct.Fill()
	starburstConfig := symbolConfig.Starburst
	if starburstConfig != nil {
		if starburstConfig.ImageSize > 0.0 && starburstConfig.ImageSize < size {
			spikeGrayscale := grayscaleLevel * starburstConfig.Brightness
			if spikeGrayscale >= 1.0 {
				spikeGrayscale = 1.0
			}
			ct.SetRGB(spikeGrayscale, spikeGrayscale, spikeGrayscale)
			lineLength := size * (starburstConfig.LineLength + 1.0)
			ct.DrawLine(x-lineLength, y, x+lineLength, y)
			ct.Stroke()
			ct.DrawLine(x, y-lineLength, x, y+lineLength)
			ct.Stroke()
		}
	}
}

/*
DrawStarSymbol plots the given star [star]'s position at [xDisplay],[yDisplay], for a given image context [ct] and user configuration [config].
*/
func DrawStarSymbol(ct *gg.Context, config UserConfiguration, star brahe.Star, xDisplay float64, yDisplay float64) error {

	magDiff := config.Magnitude - brahe.ApparentMagnitude(star)
	// Define size and grayscale level for the star, based on its current brightness
	scheme := config.SchemeData
	symbolConfig := scheme.Symbols.StarSymbols

	size := GetStarSymbolSize(*symbolConfig, magDiff)
	gsLevel := GetStarSymbolGrayscaleLevel(*symbolConfig, magDiff)

	DrawBaseStarSymbol(ct, symbolConfig, xDisplay, yDisplay, size, gsLevel)

	return nil

}
