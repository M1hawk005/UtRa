package main

import (
	"fmt"
	"log"
	"math"
	"os"
	"strconv"
	"strings"

	"github.com/M1hawk005/UtRa/database"
	"github.com/M1hawk005/UtRa/pathfinding"
)

func main() {
	if len(os.Args) < 4 {
		fmt.Println("Usage: utra <start_star_name> <end_star_name> <max_jump_distance> [speed_fraction_of_c]")
		os.Exit(1)
	}

	startName := os.Args[1]
	endName := os.Args[2]
	maxDistStr := os.Args[3]

	maxDist, err := strconv.ParseFloat(maxDistStr, 64)
	if err != nil {
		log.Fatalf("Invalid max jump distance: %v", err)
	}

	db, err := database.NewLocalJSONDatabase("data/nosql_mock/stars")
	if err != nil {
		log.Fatalf("Failed to load database: %v. Did you run the ingester?", err)
	}

	fmt.Println("Database loaded. Searching for stars...")
	startStar, err := db.GetStarByName(startName)
	if err != nil {
		log.Fatalf("Start star not found: %v", err)
	}
	endStar, err := db.GetStarByName(endName)
	if err != nil {
		log.Fatalf("End star not found: %v", err)
	}

	fmt.Printf("Calculating optimal route from '%s' to '%s' with max jump %.2f pc...\n", startStar.Name, endStar.Name, maxDist)
	allStars, _ := db.GetAllStars()
	graph := pathfinding.NewGraph(allStars, maxDist)

	path, err := graph.FindPathAStar(startStar, endStar)
	if err != nil {
		fmt.Printf("\nWARNING: %v\n", err)
		os.Exit(1)
	}

	speedC := 0.99
	if len(os.Args) >= 5 {
		if s, err := strconv.ParseFloat(os.Args[4], 64); err == nil && s > 0 && s < 1 {
			speedC = s
		} else {
			fmt.Println("Warning: invalid speed provided. Using 0.99c. Speed must be between 0 and 1 exclusive.")
		}
	}

	gamma := 1.0 / math.Sqrt(1.0-speedC*speedC)
	pcToLy := 3.26156

	fmt.Println("\nRoute Map:")
	var mapBuilder strings.Builder
	for i, s := range path {
		if i == 0 {
			mapBuilder.WriteString(s.Name)
		} else {
			dist := pathfinding.Distance(path[i-1], s)
			mapBuilder.WriteString(fmt.Sprintf(" --- %.2f pc ---> %s", dist, s.Name))
		}
	}
	fmt.Println(mapBuilder.String())

	fmt.Println("\nHop Details:")
	totalDist := 0.0
	totalObsTime := 0.0
	totalShipTime := 0.0

	for i := 1; i < len(path); i++ {
		s1 := path[i-1]
		s2 := path[i]
		dist := pathfinding.Distance(s1, s2)
		distLy := dist * pcToLy
		obsTime := distLy / speedC
		shipTime := obsTime / gamma

		totalDist += dist
		totalObsTime += obsTime
		totalShipTime += shipTime

		fmt.Printf("Hop %d: %s -> %s\n", i, s1.Name, s2.Name)
		fmt.Printf("  Distance: %.2f pc (%.2f ly)\n", dist, distLy)
		fmt.Printf("  Time (Observer): %.2f years\n", obsTime)
		fmt.Printf("  Time (Ship/Crew): %.2f years\n", shipTime)
	}

	fmt.Printf("\n--- Trip Summary ---\n")
	fmt.Printf("Total Distance: %.2f pc (%.2f ly)\n", totalDist, totalDist*pcToLy)
	fmt.Printf("Ship Speed: %.4fc (Lorentz factor γ = %.2f)\n", speedC, gamma)
	fmt.Printf("Total Time (Outside Observer): %.2f years\n", totalObsTime)
	fmt.Printf("Total Time (Ship/Crew experienced): %.2f years\n", totalShipTime)
}
