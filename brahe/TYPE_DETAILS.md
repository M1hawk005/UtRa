# Data Types (brahe.go)

These are defined in the file brahe.go. To keep automatic documentation reasonably sized, additional details about each type are collected here.

## Vectors (CartesianVector, SphericalVector)

The vector types accommodate 2 common types of 3-element vectors: Cartesian [x, y, z] and Spherical [theta, phi, r] / [RA / Dec / r].
These two are intended to be non-interchangeable, even though they have the same basic definition (a list of 3 floating point numbers).
In particular, operations like translating a vector only make sense (as a fairly elementary operation, anyway) with a Cartesian one.


## StarDesignations

The StarDesignations type is a collection of common historical and modern names and designations for a given star. The
currently supported designations are:

- Gaia IDs. Versions of AT-HYG up through 3.x use Gaia DR3 IDs. Later version of AT-HYG may use later data release IDs.
- Tycho-2 IDs.
- HIPPARCOS (HIP) IDs.
- Henry Draper (HD) IDs.
- Harvard Revised (HR) IDs, as seen in the Yale Bright Star Catalog.
- Gliese-Jahreiss catalog IDs.
- Bayer Greek letter designations.
- Flamsteed numbers.
- Proper names. Names in AT-HYG are generally the ones officially recognized by the IAU.

At least one ID or name should be included in an actively-used StarDesignations instance, but no specific value is required in
all cases.

## Star

The Star type is a generic but fairly flexible representation of a star from HYG, AT-HYG, and similar sources.
It is intended to focus on (a) intrinsic physical properties and (b) widely-used names and IDs.

(a) The first of these criteria means that fields like apparent magnitude are *not* stored directly, because they depend on location.
Instead, absolute magnitude is stored, and apparent magnitude calculated only as needed.

Similarly, Earth-based coordinates like equatorial or ecliptic coordinates are not stored.
Instead, the star positions and velocities are Cartesian 3-vectors with the units in typical values for stellar kinematics
(parsecs for positions, parsecs/year for velocities), and Earth-based coordinates can be calculated as needed.

Note that the basis for the Cartesian coordinate system *is* Earth-centered, for convenience in loading data from other catalogs.
The coordinate system origin is at the Sun, and the system itself is a right-handed system
where +x is towards the vernal equinox of J2000 (R.A. 0 hr, Dec 0 degrees), +y is towards R.A. 12 hr, Dec 0 degrees,
and +z is towards Dec +90 degrees. However, the actual values of a given vector can be translated to any point desired,
so there is no expectation that any Cartesian vector always corresponds to an Earth-based value.

(b) The second of these criteria means numerous common catalog IDs and names are defined. One of the goals of HYG and AT-HYG
is to collect a wide range of historically significant IDs and have accurate cross-references between them. As a result, every Star
object contains a StarDesignations object as well, with as much detail as is available.

## StarListConfig

The StarListConfig type is a collection of data needed to get a selected list of Star objects as a useful dataset.

- From: A Star object that is the origin (zero coordinates) for the group. In a chart, it's the star you're viewing the sky from.
- To: A Star object representing the center of the group. In a chart, it's the one plotted in the center of the chart.
- Angle: Defines the maximum permitted angle between the "To" object and stars included in the dataset.
- Magnitude: Defines the faintest permitted apparent magnitude (As seen from the "From" object) for stars included in the dataset.
- Time: Time before (negative) or after (positive) the dataset epoch (J2000.0). Used to determine correct stellar positions over long times.

The data type is somewhat oriented towards charting, where the "To" object is where the chart center will be
plotted, and a limited angle of the sky is shown, but can be used for more generic purposes as well.

For example, to create a star chart representing the sky as seen from Sirius and centered on the star Betelgeuse,
the "From" value is a Star object containing the data for Sirius, and the "To" value is a similar object representing Betelgeuse,
with all position components in parsecs, velocity components in parsecs/year, and using the same origin for both sets of coordinates.
