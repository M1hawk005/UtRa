// uraniborg/grid.go: Support functions for displaying a grid of equatorial (RA + Dec) or galactic (galactic longitude + latitude) coordinates.
// Will work with other polar, longitude- and latitude-like coordinate sets (e.g. ecliptic longitude + latitude) with the correct rotations of the base coordinates.
// Requires the graphics module github.com/fogleman/gg

// The variable name convention throughout is "lat" for the latitude-like one (e.g. declination or galactic latitude),
// and "long" for the longitude-like one (e.g. right ascension or galactic longitude).

package main

import (
	"math"

	"codeberg.org/astronexus/brahe"
)

// GenerateGridCoordinateVector takes an *integer* longitude-like coordinate in degrees [long] and an *integer* latitude-like coordinate in degrees [lat] and returns
// a 3-vector in conventional spherical coordinates.
// The rationale here is the grid will not need to be drawn finer than a 1x1 degree grid in this application, and integer math helps keep things simpler.
func GenerateGridCoordinateVector(long int, lat int) brahe.SphericalVector {
	longRad := brahe.ToRadians(float64(long))
	latRad := brahe.ToRadians(float64(lat))
	sphericalCoordinates := brahe.SphericalVector{longRad, latRad, 1.0} // distance can be arbitrary
	return sphericalCoordinates
}

// GenerateCoordinateLineData takes a center point [center], and a limiting angle [selectionAngle], and determines segments of coordinate lines that can be drawn.
func GenerateCoordinateLineData(config UserConfiguration, center brahe.CartesianVector, selectionAngle float64) map[int]ScreenPoint {
	polarCenter := brahe.CartesianToPolar(center)
	coords := make(map[int]ScreenPoint)
	count := 0
	dircos := math.Cos(selectionAngle)
	// account for aspect ratio. If it differs from 1 (especially if >> 1), lines will get "clipped".
	angleRange := config.Aspect
	if angleRange < 1.0 {
		angleRange = 1.0
	}

	// Get the intervals for display. We only need to display points along the grid lines actually plotted. E.g., if we're displaying longitude-like (such as RA) every 2 hours (30 degrees) we
	// only need to get RA points where the RA is divisible by 30.

	// Can optimize further by determining if this plot contains a pole.
	// If a pole is in bounds, then the chart's longitude interval will be large, and so it's possible
	// to further reduce the number of calculated points.
	northPole := GenerateGridCoordinateVector(0, MAX_LAT)
	northPolePoint := GetProjectedLocation(config, polarCenter, northPole)
	southPole := GenerateGridCoordinateVector(0, MIN_LAT)
	southPolePoint := GetProjectedLocation(config, polarCenter, southPole)
	isPoleInPlot := IsPointInRange(config, northPolePoint) || IsPointInRange(config, southPolePoint)

	displayIntervals := GetCoordinateDisplaySteps(config.Scale, isPoleInPlot)
	longInterval := displayIntervals[0]
	latInterval := displayIntervals[1]

	// Generate points to display.

	for long := MIN_LONG; long <= MAX_LONG; long++ {
		for lat := MIN_LAT; lat <= MAX_LAT; lat++ {
			if long%longInterval == 0 || lat%latInterval == 0 {
				key := MapCoordinatesToCoordinateID(long, lat)
				// this lets us get long and lat as exact integers while retaining order. Keys sort in order of increasing long and then increasing lat for a given
				// value of long. E.g., using equatorial coordinates, the order is RA = 0, Dec= -90; RA = 0, Dec =-89 ... RA=0, Dec= +90, RA = 1, Dec= -90 ...

				// To restore lat and long: long = floor(key / 1000) and lat = key modulo 1000 - 90
				gridPoint := GenerateGridCoordinateVector(long, lat)

				// do some bounds checking against the plot's allowed plot angle. Only points within these bounds will be retained.
				cartesianPoint := brahe.PolarToCartesian(gridPoint)
				if dircos <= angleRange*brahe.DirectionCosine(center, cartesianPoint) {
					pt := GetProjectedLocation(config, polarCenter, gridPoint)
					coords[key] = pt
					count += 1
				}
			}
		}
	}

	return coords
}

// GetCoordinateDisplaySteps determines the intervals, in degrees, between grid lines for a given chart scale [scale].
// Set [polar] = true if the chart contains a celestial pole; otherwise, some settings will produce too many RA lines.
func GetCoordinateDisplaySteps(scale float64, polar bool) [2]int {

	var long int
	var lat int
	var coords [2]int

	long = -1
	lat = -1

	if scale <= MAX_GRID_SCALE && scale > 12.0 {
		long = 1
		lat = 1
	} else if scale <= 12.0 && scale > 10.0 {
		long = 2
		lat = 1
	} else if scale <= 10.0 && scale > 6.0 {
		long = 3
		lat = 2
	} else if scale <= 6.0 && scale > 4.0 {
		long = 3
		lat = 3
	} else if scale <= 4.0 && scale > 2.0 {
		long = 5
		lat = 5
	} else if scale <= 2.0 && scale > 1.0 {
		long = 15
		lat = 15
	} else if scale > MIN_GRID_SCALE {
		long = 30
		lat = 30
	}

	if polar {
		// Any view that contains a pole is going to draw all the chosen longitude-like lines in a small space.
		// Always use the maximum spacing in that case.
		long = 30
	}
	coords[0] = long
	coords[1] = lat

	return coords
}

// MapCoordinateIDToCoordinates takes the ID number [id] for a point and turns it into the longitude and latitude in degrees.
// The format of the ID is (1000 * long in degrees) + (lat+ 90) in degrees.
// Adding +90 to the lat ensures that all values are non-negative.
// Example: For long = 2 hr (30 degrees), lat = +12 degrees: ID = 30102 (30,000 for the long of 30 degrees, 90+12 for the lat of +12 degrees)
// This ID format is to make it easy to use as a sortable key for maps of coordinates to other things, like x / y points in a plot.
func MapCoordinateIDToCoordinates(id int) [2]int {
	var pt [2]int
	pt[0] = id / 1000
	pt[1] = (id % 1000) - MAX_LAT
	return pt
}

// MapCoordinatesToCoordinateID takes two coordinates [long] and [lat], in degrees, and turns them into an ID for use in
// other data structures.
// Note that the latitude value is actually MAX_LAT + latitude, to keep the values all non-negative.
func MapCoordinatesToCoordinateID(long int, lat int) int {
	return 1000*long + (lat + MAX_LAT)
}
