// uraniborg/projection.go: Support functions for 2D map projections.
// Requires the graphics module github.com/fogleman/gg
package main

import (
	"math"

	"codeberg.org/astronexus/brahe"
)

/*
ProjectPoint does a map projection of the point represented by 3-vector [target] onto a projection plane with center defined by 3-vector [center]
[projectionType] is an integer representing the type of projection to do.
It returns a 2-vector of the projected x and y coordinates, without any scaling.
-------
Currently supported projection types:
1 = orthographic
2 = stereographic
3 = Azimuthal equidistant
4 = Lambert equal-area
*/

func ProjectPoint(center brahe.SphericalVector, target brahe.SphericalVector, projectionType int) [2]float64 {
	outsideBounds := -100.0 // set to something arbitrarily large and negative to prevent plotting
	var proj [2]float64

	th0 := center[0]
	th1 := target[0]

	p0 := center[1]
	p1 := target[1]

	sth := math.Sin(th1 - th0)
	cth := math.Cos(th1 - th0)

	sp0 := math.Sin(p0)
	sp1 := math.Sin(p1)

	cp0 := math.Cos(p0)
	cp1 := math.Cos(p1)

	// k: the "multiplier" for distance from center in the actual flat projected image
	k := 1.0

	// the following are "base" values for x and y in the projection.
	x := cp1 * sth
	y := cp0*sp1 - (sp0 * cp1 * cth)

	// handle  factors for other projection types:
	// c0 is the angle b/w center and point to plot
	c0 := sp0*sp1 + (cp1 * cp0 * cth)

	// c is the angle where cos c0 = c; c is needed for some projections
	c := math.Acos(c0)

	switch projectionType {
	case PROJ_ORTHOGRAPHIC:
		k = 1.0
		if math.Abs(c) > math.Pi/2.0 {
			k = outsideBounds
		}
	case PROJ_STEREOGRAPHIC:
		if c0 != -1.0 {
			k = 2.0 / (1.0 + c0)
		} else {
			k = outsideBounds
		}
	case PROJ_EQUIDISTANT: // Azimuthal equidistant
		if c != 0 {
			k = c / math.Sin(c)
		} else {
			k = 1.0
		}
	case PROJ_EQUAL_AREA: // Lambert equal-area
		k = math.Sqrt(2.0 / (1.0 + c0))
	default: // orthographic
		k = 1.0
		if math.Abs(c) > math.Pi/2.0 {
			k = outsideBounds
		}
	}
	proj[0] = x * k
	proj[1] = y * k
	return proj
}

/*
GetProjectedLocation applies a map projection to get a 2-D coordinate to plot, for a given center point [polarCenter]
and "target" point [polarTarget] in polar coordinates.
The details of the projection (including the type of map projection and the scale to use) come from the config object [config].
The graphic context defines the exact scale in pixels.
Returns the x + y coordinates for the projection, in pixels.
*/
func GetProjectedLocation(config UserConfiguration, polarCenter brahe.SphericalVector, polarTarget brahe.SphericalVector) ScreenPoint {
	projectionType := config.Projection
	scale := config.Scale
	chartWidth := float64(config.Width) // can also inspect the ct object if desired
	chartAspect := config.Aspect
	chartHeight := chartWidth / chartAspect

	displayX := 0.0
	displayY := 0.0
	proj := ProjectPoint(polarCenter, polarTarget, projectionType)
	projX := proj[0]
	projY := proj[1]

	// (0,0) is at center of plot, and the sense of x and y in the projection formulas
	// is opposite that of bitmap graphics operations.

	displayX = (0.5 - (projX * scale / chartAspect)) * chartWidth
	displayY = (0.5 - (projY * scale)) * chartHeight

	return ScreenPoint{displayX, displayY}
}
