// utils.go contains various utility methods not logically grouped elsewhere.

package brahe

import (
	"math"
	"strings"

	"gonum.org/v1/gonum/floats"
)

/*  ---------------------------- */
/*  Basic astronomy calculations */
/*  ---------------------------- */

// ToRadians takes a float64, understood to be decimal degrees, and returns its equivalent in radians.
func ToRadians(deg float64) float64 {
	return deg * math.Pi / 180.0
}

// ToDegrees takes a float64, understood to be radians, and returns its equivalent in decimal degrees.
func ToDegrees(rad float64) float64 {
	return rad * 180.0 / math.Pi
}

// ParsecsToLightYears takes a float64 representing parsecs and returns the equivalent number of light years.
func ParsecsToLightYears(pc float64) float64 {
	return pc * PC_TO_LY
}

// LightYearsToParsecs takes a float64 representing light years and returns the equivalent number of parsecs.
func LightYearsToParsecs(ly float64) float64 {
	return ly / PC_TO_LY
}

// ParsecPerYearToKmPerSec converts parsecs/year to km/sec
func ParsecPerYearToKmPerSec(pcPerYear float64) float64 {
	return pcPerYear * PCYR_TO_KMSEC
}

// KmPerSecToParsecPerYear converts km/sec to parsecs/year
func KmPerSecToParsecPerYear(kms float64) float64 {
	return kms / PCYR_TO_KMSEC
}

/*  -------------------------------------------------------- */
/*  Functions for interacting with AT-HYG based Star objects */
/*  (see types.go for field definitions)                     */
/*  -------------------------------------------------------- */

// CloneStar returns a deep (no retained references) copy of the specified star data object [originalStar].
func CloneStar(originalStar Star) Star {
	var newPosition CartesianVector
	var newVelocity CartesianVector
	// Ensure that the positions and velocities (which are slices) are deep copies. The rest (numeric and string values) will deep-copy automatically on assigning a new variable.
	newPosition = make([]float64, len(originalStar.Position))
	newVelocity = make([]float64, len(originalStar.Velocity))
	copy(newPosition, originalStar.Position)
	copy(newVelocity, originalStar.Velocity)
	clonedStar := Star{originalStar.ID,
		newPosition,
		newVelocity,
		originalStar.Designations,
		originalStar.Name,
		originalStar.AbsoluteMag,
		originalStar.Spectrum,
		originalStar.Constellation,
		originalStar.Luminosity,
	}

	return clonedStar
}

/*
ApparentMagnitude returns the specified star's apparent magnitude from its current position and absolute magnitude.
This assumes the position is in parsecs.

Don't use this for sorting long lists. The Log10() is expensive in a comparison function. Use ScaledLuminosity(star) instead.
*/
func ApparentMagnitude(star Star) float64 {
	d2 := floats.Norm(star.Position, 2.0)
	if d2 < PLACEHOLDER_APP_DIST {
		return PLACEHOLDER_APP_MAG
	} else {
		return star.AbsoluteMag + 5.0*math.Log10(d2) - 5.0
	}
}

// Distance returns the specified star's current distance, in the same units as the Cartesian velocity components.
func Distance(star Star) float64 {
	d := floats.Norm(star.Position, 2.0)
	return d
}

// AbsMagToLuminosity calculates the luminosity (in terms of the Sun and visual magnitude) from the given star's absolute magnitude [absmag].
func AbsMagToLuminosity(absmag float64) float64 {
	luminosity := math.Pow(10.0, 0.40*(SOL_ABSMAG-absmag))
	return luminosity
}

/*
ScaledLuminosity calculates a quantity that is rigorously proportional to the apparent brightness (based on apparent visual magnitude), but much more quickly.
This is primarily useful as a comparison function for sorts. Luminosity / distance^2 is proportional to apparent brightness,
but much faster to calculate from the data stored in a Star object, because there are no logs or square roots to calculate.
*/
func ScaledLuminosity(star Star) float64 {
	d2 := floats.Norm(star.Position, 2.0)
	return star.Luminosity / (d2 * d2)
}

/*
DistanceDelta calculates the distance change for a given star object [star] over the specified time in years [time]. It returns a Cartesian vector with the
relevant distance deltas in each component.
*/
func DistanceDelta(star Star, time float64) CartesianVector {
	delta := make([]float64, len(star.Velocity))
	copy(delta, star.Velocity)
	floats.Scale(time, delta)
	return delta
}

/*  ------------------------------------- */
/*  Managing Greek vs Latin names/letters */
/*  ------------------------------------- */

/*
MapGreekLetterName takes a Latin version of a Greek letter and returns the appropriate Unicode character for the Greek letter.
Note: The 3-letter format for one set of Latin versions is from the digital version of the Yale Bright Star Catalog. It is present in
HYG and AT-HYG for space reasons.
*/
func MapGreekLetterName(name string) string {
	var GreekLetters []string      // Unicode Greek letters
	var FullLatinVersions []string // Latinized Greek letter names as they appear in standard English and in astronomical literature
	var LatinVersions []string     // 3-letter abbreviations of the Latinized Greek letter names

	GreekLetters = []string{"α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", "ν", "ξ", "ο", "π", "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω"}
	LatinVersions = []string{"alp", "bet", "gam", "del", "eps", "zet", "eta", "the", "iot", "kap", "lam", "mu", "nu", "xi", "omi", "pi", "rho", "sig", "tau", "ups", "phi", "chi", "psi", "ome"}
	FullLatinVersions = []string{"alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega"}

	found := false

	name = strings.ToLower(name)

	// look in the full Latinized names of the letters
	for i, letterName := range FullLatinVersions {
		if strings.Index(name, letterName) == 0 { // Match is at beginning; replace with actual Greek letter
			name = strings.Replace(name, letterName, GreekLetters[i], 1)
			found = true
			break
		}
	}

	if !found {
		// look in the abbreviations (the form found in HYG and AT-HYG)
		for i, letterName := range LatinVersions {
			if strings.Index(name, letterName) == 0 {
				name = strings.Replace(name, letterName, GreekLetters[i], 1)
				found = true
				break
			}
		}
	}

	return name
}

/*  --------------------- */
/*  Vector calculations   */
/*  --------------------- */

/*
CartesianToPolar turns a 3-vector of Cartesian coordinates [v1] into polar coordinates in radians.
Convention: theta-phi-r, where:

1) theta is the angle in the xy plane, range 0 to 2*pi, theta == 0 when x > 0 and y = 0

2) phi is the angle above or below the xy plane, range +/- pi/2

3) r is the total vector length
*/
func CartesianToPolar(v1 CartesianVector) SphericalVector {
	r := floats.Norm(v1, 2.0)
	x := v1[0]
	y := v1[1]
	z := v1[2]
	xy := math.Sqrt(x*x + y*y)
	phi := math.Atan(z / xy)
	theta := math.Atan2(y, x)
	return SphericalVector{theta, phi, r}
}

/*
CartesianToEquatorial converts a 3-vector [v1] of Cartesian coordinates to a form similar to Earth-based equatorial coordinates in degrees.
(right ascension and declination both in degrees, radial distance in the same units as the original Cartesian coordinates)
If you need hours of the RA-like coordinate, divide v2[0] by 15.
*/
func CartesianToEquatorial(v1 CartesianVector) SphericalVector {
	v2 := CartesianToPolar(v1)
	v2[0] = ToDegrees(v2[0])
	if v2[0] < 0 {
		v2[0] += 360.0 // not needed for actual math, but is more consistent w/ astronomy catalog values, which are consistently non-negative.
	}
	v2[1] = ToDegrees(v2[1])

	return v2
}

// PolarToCartesian converts a vector of polar coordinates [v1] into a vector of Cartesian coordinates. The conventions are the same as in CartesianToEquatorial.
func PolarToCartesian(v1 SphericalVector) CartesianVector {
	theta := v1[0]
	phi := v1[1]
	r := v1[2]

	x := r * math.Cos(theta) * math.Cos(phi)
	y := r * math.Sin(theta) * math.Cos(phi)
	z := r * math.Sin(phi)

	return CartesianVector{x, y, z}
}

/*
EquatorialToGalactic takes a CartesianVector in equatorial coordinate components and turns it into the corresponding
vector in galactic coordinate components.

Matrix coordinates taken from https://casper.astro.berkeley.edu/astrobaki/index.php/Coordinates.
They are appropriate for equinox 2000, the equinox of HYG and AT-HYG data sets.
*/
func EquatorialToGalactic(v1 CartesianVector) CartesianVector {

	xg := -(0.054876)*v1[0] - (0.873437)*v1[1] - (0.483835)*v1[2]
	yg := (0.494109)*v1[0] - (0.444830)*v1[1] + (0.746982)*v1[2]
	zg := -(0.867666)*v1[0] - (0.198076)*v1[1] + (0.455984)*v1[2]

	return CartesianVector{xg, yg, zg}

}

// DirectionCosine gets the cosine of the angle between vectors [v1] and [v2].
func DirectionCosine(v1 CartesianVector, v2 CartesianVector) float64 {
	return floats.Dot(v1, v2) / (floats.Norm(v1, 2.0) * floats.Norm(v2, 2.0))
}
