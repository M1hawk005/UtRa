package main

import (
	"fmt"
	"log"
	"os"

	"codeberg.org/astronexus/brahe"
	"github.com/M1hawk005/UtRa/database"
)

func main() {
	datasetPath := "x:/Projects/UtRa/uraniborg/data/athyg_33_subset.csv"

	if _, err := os.Stat(datasetPath); os.IsNotExist(err) {
		log.Fatalf("Dataset not found at %s. Please ensure the dataset is present.", datasetPath)
	}

	fmt.Println("Loading AT-HYG dataset...")
	stars, err := brahe.ReadAthygData(datasetPath)
	if err != nil {
		log.Fatalf("Failed to read AT-HYG data: %v", err)
	}

	fmt.Printf("Loaded %d stars from CSV. Initializing local NoSQL DB...\n", len(stars))
	
	db, err := database.NewLocalJSONDatabase("x:/Projects/UtRa/data/nosql_mock/stars")
	if err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	// To prevent the sky from being half-empty due to RA ordering,
	// we will uniformly sample 10,000 stars from the entire dataset.
	limit := 10000
	if len(stars) < limit {
		limit = len(stars)
	}

	fmt.Printf("Ingesting %d uniformly sampled stars into local JSON database...\n", limit)
	step := len(stars) / limit
	if step == 0 {
		step = 1
	}

	count := 0
	for i := 0; i < len(stars) && count < limit; i += step {
		err := db.SaveStar(&stars[i])
		if err != nil {
			log.Printf("Failed to save star %d: %v", stars[i].ID, err)
		}
		count++
		if count > 0 && count%1000 == 0 {
			fmt.Printf("Saved %d stars...\n", count)
		}
	}
	fmt.Println("Ingestion complete!")
}
