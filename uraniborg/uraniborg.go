// uraniborg/uraniborg.go: process data from the Tycho-2 catalog (with additional information from Gaia) and render simple charts.
package main

import (
	"flag"
	"fmt"

	"codeberg.org/astronexus/brahe"
)

// main: generate a chart. Its job is to find which data set to load, create an index of names and IDs for the stars in the data set, and then launch an event
// monitor to watch for configuration changes.
func main() {

	flag.Parse()
	InitializeFlags()

	fmt.Println(ALERT_HEADER + " Starting up, loading application configuration from " + APPLICATION_CONFIG_FILE)
	applicationConfig, _ := ReadApplicationConfigFile(GetConfigurationDirectory() + APPLICATION_CONFIG_FILE)
	athygStars := LoadUraniborgData(applicationConfig)
	athygIndex := brahe.CreateAthygIndex(athygStars)
	FileMonitor(athygStars, athygIndex, applicationConfig.Concurrency)
}
