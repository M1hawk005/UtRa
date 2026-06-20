// uraniborg/configuration.go: functions for managing user configuration file I/O
package main

import (
	"fmt"
	"io"
	"os"
	"regexp"
	"runtime"
	"strings"

	"gopkg.in/yaml.v3"

	"dario.cat/mergo"
)

/*
ReadUserFile reads a file from location [filepath] to any data type defined as being FileLoadable.
*/
func ReadUserFile[T FileLoadable](filepath string) (T, error) {
	var data T

	f, err := os.Open(filepath)
	if err != nil {
		fmt.Println(err)
		return data, err
	}

	defer func(f *os.File) {
		err := f.Close()
		if err != nil {
			fmt.Println(err)
		}
	}(f)

	bytes, err := io.ReadAll(f)
	if err == nil {
		err := yaml.Unmarshal(bytes, &data)
		if err != nil {
			return data, err
		}
	}

	return data, err
}

// Specific file load types here:

/*
ReadApplicationConfigFile reads a YAML file [filepath] containing valid fields for an ApplicationConfiguration struct.
Returns the resulting configuration struct, with suitable defaults for key fields.
*/

func ReadApplicationConfigFile(filepath string) (ApplicationConfiguration, error) {
	config, err := ReadUserFile[ApplicationConfiguration](filepath)
	if err != nil {
		panic("Could not load application configuration. Stopping.")
	} else {
		if config.Concurrency < 1 {
			config.Concurrency = 1
		}
		if config.Concurrency > runtime.NumCPU() {
			config.Concurrency = runtime.NumCPU()
			fmt.Printf("Specified concurrency is larger than available; using %v as the value.\n", config.Concurrency)
		}
	}
	return config, nil
}

/*
ReadUserConfigFile reads a YAML file [filepath] containing valid fields for a UserConfiguration struct.
Returns the resulting configuration struct.
*/
func ReadUserConfigFile(filepath string) (UserConfiguration, error) {
	return ReadUserFile[UserConfiguration](filepath)
}

/*
ReadSchemeFile reads a YAML file [filepath] containing valid fields for a ChartScheme struct.
Returns the resulting configuration struct.
*/

func ReadSchemeFile(filepath string) (ChartScheme, error) {
	return ReadUserFile[ChartScheme](filepath)
}

/*
MergeUserConfig merges the current user-settable configuration [config] with other configuration items,
such as ones enabled by presets and defaults.
Returns the configuration found (after applying presets and defaults).
*/
func MergeUserConfig(config UserConfiguration) (UserConfiguration, error) {

	// Load color and style scheme (note: will choose a default scheme if the name is missing)
	scheme, schemeError := ReadUserScheme(config.Scheme)
	if schemeError != nil {
		panic("No valid color/style scheme found. Tried to lookup scheme name " + config.Scheme)
	} else {
		config.SchemeData = &scheme
	}

	// Apply preset config when available.
	preset := config.Preset
	if preset != "" {
		presetData, presetError := ReadUserConfigFile(GetConfigurationDirectory() + CONFIG_PRESETS_DIR + preset + ".yaml")
		if presetError != nil {
			fmt.Printf("Preset '%v' was not found; using global configuration defaults instead.\n", preset)
		} else {
			if mergeError := mergo.Merge(&config, presetData); mergeError != nil {
				fmt.Printf("Failed to combine preset values with existing ones. Error was '%s'.\n", mergeError)
				return config, mergeError
			}
		}
	}
	// Set some defaults for anything as yet unset
	defaultData, defaultError := ReadUserConfigFile(GetConfigurationDirectory() + DEFAULT_CONFIG_FILE)
	if defaultError != nil {
		fmt.Printf("Default configuration values were not found. Configuration could not be generated.\n")
		return config, defaultError
	} else {
		if mergeError := mergo.Merge(&config, defaultData); mergeError != nil {
			fmt.Printf("Failed to combine default configuration values with existing ones. Error was '%s'.\n", mergeError)
			return config, mergeError
		}
	}

	// Enforce limits on config values
	config = SetConfigLimits(config)

	fmt.Printf(ALERT_HEADER + " Successfully loaded final user configuration file.\n")
	return config, nil
}

/*
ReadUserScheme reads a YAML file [filename], which is a color/style scheme file, by name.
Returns the scheme ready to be incorporated into config.
*/
func ReadUserScheme(filename string) (ChartScheme, error) {

	var scheme ChartScheme
	defaultFileName := GetConfigurationDirectory() + DEFAULT_SCHEME_FILE
	fullFilename := GetConfigurationDirectory() + CONFIG_SCHEMES_DIR + filename + ".yaml"
	if filename == "" {
		// If the filename is known to be bad, skip the preliminaries and load the default
		fullFilename = defaultFileName
	}
	scheme, schemeError := ReadSchemeFile(fullFilename)
	if schemeError != nil {
		scheme, schemeError := ReadSchemeFile(defaultFileName)
		if schemeError != nil {
			fmt.Printf("Error loading user scheme file '%s'.\n", filename)
			return scheme, schemeError
		} else {
			return scheme, nil
		}
	} else {
		return scheme, nil
	}
}

/*
SetConfigLimits applies limits to certain configuration items in the configuration [config], so they can't be set to unreasonable values.
*/
func SetConfigLimits(config UserConfiguration) UserConfiguration {

	// Allowed image file types. Defaults to "png", and only "jpeg" (or variant "jpg") is allowed as an alternative.
	cleanFormat := strings.ToLower(config.ImageFormat)
	if cleanFormat != "jpeg" && cleanFormat != "jpg" {
		config.ImageFormat = "png"
	} else {
		config.ImageFormat = cleanFormat
	}

	// Allowed file name characters: alphanumeric and dashes and underscores
	cleanCharRegex := regexp.MustCompile(`[^a-zA-Z0-9_\-\w]+`)
	graphicFileEnding := "." + config.ImageFormat
	if config.ChartName != "" && !strings.Contains(config.ChartName, graphicFileEnding) {
		fmt.Printf("Old chartname was %v.\n", config.ChartName)
		config.ChartName = cleanCharRegex.ReplaceAllString(config.ChartName, "") + graphicFileEnding
		fmt.Printf("New chartname is %v.\n", config.ChartName)
	}

	if config.ChartName == "" {
		config.ChartName = OUTPUT_FILE + "." + config.ImageFormat
	}

	if config.Magnitude > MAX_MAGNITUDE {
		config.Magnitude = MAX_MAGNITUDE
	}

	if config.Width > MAX_WIDTH {
		config.Width = MAX_WIDTH
	}

	if config.Width < MIN_WIDTH {
		config.Width = MIN_WIDTH
	}

	if config.Scale > MAX_SCALE {
		config.Scale = MAX_SCALE
	}

	if config.Scale < MIN_SCALE {
		config.Scale = MIN_SCALE
	}

	if config.Aspect > MAX_ASPECT {
		config.Aspect = MAX_ASPECT
	}

	if config.Aspect < MIN_ASPECT {
		config.Aspect = MIN_ASPECT
	}

	return config
}
