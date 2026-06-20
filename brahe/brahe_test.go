/*
brahe_test.go -- unit test sequence for brahe functions.

This test series requires the following files to be present in the directory test/data:
  - athyg_32_hr.csv: This is a subset of 9019 of the brightest stars in AT-HYG.
  - athyg_32_faulty.csv: This is a very short file (7 records), of which 5 are faulty in very specific ways to test
    faulty data handling.
  - README.txt: more detailed overview of the test process and the data files.
*/
package brahe

import (
	"math"
	"sort"
	"strconv"
	"strings"
	"testing"
)

const dataDirectory = "./test/data/"
const dataFileName = dataDirectory + "athyg_32_hr.csv"
const faultyDataFileName = dataDirectory + "athyg_32_faulty.csv"
const nonexistentFileName = faultyDataFileName + "xxxxxxxx"
const notACsvFileName = dataDirectory + "README.txt"
const lowFloatingPointTolerance = 1e-3
const highFloatingPointTolerance = 1e-8

// closeEnoughFloatLow verifies that 2 floating point numbers are close, with a low precision (relatively high error) accepted.
// This is appropriate for calculations based on data stored to only a few decimal places, like stellar distances or apparent magnitudes.
func closeEnoughFloatLow(f1 float64, f2 float64) bool {
	return math.Abs(f1-f2) < lowFloatingPointTolerance
}

// closeEnoughFloatHigh verifies that 2 floating point numbers are close, with a high precision (relatively low error) accepted.
// This is appropriate for calculations that are expected to be exact (e.g. unit conversions with an explicit conversion factor
// in consts.go) or inexact but very precise by nature (e.g. converting degrees to radians via Math.Pi for trig functions)
func closeEnoughFloatHigh(f1 float64, f2 float64) bool {
	return math.Abs(f1-f2) < highFloatingPointTolerance
}

/* TestBasics tests the basic unit conversion calculators */
func TestBasics(t *testing.T) {
	// Acceptance criterion: each calculation is done correctly, with reasonable precision, based on the values associated with the
	// conversion in brahe's consts.go.

	deg := 60.0
	rad := math.Pi / 3.0 // equals 60 degrees

	if !closeEnoughFloatHigh(ToRadians(deg), rad) {
		t.Fatalf("ToRadians failed: expected %v, got %v\n", rad, ToRadians(deg))
	}

	if !closeEnoughFloatHigh(ToDegrees(rad), deg) {
		t.Fatalf("ToDegrees failed: expected %v, got %v\n", deg, ToDegrees(rad))
	}

	parsecs := 10.0
	lightYears := 32.62 // equals 10 parsecs

	if !closeEnoughFloatHigh(ParsecsToLightYears(parsecs), lightYears) {
		t.Fatalf("ParsecsToLightYears failed: expected %v, got %v\n", lightYears, ParsecsToLightYears(parsecs))
	}

	if !closeEnoughFloatHigh(LightYearsToParsecs(lightYears), parsecs) {
		t.Fatalf("LightYearsToParsecs failed: expected %v, got %v\n", parsecs, LightYearsToParsecs(lightYears))
	}

	kmSecFactor := 97781.20
	pcYearFactor := 0.10 // equivalent to the km/sec value given here

	if !closeEnoughFloatHigh(ParsecPerYearToKmPerSec(pcYearFactor), kmSecFactor) {
		t.Fatalf("ParsecPerYearToKmPerSec failed: expected %v, got %v\n", kmSecFactor, ParsecPerYearToKmPerSec(pcYearFactor))
	}

	if !closeEnoughFloatHigh(KmPerSecToParsecPerYear(kmSecFactor), pcYearFactor) {
		t.Fatalf("KmPerSecToParsecPerYear failed: expected %v, got %v\n", pcYearFactor, KmPerSecToParsecPerYear(kmSecFactor))
	}
}

// TestVectors tests vector calculations
func TestVectors(t *testing.T) {
	// Acceptance criterion: Each vector conversion is correct within reasonable precision.

	// Test 1: A simple Cartesian to spherical coordinate change
	cart := CartesianVector{1, 0, 0}
	want := CartesianToPolar(cart)
	expect := SphericalVector{0, 0, 1}

	if !closeEnoughFloatHigh(expect[0], want[0]) || !closeEnoughFloatHigh(expect[1], want[1]) || !closeEnoughFloatHigh(expect[2], want[2]) {
		t.Fatalf("CartesianToPolar failed: got %v, expected %v\n", want, expect)
	}

	// Test 2: Another simple Cartesian to spherical coordinate change
	cart = CartesianVector{0, 1, 0}
	want = CartesianToPolar(cart)
	expect = SphericalVector{math.Pi / 2.0, 0, 1}

	if !closeEnoughFloatHigh(expect[0], want[0]) || !closeEnoughFloatHigh(expect[1], want[1]) || !closeEnoughFloatHigh(expect[2], want[2]) {
		t.Fatalf("CartesianToPolar test 2 failed: got %v, expected %v\n", want, expect)
	}

	// Test 3: A third simple Cartesian to spherical coordinate change
	cart = CartesianVector{0, 0, 1}
	want = CartesianToPolar(cart)
	expect = SphericalVector{0, math.Pi / 2.0, 1}

	if !closeEnoughFloatHigh(expect[0], want[0]) || !closeEnoughFloatHigh(expect[1], want[1]) || !closeEnoughFloatHigh(expect[2], want[2]) {
		t.Fatalf("CartesianToPolar test 3 failed: got %v, expected %v\n", want, expect)
	}

	// Test 4: Test the equatorial coordinates version of this calculation (coordinates in degrees, distance value is ignored)
	cart = CartesianVector{0, 1, 0}
	want = CartesianToEquatorial(cart)
	expect = SphericalVector{90.0, 0.0}
	if !closeEnoughFloatHigh(expect[0], want[0]) || !closeEnoughFloatHigh(expect[1], want[1]) {
		t.Fatalf("CartesianToEquatorial test failed: got %v, expected %v\n", want, expect)
	}

	// Test 5: Confirm correct handling of something that could, if not handled properly, give a negative value for the right ascension (first coordinate),
	// because of how math.Atan2 works. The brahe function for this should always produce nonnegative values for the right ascension coordinate.
	cart = CartesianVector{0, -1, 0}
	want = CartesianToEquatorial(cart)
	expect = SphericalVector{270.0, 0.0}
	if !closeEnoughFloatHigh(expect[0], want[0]) || !closeEnoughFloatHigh(expect[1], want[1]) {
		t.Fatalf("CartesianToEquatorial test 2 failed: got %v, expected %v\n", want, expect)
	}

	// Test 6: Test equatorial to galactic conversion. This just verifies that a simple case, based on the
	// coefficients in the expected rotation matrix, looks right.

	cart = CartesianVector{1.0, 1.0, 1.0}
	wantGalactic := EquatorialToGalactic(cart)
	expectGalactic := CartesianVector{-0.054876 - 0.873437 - 0.483835, 0.494109 - 0.444830 + 0.746982, -0.867666 - 0.198076 + 0.455984}
	if !closeEnoughFloatHigh(expectGalactic[0], wantGalactic[0]) || !closeEnoughFloatHigh(expectGalactic[1], wantGalactic[1]) || !closeEnoughFloatHigh(expectGalactic[2], wantGalactic[2]) {
		t.Fatalf("EquatorialToGalactic test failed: got %v, expected %v\n", wantGalactic, expectGalactic)
	}

}

/* TestConstellationData verifies simple constellation data lookups */
func TestConstellationData(t *testing.T) {
	// Acceptance criterion: All associated data for Ursa Major is retrieved correctly
	con := "UMa"

	// Test 1: Full name
	want := GetNameForConstellation(con)
	expect := "Ursa Major"

	if want != expect {
		t.Fatalf("GetNameForConstellation failed: got '%v', expected '%v'\n", want, expect)
	}

	// Test 2: Genitive form
	want = GetGenitiveForConstellation(con)
	expect = "Ursae Majoris"

	if want != expect {
		t.Fatalf("GetGenitiveForConstellation failed: got '%v', expected '%v'\n", want, expect)
	}

	// Test 3: There is one standard label location for Ursa Major
	locations := GetLabelLocationsForConstellation(con)
	if len(locations) != 1 {
		t.Fatalf("GetLabelLocationsForConstellation failed for %v: expected %d entries, found %d\n", con, 1, len(locations))
	}

	// Test 4: Serpens needs to have _two_ label locations, one for Serpens Caput, one for Serpens Cauda.
	// Acceptance criterion: two locations are retrieved.
	con = "Ser"
	locations = GetLabelLocationsForConstellation(con)
	if len(locations) != 2 {
		t.Fatalf("GetLabelLocationsForConstellation failed for %v: expected %d entries, found %d\n", con, 2, len(locations))
	}

}

/* TestFileLoad verifies there are no errors loading the sample data file included with brahe, and that the first record looks basically correct. */
func TestFileLoad(t *testing.T) {

	fileData, fileError := ReadAthygData(dataFileName)

	// Test 1: Basic file read.
	// Acceptance criterion: Any read error is an automatic failure case
	if fileError != nil {
		t.Fatalf("ReadAthygData failed reading %v: %v\n", dataFileName, fileError)
	}

	// Test 2: Basic data check.
	// Acceptance criterion: The first non-header row should be the Sun. If it's not, also a fail.
	firstStar := fileData[0]
	want := firstStar.Designations.ProperName
	expect := "Sol"
	if want != expect {
		t.Fatalf("ReadAthygData failed reading first record: got %v, expected %v\n", want, expect)
	}
}

/*
TestFaultyFileLoads verifies that certain known errors are checked when loading the sample data file included with brahe.
Note: many of these are warning-level errors, so the check here is to verify the warning cases have been handled correctly.
In general, files that return any of these warnings need to be checked for problems before using.
*/
func TestFaultyFileLoads(t *testing.T) {
	t.Logf("*** Running tests of checks for faulty data and file loads. Warning messages here are normal.\n")

	// Test 1: Faulty data field handling.
	// Acceptance criteria: Warning messages are printed, and the correct number of dropped records is obtained.
	fileData, fileError := ReadAthygData(faultyDataFileName)
	expectedStarCount := 2 // there are seven records, five of which are faulty
	if fileError != nil && len(fileData) != expectedStarCount {
		t.Fatalf("ReadAthygData failed faulty data omission checks: expected %v records, got %v.\n", expectedStarCount, len(fileData))
	}

	// Test 2: This file does not exist.
	// Acceptance criterion: A non-nil error message is received.
	_, fileError = ReadAthygData(nonexistentFileName)

	if fileError == nil {
		t.Fatalf("ReadAthygData failed to set an appropriate error for missing file")
	}

	// Test 3: This file is not a CSV file.
	// Acceptance criterion: A non-nil error message is received.
	_, fileError = ReadAthygData(notACsvFileName)

	if fileError == nil {
		t.Fatalf("ReadAthygData failed to set an appropriate error for non-CSV file load")
	}

}

// Having gotten this far, it is safe to load data from the standard location going forward.

/* TestCreateIndex verifies that a name-to-ID index can be created */
func TestCreateIndex(t *testing.T) {
	name := "Sirius"
	data, _ := ReadAthygData(dataFileName)
	index := CreateAthygIndex(data)

	// Acceptance criterion: A value can be read correctly from the main data list via the index.
	want := index["Proper Name "+strings.ToLower(name)]
	expect := 584955 // The AT-HYG catalog ID for Sirius in AT-HYG 3.x.
	if want != expect {
		t.Fatalf("CreateAthygIndex failed index mapping: got %v, expected %v\n", want, expect)
	}

}

/*
**********************************************************************
Having gotten this far, it is safe to create both main data and index.
**********************************************************************
*/

/*
TestLoadByName verifies that a given star can be loaded from the list of Star objects + index, by its name or other designation.
It also validates some of the data obtained for an example star.
*/
func TestLoadByName(t *testing.T) {
	want := ""
	expect := "Sirius"
	data, _ := ReadAthygData(dataFileName)
	index := CreateAthygIndex(data)
	testStar := GetAthygStarByName(data, index, expect)

	// Test 1: correct name for star found in the index:
	// Acceptance criterion: correct name
	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName failed index lookup: got %v, expected %v\n", want, expect)
	}

	// Test 2: standard labeling for current label priorities:
	// Acceptance criterion: correct full label
	want = testStar.Name
	expect = "Sirius (α CMa)"
	if want != expect {
		t.Fatalf("GetAthygStarByName: standard name failed check: got %v, expected %v\n", want, expect)
	}

	// Test 3: Test other data read from file and computed from that data
	// These three values are based on recent data for Sirius, accurate to 3 decimal places

	// Acceptance criterion: these values match separately computed ones
	expectedMagnitude := -1.44
	expectedDistance := 2.637
	expectedScaledLuminosity := 3.282 // = luminosity/distance squared == math.Pow(10.0, 0.40*(SOL_ABSMAG-absmag)) / distance squared; SOL_ABSMAG = 4.85; this is effectively apparent magnitude without logs

	if !closeEnoughFloatLow(expectedMagnitude, ApparentMagnitude(*testStar)) {
		t.Fatalf("GetAthygStarByName: standard magnitude failed check: got %v, expected %v\n", ApparentMagnitude(*testStar), expectedMagnitude)
	}

	if !closeEnoughFloatLow(expectedDistance, Distance(*testStar)) {
		t.Fatalf("GetAthygStarByName: standard distance failed check: got %v, expected %v\n", Distance(*testStar), expectedDistance)
	}

	if !closeEnoughFloatLow(expectedScaledLuminosity, ScaledLuminosity(*testStar)) {
		t.Fatalf("GetAthygStarByName: standard  scaled luminosityfailed check: got %v, expected %v\n", ScaledLuminosity(*testStar), expectedScaledLuminosity)
	}
}

/*
TestLoadByMultipleIDs verifies that a given star can be loaded from the list of Star objects + index, by a large range of names or IDs.
*/
func TestLoadByMultipleIDs(t *testing.T) {
	// Additional lookups by name, to verify indexing:
	// Acceptance criteria:
	// (1) Lookup by Bayer Greek letter ID is correct, both "raw" and case where a multiple star component needs finding
	// (2) Lookup by Flamsteed number is correct.
	// (3) Lookup by HIPPARCOS ID is correct, including the "bar" number, which is HIPPARCOS by default
	// (4) Lookups for the Sun are correct.
	// (5) Lookups by (bare) Gaia ID (currently, DR3 only) are correct.
	// (6) Lookups by Tycho-2 ID are correct, including the "bare" ID.

	data, _ := ReadAthygData(dataFileName)
	index := CreateAthygIndex(data)

	// Test 1: Bayer Greek letter ID
	bayerID := "Alpha Ori"
	expect := "Betelgeuse"
	testStar := GetAthygStarByName(data, index, bayerID)

	want := testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: Bayer ID lookup failed check: got %v, expected %v\n", want, expect)
	}

	// Test 1b. Also test fallback to first component of a multiple star if a basic lookup fails
	bayerID = "Alpha Cen"
	expect = "Rigil Kentaurus" // this is alpha-1 Centauri
	testStar = GetAthygStarByName(data, index, bayerID)

	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: Bayer ID lookup (alternate for possible multiple component) failed check: got %v, expected %v\n", want, expect)
	}

	// Test 2: Flamsteed number
	flamsteedID := "36 Oph"
	expect = "Guniibuu"
	testStar = GetAthygStarByName(data, index, flamsteedID)

	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: Flamsteed ID lookup failed check: got %v, expected %v\n", want, expect)
	}

	// Test 3: HIPPARCOS ID
	hipID := "HIP 69673"
	expect = "Arcturus"
	testStar = GetAthygStarByName(data, index, hipID)

	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: HIPPARCOS ID lookup failed check: got %v, expected %v\n", want, expect)
	}

	// Test 3b. Bare number (<256K) should also be treated as a HIP ID
	hipID = "69673"
	expect = "Arcturus"
	testStar = GetAthygStarByName(data, index, hipID)

	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: HIPPARCOS ID lookup (no prefix) failed check: got %v, expected %v\n", want, expect)
	}

	// Test 4: The Sun
	altSunName := "Sun"
	expect = "Sol"
	testStar = GetAthygStarByName(data, index, altSunName)

	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: Sun name lookup failed check: got %v, expected %v\n", want, expect)
	}

	// Test 5: A Gaia ID. This is a "bare" number > 256K.
	gaiaID := "892348694913501952"
	expect = "Castor"
	testStar = GetAthygStarByName(data, index, gaiaID)

	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: Gaia ID lookup failed check: got %v, expected %v\n", want, expect)
	}

	// Test 6: A Tycho-2 ID
	tycID := "TYC 8534-2277-1"
	expect = "Canopus"
	testStar = GetAthygStarByName(data, index, tycID)

	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: Tycho ID lookup failed check: got %v, expected %v\n", want, expect)
	}

	// Test 6b. "Bare" Tycho-2 ID should work as well
	tycID = "8534-2277-1"
	expect = "Canopus"
	testStar = GetAthygStarByName(data, index, tycID)

	want = testStar.Designations.ProperName
	if want != expect {
		t.Fatalf("GetAthygStarByName: Tycho ID lookup (no prefix) failed check: got %v, expected %v\n", want, expect)
	}

	// Test 7: An appropriate default is set for magnitudes for stars a very small distance away
	// Test star is the Sun, which is close enough to trigger this case:
	testStar = GetAthygStarByName(data, index, altSunName)
	if ApparentMagnitude(*testStar) != PLACEHOLDER_APP_MAG {
		t.Fatalf("ApparentMagnitude: Placeholder magnitude not set for extremely small distance: got %v, expected %v\n", ApparentMagnitude(*testStar), PLACEHOLDER_APP_MAG)
	}
}

/*
TestStarLabels verifies that star label configuration (choosing primary and secondary labels) works as expected
*/
func TestStarLabels(t *testing.T) {
	// Test 1: Label processing: default
	// Acceptance criterion: The primary and secondary labels are as expected for a bright star: proper name, followed by a Bayer designation.
	data, _ := ReadAthygData(dataFileName)
	index := CreateAthygIndex(data)

	testStar := GetAthygStarByName(data, index, "Sirius")
	primary, secondary := GetAthygStarLabels(testStar, nil)
	expectedPrimary := testStar.Designations.ProperName
	expectedSecondary := MapGreekLetterName(testStar.Designations.Bayer) + " " + testStar.Constellation
	if primary != expectedPrimary || secondary != expectedSecondary {
		t.Fatalf("GetAthygStarLabels: Standard labels of (%v, %v) not found; got (%v, %v)\n", primary, secondary, expectedPrimary, expectedSecondary)
	}

	// Test 2: Label processing: change the default order
	// Acceptance criterion: The primary and secondary labels are as expected for the supplied order: HIPPARCOS ID first, Tycho-2 ID next.
	priorities := []int{
		LABEL_HIP_ID,
		LABEL_TYCHO_ID,
		LABEL_PROPER_ID,
		LABEL_BAYER_ID,
		LABEL_FLAMSTEED_ID,
		LABEL_HR_ID,
		LABEL_GLIESE_ID,
	}
	testStar = GetAthygStarByName(data, index, "Sirius")
	primary, secondary = GetAthygStarLabels(testStar, priorities)
	expectedPrimary = "HIP " + strconv.Itoa(testStar.Designations.HIP)
	expectedSecondary = "TYC " + testStar.Designations.Tycho
	if primary != expectedPrimary || secondary != expectedSecondary {
		t.Fatalf("GetAthygStarLabels: Standard labels of (%v, %v) not found; got (%v, %v)\n", primary, secondary, expectedPrimary, expectedSecondary)
	}

	// Test 3: Pass a bad label priority -- it should get skipped with a warning.
	// Acceptance criterion: The primary and secondary labels are as expected for the supplied order: proper name, followed by a Bayer designation.
	priorities = []int{
		LABEL_PROPER_ID,
		LABEL_BAYER_ID,
		-1, // out of bounds
	}
	testStar = GetAthygStarByName(data, index, "Sirius")
	primary, secondary = GetAthygStarLabels(testStar, priorities)
	expectedPrimary = testStar.Designations.ProperName
	expectedSecondary = MapGreekLetterName(testStar.Designations.Bayer) + " " + testStar.Constellation
	if primary != expectedPrimary || secondary != expectedSecondary {
		t.Fatalf("GetAthygStarLabels: Standard labels (with one later label being invalid) of (%v, %v) not found; got (%v, %v)\n", primary, secondary, expectedPrimary, expectedSecondary)
	}

	// Test 4: If no labels are possible, return a default indicating that case
	// For this case, look up Sirius, as usual, but accept only Gaia IDs as labels. Sirius doesn't have a Gaia ID.
	// Acceptance criterion: The primary label is set to a default value indicating no actual label could be identified.
	priorities = []int{
		LABEL_GAIA_ID,
	}
	testStar = GetAthygStarByName(data, index, "Sirius")
	primary, _ = GetAthygStarLabels(testStar, priorities)
	expectedPrimary = "Unidentified"
	if primary != expectedPrimary {
		t.Fatalf("GetAthygStarLabels: Missing label default value of '%v' not found; got '%v'\n", primary, expectedPrimary)
	}
}

/*
TestStarPositions verifies that star position and velocity calculations work as expected
*/
func TestStarPositions(t *testing.T) {

	data, _ := ReadAthygData(dataFileName)
	index := CreateAthygIndex(data)

	// Test 1: Just move a star from its current location
	// Acceptance criterion: The difference between the function result and a direct calculation, component by component, should be negligible

	years := 10000.0
	sirius := GetAthygStarByName(data, index, "Sirius")
	movedSirius := SelfTranslateStar(*sirius, years)

	dx := movedSirius.Position[0] - (sirius.Position[0] + sirius.Velocity[0]*years)
	dy := movedSirius.Position[1] - (sirius.Position[1] + sirius.Velocity[1]*years)
	dz := movedSirius.Position[2] - (sirius.Position[2] + sirius.Velocity[2]*years)

	if !closeEnoughFloatLow(dx, 0) || !closeEnoughFloatLow(dy, 0) || !closeEnoughFloatLow(dz, 0) {
		t.Fatalf("SelfTranslateStar: Expected differences out of bounds: got %v, %v, %v, expected [0, 0, 0]", dx, dy, dz)
	}

	// Test 2: Combine changing location (e.g. calculating the position of Procyon as seen from Sirius) with changing time.
	// Acceptance criterion: The difference between the function result and a direct calculation, component by component, should be negligible

	years = 10000.0
	procyon := GetAthygStarByName(data, index, "Procyon")
	movedSirius = TranslateStar(*sirius, *procyon, years)

	dx = movedSirius.Position[0] - (sirius.Position[0] + sirius.Velocity[0]*years) + (procyon.Position[0] + procyon.Velocity[0]*years)
	dy = movedSirius.Position[1] - (sirius.Position[1] + sirius.Velocity[1]*years) + (procyon.Position[1] + procyon.Velocity[1]*years)
	dz = movedSirius.Position[2] - (sirius.Position[2] + sirius.Velocity[2]*years) + (procyon.Position[2] + procyon.Velocity[2]*years)

	if !closeEnoughFloatLow(dx, 0) || !closeEnoughFloatLow(dy, 0) || !closeEnoughFloatLow(dz, 0) {
		t.Fatalf("TranslateStar: Expected differences out of bounds: got %v, %v, %v, expected [0, 0, 0]", dx, dy, dz)
	}
}

/* TestStarLists tests that a list of stars, after translating to a new location, gives sensible data.
The primary test case is the view from Sirius, which is easy to work out w/ older data (e.g., just HIPPARCOS) and verify the
key results. In particular, both the brightest and the nearest star to Sirius is Procyon, and other bright/nearby stars can be worked
out to high accuracy even with pre-Gaia data.
*/

func TestStarLists(t *testing.T) {
	data, _ := ReadAthygData(dataFileName)
	index := CreateAthygIndex(data)
	sirius := GetAthygStarByName(data, index, "Sirius")
	procyon := GetAthygStarByName(data, index, "Procyon")

	// Test 1: Get a filtered list covering the entire sky and a moderate magnitude (brightness).
	// Acceptance criterion: The names of the nearest three stars are as expected
	listConfig := StarListConfig{
		*sirius,
		*procyon, // this will be the central point from which allowed angles are computed.
		math.Pi,  // maximum angular separation between star2 and allowed stars. This is in radians; pi radians = 180 degrees, so the entire sky is in range.
		5.0,      // maximum (dimmest) allowed magnitude: 5.0 gets most readily-visible naked-eye stars as seen from Sirius
		0.0,      // no time before or after current epoch = positions in 2000
	}

	fromSirius := GetViewToTargetStar(data, listConfig, 1, 0)
	// sort the list by distance
	sort.Slice(fromSirius, func(i, j int) bool {
		return Distance(fromSirius[i]) < Distance(fromSirius[j])
	})

	// Get the closest stars (first through third in the sorted list)
	first := fromSirius[0]
	second := fromSirius[1]
	third := fromSirius[2]

	firstExpectedName := "Procyon"
	secondExpectedName := "Ran" // Epsilon Eridani
	thirdExpectedName := "Sol"

	if first.Designations.ProperName != firstExpectedName {
		t.Fatalf("GetViewToTargetStar: nearest star check failed: got %v, expected %v\n", first.Designations.ProperName, firstExpectedName)
	}
	if second.Designations.ProperName != secondExpectedName {
		t.Fatalf("GetViewToTargetStar: 2nd-nearest star check failed: got %v, expected %v\n", second.Designations.ProperName, secondExpectedName)
	}
	if third.Designations.ProperName != thirdExpectedName {
		t.Fatalf("GetViewToTargetStar: 3rd-nearest star check failed: got %v, expected %v\n", third.Designations.ProperName, thirdExpectedName)
	}

	// Test 2: Same list to start with, but apply different filters to it.
	// Acceptance criterion: The names of the nearest two stars are as expected,
	// with the second one being different from before, because it is too far
	// (in terms of angle) from the central object to be part of the list.

	listConfig = StarListConfig{
		*sirius,
		*procyon,      // as before, this will be the central point from which allowed angles are computed.
		math.Pi / 4.0, // but confine the selection to be w/in 45 degrees of Procyon
		8.0,           // and this high magnitude cutoff will trigger brahe to apply the angle filter first.
		0.0,           // no time before or after current epoch = positions in 2000
	}

	// Get the filtered list and sort as before:
	fromSirius = GetViewToTargetStar(data, listConfig, 1, 0)
	sort.Slice(fromSirius, func(i, j int) bool {
		return Distance(fromSirius[i]) < Distance(fromSirius[j])
	})

	// Verify that Procyon is the first star but Epsilon Eridani is *not* in this data set, being too far away in the sky:
	first = fromSirius[0]
	second = fromSirius[1]

	firstExpectedName = "Procyon"
	secondUnexpectedName := "Ran" // Epsilon Eridani

	if first.Designations.ProperName != firstExpectedName {
		t.Fatalf("GetViewToTargetStar: nearest star check failed: got %v, expected %v\n", first.Designations.ProperName, firstExpectedName)
	}
	if second.Designations.ProperName == secondUnexpectedName {
		t.Fatalf("GetViewToTargetStar: 2nd-nearest star check failed: %v should not be in range.\n", secondUnexpectedName)
	}

	// Test 3: Translate the entire existing list (read from file) to put Sirius at the center, without doing any filtering.
	// Acceptance criterion: The position of Procyon in the translated list is the same as the original distance minus the original components of Sirius's original position.

	TranslateStarList(data, sirius.Position)
	procyonMoved := GetAthygStarByName(data, index, "Procyon")

	dx := procyon.Position[0] - procyonMoved.Position[0] - sirius.Position[0]
	dy := procyon.Position[1] - procyonMoved.Position[1] - sirius.Position[1]
	dz := procyon.Position[2] - procyonMoved.Position[2] - sirius.Position[2]

	if !closeEnoughFloatLow(dx, 0) || !closeEnoughFloatLow(dy, 0) || !closeEnoughFloatLow(dz, 0) {
		t.Fatalf("TranslateStarList: Expected differences out of bounds: got %v, %v, %v, expected [0, 0, 0]", dx, dy, dz)
	}
}
