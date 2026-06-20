/*
Package brahe defines core variable types and basic utility functions for astronomy programs using the AT-HYG (Augmented Tycho-HYG) catalog.
The base file (brahe.go) defines the most widely used types in these utility functions.

See TYPE_DETAILS.md for a more detailed description of each type.
*/
package brahe

// CartesianVector represents coordinates in [x,y,z] components. It is of arbitrary length to work with the gonum module's "floats" library.
type CartesianVector []float64

// SphericalVector represents coordinates in terms of [r, theta, phi].
type SphericalVector []float64

// EquatorialPosition represents the right ascension and declination of a location; this is usually best for 2D operations.
// For 3D, use a SphericalVector.
type EquatorialPosition [2]float64

// StarDesignations is a collection of common historical and modern names and designations for a given star.
type StarDesignations struct {
	Gaia       int64  `json:"gaia"`       // Always Gaia DR3 ID in AT-HYG v2.x and v3.x.
	Tycho      string `json:"tycho"`      // Always Tycho-2 ID in AT-HYG.
	HIP        int    `json:"hip"`        // The HIPPARCOS ID number from HYG or AT-HYG.
	HD         int    `json:"hd"`         // The Henry Draper ID number from HYG or AT-HYG.
	HR         int    `json:"hr"`         // The Harvard Revised number from HYG, same as the ID number for Yale Bright Star Catalog objects.
	Gliese     string `json:"gliese"`     // The Gliese (Gl) or Gliese-Jahreiss (GJ) catalog ID from HYG. Unlike HIP, HD, and HR, normally expected to contain a prefix ("Gl" or "GJ") to the actual ID.
	Bayer      string `json:"bayer"`      // A Latinized representation of the Greek letter from the Bayer catalog designation from HYG. Can represent a letter with a subscript; this case is represented with a dash as, e.g., "Pi-1".
	Flamsteed  string `json:"flamsteed"`  // The Flamsteed number for the star.
	ProperName string `json:"properName"` // Proper name of the star, if known
}

// Star defines a star in sufficient detail for plotting and reporting, including position, velocity, brightness, and various catalog names and IDs.
type Star struct {
	ID            int              `json:"id"`            // ID is the primary key from a source DB, such as AT-HYG.
	Position      CartesianVector  `json:"position"`      // 3-vector of Cartesian coordinates in parsecs. Can be freely translated to any origin to calculate distance, apparent magnitude, etc. from that location.
	Velocity      CartesianVector  `json:"velocity"`      // 3-vector of Cartesian velocities (same coordinate system as Position) in parsecs/year.
	Designations  StarDesignations `json:"designations"`  // All the known designations available for this star among the options in a StarDesignations type.
	Name          string           `json:"name"`          // A "canonicalized" version of the star's name, typically consisting of 2 widely-used IDs. Usually in order proper name, Bayer, Flamsteed, smaller catalog IDs (e.g. HR, HIP), larger catalog IDs (e.g. TYC, Gaia)
	AbsoluteMag   float64          `json:"absoluteMag"`   // Absolute visual magnitude (expected to be Johnson V or something very close to it, e.g. VT for Tycho-2 catalog entries)
	Spectrum      string           `json:"spectrum"`      // MK spectral type, when known
	Constellation string           `json:"constellation"` // Standard 3-letter constellation abbreviation (e.g. "Ori", "UMa")
	Luminosity    float64          `json:"luminosity"`    // Absolute brightness as multiple of Sun's. Optional, for convenience, if desired; absolute magnitude + distance carry equivalent information.
}

// StarListConfig is a collection of data needed to get a selected list of Star objects as a dataset.
type StarListConfig struct {
	From      Star    // Star object that is the position origin for the dataset.
	To        Star    // Star object at the center of the charted area in a chart.
	Angle     float64 // The maximum angle allowed between the vector to the "To" coordinate and any stars in the list being generated.
	Magnitude float64 // The faintest (highest numerical value) *apparent* visual magnitude allowed for stars in the list being generated.
	Time      float64 // The time, in years, before (negative) or after (positive) the epoch used for star data. The AT-HYG epoch in current versions (v2.0 +) is J2000.0.

}
