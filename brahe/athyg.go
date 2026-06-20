// athyg.go -- functions for working with the AT-HYG catalog.
// Requires AT-HYG v2.2 or later.

package brahe

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"strings"

	"gonum.org/v1/gonum/floats"
)

// GetHipLabel gets a standardized HIPPARCOS catalog label for the catalog ID number [hip].
func GetHipLabel(hip int) string {
	return "HIP " + strconv.Itoa(hip)
}

// GetHRLabel gets a standardized Harvard Revised / Yale Bright Star catalog label for the catalog ID number [hr].
func GetHRLabel(hr int) string {
	return "HR " + strconv.Itoa(hr)
}

// GetTychoLabel gets a standardized Tycho-2 catalog label for the catalog ID [tyc].
func GetTychoLabel(tyc string) string {
	return "TYC " + tyc
}

// GetAthygGaiaLabel gets a standardized Gaia release label for the Gaia label [gaia] used in AT-HYG v2.x / v3.x.
func GetAthygGaiaLabel(gaia int64) string {
	return "Gaia " + strconv.FormatInt(gaia, 10)
}

/*
GetAthygStarLabels gets two labels for the specified Star object [star], based on an ordered list of label IDs in order of priority [labelPriorities].
*/
func GetAthygStarLabels(star *Star, labelPriorities []int) (string, string) {

	// Get basic labels (all as strings, not numeric values)
	con := star.Constellation
	properNameLabel := star.Designations.ProperName
	hipLabel := ""
	if star.Designations.HIP != 0 {
		hipLabel = GetHipLabel(star.Designations.HIP)
	}
	hrLabel := ""
	if star.Designations.HR != 0 {
		hrLabel = GetHRLabel(star.Designations.HR)
	}
	glieseLabel := star.Designations.Gliese
	tycLabel := ""
	if star.Designations.Tycho != "" {
		tycLabel = GetTychoLabel(star.Designations.Tycho)
	}
	gaiaLabel := ""
	if star.Designations.Gaia != 0 {
		gaiaLabel = GetAthygGaiaLabel(star.Designations.Gaia)
	}
	bayerLabel := ""
	if star.Designations.Bayer != "" {
		bayerLabel = MapGreekLetterName(star.Designations.Bayer) + " " + con
	}
	flamsteedLabel := ""
	if star.Designations.Flamsteed != "" {
		flamsteedLabel = star.Designations.Flamsteed + " " + con
	}

	// Define a priority order for labels.
	// The order of values in this list *must* correspond to the values of the LABEL_*_ID constants, and will be used as a default.
	// E.g., since LABEL_PROPER_ID is the lowest value, the proper name label must be first.
	// If you change the values of the LABEL_*_ID constants, change the ordering here correspondingly.
	defaultLabels := []string{properNameLabel, bayerLabel, flamsteedLabel, hrLabel, glieseLabel, hipLabel, tycLabel, gaiaLabel}
	labels := make([]string, len(defaultLabels))

	if len(labelPriorities) == 0 {
		labels = defaultLabels
	} else {
		// Fill label list according to the supplied list of priorities.
		for i := range labelPriorities {
			priority := labelPriorities[i]
			if priority < 0 || priority >= len(labels) {
				fmt.Printf("brahe: WARNING: label index %v is out of bounds in label list of size %v; label was omitted\n", i, len(labels))
			} else {
				labels[i] = defaultLabels[priority]
			}
		}
	}

	// The first nonempty value in the list is the primary, then use the next nonempty value (later in the list) as the secondary.
	// One exception: since Gaia labels are quite long, they generally should not be used as a secondary label.
	primaryLabel := ""
	secondaryLabel := ""
	secondaryStart := 0

	// Assign the primary label
	for i, labelValue := range labels {
		if labelValue != "0" && labelValue != "" {
			primaryLabel = labelValue
			secondaryStart = i + 1
			break
		}
	}

	if primaryLabel == "" {
		primaryLabel = "Unidentified" // and there will be no secondary label
	} else {
		// Assign the secondary label
		for i, secondaryLabelValue := range labels {
			if i < secondaryStart { // don't use any label occurring at or before the primary label in the hierarchy
				continue
			}
			// for all labels use the first nonempty one as the secondary label
			if i < len(labels) && secondaryLabelValue != "0" && secondaryLabelValue != "" {
				secondaryLabel = secondaryLabelValue
				break
			}
		}
	}
	return primaryLabel, secondaryLabel
}

/*
CreateStarFromAthygRecord creates a standard Star object from data in a standard AT-HYG database record [record].
Note: this assumes AT-HYG v2.2 or later, which has the velocities + spectrum data.
*/
func CreateStarFromAthygRecord(record []string) (*Star, error) {

	// First get basic information
	athygID := record[ATHYG_ID]
	tyc := record[ATHYG_TYC]
	gaia := record[ATHYG_GAIA]
	hip := record[ATHYG_HIP]
	hd := record[ATHYG_HD]
	hr := record[ATHYG_HR]
	gl := record[ATHYG_GLIESE]
	proper := record[ATHYG_PROPER]
	bayer := record[ATHYG_BAYER]
	flam := record[ATHYG_FLAM]
	con := record[ATHYG_CON]
	spectrum := record[ATHYG_SPECTRUM]
	x := 0.0
	y := 0.0
	z := 0.0
	absmag := 0.0
	warning := ""
	// Create Cartesian coordinates. The input files contain those coordinates for stars with known distances. Create placeholder
	// values from the equatorial coordinates (right ascension and declination) for stars without known distances.
	ra, err := strconv.ParseFloat(record[ATHYG_RA], 64)
	if err != nil {
		ra = 0.0
		warning = fmt.Sprintf("warning: star %v was missing a right ascension value.", athygID)
	}
	dec, err := strconv.ParseFloat(record[ATHYG_DEC], 64)
	if err != nil {
		dec = 0.0
		warning = fmt.Sprintf("warning: star %v was missing a declination value.", athygID)
	}
	// test the Cartesian coordinates for existence:
	x, errX := strconv.ParseFloat(record[ATHYG_X], 64)
	y, errY := strconv.ParseFloat(record[ATHYG_Y], 64)
	z, errZ := strconv.ParseFloat(record[ATHYG_Z], 64)
	if errX != nil || errY != nil || errZ != nil {
		// This is reasonably common, so does not need an alert.
		// When this occurs, synthesize a placeholder (extremely remote, effectively infinite) distance and corresponding coordinates, as well as a
		// placeholder absolute (intrinsic) magnitude based on the placeholder distance
		equatorial := SphericalVector{ToRadians(ra * 15.0), ToRadians(dec), PLACEHOLDER_CATALOG_DISTANCE}
		cartesian := PolarToCartesian(equatorial)
		x = cartesian[0]
		y = cartesian[1]
		z = cartesian[2]
		mag, err := strconv.ParseFloat(record[ATHYG_MAG], 64)
		if err != nil {
			warning = fmt.Sprintf("warning: star %v was missing an apparent visual magnitude.", athygID)
			mag = PLACEHOLDER_CATALOG_MAGNITUDE
		}
		absmag = mag - 5.0*math.Log10(PLACEHOLDER_CATALOG_DISTANCE/10)
	} else {
		// Already checked coordinates for existence and validity; just need the absolute magnitude
		absmag, err = strconv.ParseFloat(record[ATHYG_ABSMAG], 64)
		if err != nil {
			warning = fmt.Sprintf("warning: star %v was missing an absolute visual magnitude.", athygID)
			absmag = PLACEHOLDER_CATALOG_MAGNITUDE
		}
	}
	// Process the Cartesian velocities. Set them to zero if they aren't present (or can't be read properly).
	vx, err := strconv.ParseFloat(record[ATHYG_VX], 64)
	if err != nil {
		vx = 0.0
	}
	vy, err := strconv.ParseFloat(record[ATHYG_VY], 64)
	if err != nil {
		vy = 0.0
	}
	vz, err := strconv.ParseFloat(record[ATHYG_VZ], 64)
	if err != nil {
		vz = 0.0
	}

	// Create the correct data structure:
	var star = new(Star)
	star.ID, err = strconv.Atoi(athygID)
	if err != nil {
		warning = fmt.Sprintf("warning: star %v has a potentially invalid star ID. Check it for validity.", athygID)
	}
	var starDesignations = new(StarDesignations)
	// the following 4 designations (especially the non-Gaia ones) *will* be missing at times.
	// It is ok for these to be treated as null/empty values in the case where no valid integer value is available.
	starDesignations.Gaia, _ = strconv.ParseInt(gaia, 10, 64)
	starDesignations.HIP, _ = strconv.Atoi(hip)
	starDesignations.HD, _ = strconv.Atoi(hd)
	starDesignations.HR, _ = strconv.Atoi(hr)
	starDesignations.Tycho = tyc
	starDesignations.Gliese = gl
	starDesignations.ProperName = proper
	starDesignations.Bayer = bayer
	starDesignations.Flamsteed = flam
	star.Designations = *starDesignations

	star.Position = CartesianVector{x, y, z}
	star.Velocity = CartesianVector{vx, vy, vz}
	floats.Scale(KmPerSecToParsecPerYear(1.0), star.Velocity) // original data is in km/sec
	star.AbsoluteMag = absmag
	star.Spectrum = spectrum
	star.Constellation = con
	star.Luminosity = AbsMagToLuminosity(absmag)

	// Finally, get correctly canonicalized name
	// The canonical version is based on the first and second non-empty label in the default label ordering.
	primaryLabel, secondaryLabel := GetAthygStarLabels(star, nil)
	name := primaryLabel
	if secondaryLabel != "" {
		name += " (" + secondaryLabel + ")"
	}
	star.Name = name
	// If a format warning was received, pass it along as an error message. The calling function should decide
	// what to do: e.g., keep it with suitable placeholder data, or drop it but keep good records, or fail the entire data load.
	// Currently, it skips records that triggered a warning.
	if warning != "" {
		fmt.Println(warning)
		err = errors.New(warning)
		return star, err
	}
	return star, nil
}

// ReadAthygData loads the AT-HYG data from the file name+path given by [title] into the usual data structure of Star objects.
func ReadAthygData(title string) ([]Star, error) {
	var athygList []Star

	file, err := os.Open(title)

	if err != nil {
		fmt.Println(err)
		return athygList, err
	}

	defer func(file *os.File) {
		err := file.Close()
		if err != nil {

		}
	}(file)

	i := 0
	skips := 0
	csvReader := csv.NewReader(file)
	for {
		rec, err := csvReader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			fmt.Println(err)
			return athygList, err
		}
		// do something with read line
		if i > 0 { // disregard the header row
			starRecord, err := CreateStarFromAthygRecord(rec)
			if err == nil {
				athygList = append(athygList, *starRecord)
			} else {
				skips += 1
			}
		}
		i += 1
	}
	if skips > 0 {
		fmt.Printf("%v record(s) skipped because of read errors.\n", skips)
	}
	return athygList, nil
}

/*
CreateAthygIndex takes a list of standard Star objects [athygStars] and creates a map of common names + IDs to AT-HYG record IDs.
A common use case for this is looking up stars by name or ID without having to resort to SIMBAD or other sources for lookups.
*/
func CreateAthygIndex(athygStars []Star) map[string]int {
	atIndex := make(map[string]int)
	athygCount := len(athygStars)
	for i := 0; i < athygCount; i++ {
		star := athygStars[i]
		atID := star.ID
		con := star.Constellation

		// Add each occurrence of a commonly used ID/label to the index. Multiple IDs/labels are possible for each star.

		if star.Designations.Tycho != "" {
			atIndex["TYC "+star.Designations.Tycho] = atID
		}
		if star.Designations.Gaia > 0 {
			atIndex["Gaia "+strconv.FormatInt(star.Designations.Gaia, 10)] = atID
		}

		if star.Designations.HIP > 0 {
			atIndex["HIP "+strconv.Itoa(star.Designations.HIP)] = atID
		}
		if star.Designations.HR > 0 {
			atIndex["HR "+strconv.Itoa(star.Designations.HR)] = atID
		}
		if star.Designations.ProperName != "" {
			atIndex["Proper Name "+strings.ToLower(star.Designations.ProperName)] = atID
		}
		if star.Designations.Bayer != "" {
			atIndex["Bayer "+MapGreekLetterName(strings.ToLower(star.Designations.Bayer+" "+con))] = atID
			atIndex["Bayer "+MapGreekLetterName(strings.ToLower(star.Designations.Bayer+" "+GetNameForConstellation(con)))] = atID
			atIndex["Bayer "+MapGreekLetterName(strings.ToLower(star.Designations.Bayer+" "+GetGenitiveForConstellation(con)))] = atID
		}
		if star.Designations.Flamsteed != "" {
			atIndex["Flamsteed "+strings.ToLower(star.Designations.Flamsteed+" "+con)] = atID
			atIndex["Flamsteed "+strings.ToLower(star.Designations.Flamsteed+" "+GetNameForConstellation(con))] = atID
			atIndex["Flamsteed "+strings.ToLower(star.Designations.Flamsteed+" "+GetGenitiveForConstellation(con))] = atID
		}
	}
	return atIndex
}

/*
AthygIDTypeLookup takes an ID [id] and attempts to get the most likely catalog ID type in an index created by GenerateAthygIndex.
Note that this makes some assumptions:
- Any integer < 2^17 (128K): A HIPPARCOS catalog (HIP) ID.
- Any integer in the range 2^17 to 2^64: A Gaia (DR2/DR3) ID.
- Any string with exactly two dashes ("-"): A Tycho ID.
Items that fail this quick parse (e.g., a proper name) can still be looked up; it just requires an additional step.
*/
func AthygIDTypeLookup(id string) string {
	var IDType = "other"

	if id == "1" || strings.ToLower(id) == "sun" || strings.ToLower(id) == "sol" {
		IDType = "Sun"
	} else {
		if _, err := strconv.ParseInt(id, 10, 64); err == nil {
			CleanID, _ := strconv.ParseInt(id, 10, 64)
			if CleanID > int64(math.Pow(float64(2), float64(17))) { // cutoff is smaller than any Gaia ID, larger than any HIP ID
				IDType = "Gaia"
			} else {
				IDType = "HIP"
			}
		} else {
			if strings.Count(id, "-") == 2 {
				IDType = "TYC"
			}
		}
	}
	return IDType

}

/*
AthygTargetIDLookup attempts to find the specified ID in an index [atIndex] prepared by CreateAthygIndex.
It returns the AT-HYG DB ID for the star if the lookup is successful, or 0 if it is not.
*/
func AthygTargetIDLookup(atIndex map[string]int, id string) int {
	athygResult := 0
	// if the type was easy to find, use it
	idType := AthygIDTypeLookup(id)
	if idType == "Sun" {
		athygResult = 1 // standard in AT-HYG
	}

	if athygResult == 0 && (idType == "HIP" || idType == "Gaia" || idType == "TYC") {
		athygResult = atIndex[idType+" "+id]
	}

	// check for specific index types that are less easy to find
	idUpper := strings.ToUpper(id)
	if athygResult == 0 && (strings.Contains(idUpper, "HIP") || strings.Contains(idUpper, "TYC") || strings.Contains(idUpper, "HR")) {
		keyTest := idUpper
		if val, isPresent := atIndex[keyTest]; isPresent {
			athygResult = val
		}
	}

	if athygResult == 0 {
		keyTest := "Proper Name " + strings.ToLower(id)
		if val, isPresent := atIndex[keyTest]; isPresent {
			athygResult = val
		}
	}

	if athygResult == 0 {
		keyTest := "Bayer " + MapGreekLetterName(strings.ToLower(id))
		if val, isPresent := atIndex[keyTest]; isPresent {
			athygResult = val
		}
	}

	// Allow, e.g. "alpha X" to be a synonym for "alpha-1 X". This affects a few stars like Alpha Centauri, where the
	// official designations are "alpha-1 Cen" and "alpha-2 Cen".
	if athygResult == 0 {
		locationToAdd := strings.Index(id, " ")
		if locationToAdd > 0 {
			idNew := id[:locationToAdd] + "-1" + id[locationToAdd:]
			keyTest := "Bayer " + MapGreekLetterName(strings.ToLower(idNew))
			if val, isPresent := atIndex[keyTest]; isPresent {
				athygResult = val
			}
		}
	}

	if athygResult == 0 {
		keyTest := "Flamsteed " + strings.ToLower(id)
		if val, isPresent := atIndex[keyTest]; isPresent {
			athygResult = val
		}
	}
	return athygResult
}
