// consts.go: constants used throughout the brahe module

package brahe

// Values for basic astronomical computation:

const PCYR_TO_KMSEC = 977812.0 // conversion from parsecs/year to km/second
const PC_TO_LY = 3.262         // conversion from parsecs to light years
const SOL_ABSMAG = 4.85        // absolute Johnson V magnitude of the Sun (apparent magnitude @ 10.0 parsec)

// AT-HYG catalog field IDs. This is for AT-HYG v2.2 or later.
// For CSV format catalogs, these are 0-indexed column IDs.
const (
	ATHYG_ID       = 0  // AT-HYG sequential catalog ID column in AT-HYG
	ATHYG_TYC      = 1  // Tycho-2 ID column in AT-HYG
	ATHYG_GAIA     = 2  // Gaia DR3 ID column in AT-HYG
	ATHYG_HIP      = 4  // HIPPARCOS ID column in AT-HYG
	ATHYG_HD       = 5  // Henry Draper ID column in AT-HYG
	ATHYG_HR       = 6  // HR/YBSC ID column in AT-HYG
	ATHYG_GLIESE   = 7  // Gliese/GJ catalog ID column in AT-HYG
	ATHYG_BAYER    = 8  // Bayer Greek letter (+ optional subscript) column in AT-HYG
	ATHYG_FLAM     = 9  // Flamsteed number column in AT-HYG
	ATHYG_CON      = 10 // 3-letter constellation abbreviation column in AT-HYG
	ATHYG_PROPER   = 11 // Proper name (e.g. Rigel, Polaris) column in AT-HYG
	ATHYG_RA       = 12 // Right ascension, equinox J2000.0 column in AT-HYG
	ATHYG_DEC      = 13 // Declination, equinox J2000.0 column in AT-HYG
	ATHYG_X        = 16 // Cartesian x position column in AT-HYG
	ATHYG_Y        = 17 // Cartesian y position column in AT-HYG
	ATHYG_Z        = 18 // Cartesian z position column in AT-HYG
	ATHYG_MAG      = 20 // Visual apparent magnitude column in AT-HYG
	ATHYG_ABSMAG   = 21 // Visual absolute magnitude column in AT-HYG
	ATHYG_VX       = 29 // Cartesian x velocity column in AT-HYG
	ATHYG_VY       = 30 // Cartesian y velocity column in AT-HYG
	ATHYG_VZ       = 31 // Cartesian z velocity column in AT-HYG
	ATHYG_SPECTRUM = 32 // MK spectral type column in AT-HYG
)

// ATHYG_SUN_ID is the specific ID for the Sun in Augmented Tycho (it's defined as such in all AT-HYG > v1.0)
const ATHYG_SUN_ID = 1

// AT-HYG ID label priorities. Labels use the first nonempty one in the list, then the second.
// This list sets the normal order; changing the order, either here or in a list of priorities passed to
// a request for a label, changes the labels chosen.
const (
	LABEL_PROPER_ID    = iota // Default proper name label priority
	LABEL_BAYER_ID            // Default Bayer Greek letter designation priority
	LABEL_FLAMSTEED_ID        // Default Flamsteed number priority
	LABEL_HR_ID               // Default HR number priority
	LABEL_GLIESE_ID           // Default Gliese/GJ catalog priority
	LABEL_HIP_ID              // Default HIPPARCOS priority
	LABEL_TYCHO_ID            // Default Tycho-2 ID priority
	LABEL_GAIA_ID             // Default Gaia catalog ID priority
)

// Placeholder catalog/object values (for use when the true value is unknown or not reliable)

const PLACEHOLDER_CATALOG_DISTANCE = 1000000.0 // To use when the XYZ coordinates of the star are unknown. Use to create a very distant placeholder.
const PLACEHOLDER_CATALOG_MAGNITUDE = +10.0    // To use when a magnitude value is invalid
const PLACEHOLDER_APP_MAG = -25.0              // an arbitrary apparent magnitude for extremely nearby stars. Same order of magnitude as Sun as seen from Earth.
const PLACEHOLDER_APP_DIST = 1.0e-4            // distance below which the apparent magnitude is set to the placeholder value
// 1 AU ~= 4.8E-6 pc; this value of 1e-4 pc has same order of magnitude as the Solar System outer planets' orbits

// MAX_BINARY_STEPS is the maximum allowed number of steps in binary search before the search is terminated.
// A value of 32 is good for up to ~4E9 items, which is well beyond any practical use case.
const MAX_BINARY_STEPS = 32

// MIN_APPARENT_LUMINOSITY is the minimum scaled luminosity (current brightness of the star compared to the Sun at a standard distance)
// for a star to be included in a list. This value is faster to calculate for a star than the apparent magnitude, so long as the
// Luminosity property is known. The default value of 0.001 corresponds roughly to an apparent magnitude of +7.4; about 20000 stars will
// meet this criterion in general, making it a more restrictive criterion than an angle cutoff (unless the cutoff is very small) in longer
// lists of stars.
const MIN_APPARENT_LUMINOSITY = 0.001

// INVALID_OBJECT_ID is a placeholder ID for a Star object that could not be found, or otherwise invalid.
// By convention, negative IDs are used for special cases (all valid catalog IDs are > 0) and the value chosen here
// is intended not to clash with possible use cases.
const INVALID_OBJECT_ID = -1e6

// NO_TRANSLATE_LIMIT is the distance, in parsecs, from the Sun under which it is safe to neglect explicit calculations of new positions+velocities
// for stars in a list.
const NO_TRANSLATE_LIMIT = 0.01
