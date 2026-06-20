// uraniborg/flags.go: functions for managing command-line flags
package main

import (
	"flag"
)

var UserSupportDir string
var UserImages string
var UserData string
var UserConfigs string
var UserFonts string

// Functions that are purely internal to this file:

// registerStringFlag checks to see if the existing string + flag configuration is already "registered".
// If it is, return the previously parsed flag. Otherwise, create a new flag with the specified attributes.
func registerStringFlag(p *string, name string, value string, usage string) {
	if flag.Lookup(name) == nil {
		flag.StringVar(p, name, value, usage)
	}
}

// getStringFlag checks for the existing flag variable by name, and returns whatever value is found.
func getStringFlag(name string) string {
	return flag.Lookup(name).Value.(flag.Getter).Get().(string)
}

// init registers the specified flags.
func init() {
	registerStringFlag(&UserSupportDir, "b", DEFAULT_BASE_DIR, "path to support files directory")
	registerStringFlag(&UserImages, "i", DEFAULT_CHARTS_DIR, "path to images (charts) subdirectory within support files directory")
	registerStringFlag(&UserData, "d", DEFAULT_DATA_DIR, "path to data file subdirectory within support files directory")
	registerStringFlag(&UserConfigs, "c", DEFAULT_CONFIG_DIR, "path to configuration file subdirectory within support files directory")
	registerStringFlag(&UserFonts, "f", DEFAULT_FONT_DIR, "path to font subdirectory within support files directory")
}

// Functions that can be used elsewhere, e.g., in configuration setup:

// InitializeFlags sets the specified variables to the values of the (previously registered) flag variables.
func InitializeFlags() {
	UserSupportDir = getStringFlag("b")
	UserImages = getStringFlag("i")
	UserData = getStringFlag("d")
	UserConfigs = getStringFlag("c")
	UserFonts = getStringFlag("f")
}

// GetConfigurationDirectory gets the current value of the user configuration directory.
func GetConfigurationDirectory() string {
	return UserSupportDir + "/" + UserConfigs + "/"
}

// GetDataDirectory gets the current value of the data file directory.
func GetDataDirectory() string {
	return UserSupportDir + "/" + UserData + "/"
}

// GetChartsDirectory gets the current value of the chart image directory.
func GetChartsDirectory() string {
	return UserSupportDir + "/" + UserImages + "/"
}

// GetFontDirectory gets the current value of the font directory.
func GetFontDirectory() string {
	return UserSupportDir + "/" + UserFonts + "/"
}
