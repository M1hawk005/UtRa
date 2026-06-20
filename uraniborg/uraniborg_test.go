/*
uraniborg/uraniborg_tests.go: unit test framework.

Note that many of the items in uraniborg are not particularly suited for unit tests. The following files contain no unit-testable code:

  - consts.go
  - types.go

The following file consists of a single function that bootstraps the entire application, so is not unit-testable either:

  - uraniborg.go

And most of the following files' functions manipulate a graphics context as their primary purpose, making actual
unit testing difficult or nonsensical. These have generally been integration-tested instead by verifying that changes to the
graphics context match expectations, based on other star charts:

  - annotations.go
  - draw.go
  - symbols.go

Additionally, all references to brahe are unit-tested with high coverage in that module, so any function that relies heavily on brahe
gets most of its logic tested indirectly there.

As a result, test coverage will be low compared to a typical module or package.
*/
package main

import (
	"math"
	"strings"
	"testing"

	"codeberg.org/astronexus/brahe"
)

const lowFloatingPointTolerance = 1e-3
const highFloatingPointTolerance = 1e-8
const nonexistentFileName = "nonexistent.yaml"

// closeEnoughFloatLow verifies that 2 floating point numbers are close, with a low precision (relatively high error) accepted.
// This is appropriate for calculations based on data stored to only a few decimal places, like stellar distances or apparent magnitudes.
func closeEnoughFloatLow(f1 float64, f2 float64) bool {
	return math.Abs(f1-f2) < lowFloatingPointTolerance
}

// closeEnoughFloatHigh verifies that 2 floating point numbers are close, with a high precision (relatively low error) accepted.
// This is appropriate for calculations that are expected to be exact (e.g. unit conversions with an explicit conversion factor),
// or expected to be inexact but very precise by nature (e.g. converting degrees to radians via Math.Pi for trig functions)
func closeEnoughFloatHigh(f1 float64, f2 float64) bool {
	return math.Abs(f1-f2) < highFloatingPointTolerance
}

/* TestConfigurationLoad tests the basic user configuration loading. */
func TestConfigurationLoad(t *testing.T) {
	rawConfig, err := ReadUserConfigFile(GetConfigurationDirectory() + USER_CONFIG_FILE)

	// -- Test 1: User config
	if err != nil {
		t.Fatalf("Loading the standard user config file led to an error: %v\n", err)
	}

	config, err := MergeUserConfig(rawConfig)
	if err != nil {
		t.Fatalf("Merging components of the standard user config file led to an error: %v\n", err)
	}

	// Test values read from main file
	// Acceptance criteria: all values match expected value
	if config.Preset != "mag_6" {
		t.Fatalf("Non-default preset found: %v\n", config.Preset)
	}

	if strings.ToLower(config.From) != "sol" {
		t.Fatalf("Non-default 'from' value' found: %v\n", config.From)
	}

	if strings.ToLower(config.To) != "polaris" {
		t.Fatalf("Non-default 'to' value' found: %v\n", config.From)
	}

	// Test values inferred from preset
	// Acceptance criteria: all values match expected value
	if config.Magnitude != 6.0 {
		t.Fatalf("Unexpected 'magnitude' value found for preset '%v': %v\n", config.Preset, config.Magnitude)
	}

	if config.MagnitudeLabel != 2.0 {
		t.Fatalf("Unexpected 'magnitudelabel' value found for preset '%v': %v\n", config.Preset, config.MagnitudeLabel)
	}

	if config.Scale != 0.75 {
		t.Fatalf("Unexpected 'scale' value found for preset '%v': %v\n", config.Preset, config.Scale)
	}

	if config.Projection != 2 {
		t.Fatalf("Unexpected 'projection' value found for preset '%v': %v\n", config.Preset, config.Projection)
	}

	// Test key values inferred from default configuration (neither set in main file nor set by preset)
	// Acceptance criteria: all values match expected value
	if config.Width != 1024 {
		t.Fatalf("Unexpected 'width' value found for default: %v\n", config.Width)
	}

	if config.DistanceLabel != 10.0 {
		t.Fatalf("Unexpected 'distancelabel' value found for default: %v\n", config.DistanceLabel)
	}

	// Test 2: Application config
	appConfig, err := ReadApplicationConfigFile(GetConfigurationDirectory() + APPLICATION_CONFIG_FILE)

	if err != nil {
		t.Fatalf("Loading the standard application config file led to an error: %v\n", err)
	}

	if appConfig.Concurrency != 1 {
		t.Fatalf("Unexpected 'concurrency' value found for default application config: %v\n", appConfig.Concurrency)
	}

	if appConfig.DataFile != DEFAULT_DATA_FILE {
		t.Fatalf("Unexpected 'datafile' value found for default application config: %v\n", appConfig.DataFile)
	}
}

func TestSchemeLoad(t *testing.T) {
	validScheme := "retro"
	_, err := ReadUserScheme(validScheme)

	if err != nil {
		t.Fatalf("Failed to load existing scheme file '%v'.\n", validScheme)
	}

	invalidScheme := nonexistentFileName
	scheme, err2 := ReadUserScheme(invalidScheme)

	if err2 != nil || scheme.Name != DEFAULT_SCHEME_NAME {
		t.Fatalf("Failed to load a default scheme when failing to load nonexistent scheme file '%v'.\n", invalidScheme)
	}

}

/* TestConfigurationLimitEnforcement tests enforcement of limits and/or requirements for configuration settings. */
func TestConfigurationLimitEnforcement(t *testing.T) {

	// -- Test 1: Try to load bad user config

	config, err := ReadUserConfigFile(GetConfigurationDirectory() + nonexistentFileName)
	if err == nil {
		t.Fatalf("Trying to load a nonexistent file '%v' did not generate an error\n", nonexistentFileName)
	}

	// -- Test 2: Known good user config

	config, err = ReadUserConfigFile(GetConfigurationDirectory() + USER_CONFIG_FILE)
	if err != nil {
		t.Fatalf("Loading the standard user config file led to an error: %v\n", err)
	}

	// Subtest 1: magnitude limit
	config.Magnitude = MAX_MAGNITUDE + 1.0
	config = SetConfigLimits(config)

	want := config.Magnitude
	expect := MAX_MAGNITUDE

	if want != expect {
		t.Fatalf("Config maximum magnitude not enforced correctly. Got %v, expected %v.\n", want, expect)
	}

	// Subtest 2: width limits
	config.Width = MAX_WIDTH + 1
	config = SetConfigLimits(config)

	wantInt := config.Width
	expectInt := MAX_WIDTH

	if wantInt != expectInt {
		t.Fatalf("Config maximum width not enforced correctly. Got %v, expected %v.\n", wantInt, expectInt)
	}

	config.Width = MIN_WIDTH - 1
	config = SetConfigLimits(config)

	wantInt = config.Width
	expectInt = MIN_WIDTH

	if wantInt != expectInt {
		t.Fatalf("Config minimum width not enforced correctly. Got %v, expected %v.\n", wantInt, expectInt)
	}

	// Subtest 3: Scale limits
	config.Scale = MAX_SCALE + 1
	config = SetConfigLimits(config)

	want = config.Scale
	expect = MAX_SCALE

	if want != expect {
		t.Fatalf("Config maximum scale not enforced correctly. Got %v, expected %v.\n", want, expect)
	}

	config.Scale = MIN_SCALE - 1
	config = SetConfigLimits(config)

	want = config.Scale
	expect = MIN_SCALE

	if want != expect {
		t.Fatalf("Config minimum scale not enforced correctly. Got %v, expected %v.\n", want, expect)
	}

	// Subtest 4: Aspect ratio limits
	config.Aspect = MAX_ASPECT + 1
	config = SetConfigLimits(config)

	want = config.Aspect
	expect = MAX_ASPECT

	if want != expect {
		t.Fatalf("Config maximum aspect ratio not enforced correctly. Got %v, expected %v.\n", want, expect)
	}

	config.Aspect = MIN_ASPECT - 1
	config = SetConfigLimits(config)

	want = config.Aspect
	expect = MIN_ASPECT

	if want != expect {
		t.Fatalf("Config minimum aspect ratio not enforced correctly. Got %v, expected %v.\n", want, expect)
	}

	// Test 2: verify filename gets the ".png" extension
	config.ChartName = "test"
	config = SetConfigLimits(config)

	wantStr := config.ChartName
	expectStr := "test.png"

	if wantStr != expectStr {
		t.Fatalf("Config chart name not set correctly to a '.png' file extension. Got %v, expected %v.\n", wantStr, expectStr)
	}

}

/* TestDataLoad verifies there are no errors loading the sample data file included with uraniborg. */
func TestDataLoad(t *testing.T) {

	appConfig, err := ReadApplicationConfigFile(GetConfigurationDirectory() + APPLICATION_CONFIG_FILE)
	if err != nil {
		t.Fatalf("Loading the standard application config file led to an error: %v\n", err)
	}

	fileData := LoadUraniborgData(appConfig)
	// Acceptance criterion: Any read error of the default data file is an automatic failure case
	if len(fileData) < 1 {
		t.Fatalf("LoadUraniborgData failed; no records found")
	}

	appConfig.DataFile = nonexistentFileName
	fileData = LoadUraniborgData(appConfig)
	// Acceptance criterion: Bad file name triggers default file load
	if len(fileData) < 1 {
		t.Fatalf("LoadUraniborgData check for default file failed; no records found")
	}
}

/* TestConfigurationItems tests operations on configuration items. */
func TestConfigurationItems(t *testing.T) {

	rawConfig, err := ReadUserConfigFile(GetConfigurationDirectory() + USER_CONFIG_FILE)
	if err != nil {
		t.Fatalf("Loading the standard user config file led to an error: %v\n", err)
	}
	config, err := MergeUserConfig(rawConfig)
	if err != nil {
		t.Fatalf("Merging the standard user config file led to an error: %v\n", err)
	}
	// Test view angle calculation
	// Acceptance criterion: value matches direct calculation
	wantFloat := config.Aspect * BASE_ANGLE_MULTIPLIER / config.Scale
	expectFloat := GetViewAngleForConfig(config)

	if !closeEnoughFloatHigh(wantFloat, expectFloat) {
		t.Fatalf("GetViewAngleForConfig error: got %v, expected %v\n", wantFloat, expectFloat)
	}

	// Test time frame calculation
	// Acceptance criterion: value matches direct calculation
	wantFloat = 0.0
	expectFloat = GetTimeDifferenceForConfig(config)

	if !closeEnoughFloatHigh(wantFloat, expectFloat) {
		t.Fatalf("GetTimeDifferenceForConfig error: got %v, expected %v\n", wantFloat, expectFloat)
	}
}

/* TestStarInitialization tests setting up Star objects. */
func TestStarInitialization(t *testing.T) {

	// Test creation of an arbitrary point in space
	name := "Cygnus X-123"
	position := brahe.CartesianVector{1, 0, 0}
	point := CreateArbitrarySpacePoint(name, position)

	want := point.Name
	expect := name
	if want != expect {
		t.Fatalf("CreateArbitrarySpacePoint name error: got '%v', expected '%v'.\n", want, expect)
	}

	// Test creation of an arbitrary point in space from a combined name+position string
	starConfig := "Cygnus X-123,1,0,0"
	customID := -1000
	star, err := InitializeStarObject(nil, nil, starConfig, customID)

	if err != nil {
		t.Fatalf("InitializeStarObject: Creating a test star led to an error: %v\n", err)
	}

	if star.ID != customID {
		t.Fatalf("InitializeStarObject name error: got '%v', expected '%v'.\n", star.ID, customID)
	}
}
