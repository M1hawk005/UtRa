package main

import (
	"fmt"
	"log"

	"codeberg.org/astronexus/brahe"
	"github.com/M1hawk005/UtRa/database"
)

func main() {
	fmt.Println("Loading AT-HYG dataset...")
	stars, err := brahe.ReadAthygData("x:/Projects/UtRa/uraniborg/data/athyg_33_subset.csv")
	if err != nil {
		log.Fatalf("Failed to read AT-HYG data: %v", err)
	}

	fmt.Printf("Loaded %d stars from CSV. Initializing local NoSQL DB...\n", len(stars))
	
	db, err := database.NewLocalJSONDatabase("x:/Projects/UtRa/data/nosql_mock/stars")
	if err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	// Ingest first 10,000 stars for development to avoid long delays
	limit := 10000
	if len(stars) < limit {
		limit = len(stars)
	}

	fmt.Printf("Ingesting %d stars into local JSON database...\n", limit)
	for i := 0; i < limit; i++ {
		err := db.SaveStar(&stars[i])
		if err != nil {
			log.Printf("Failed to save star %d: %v", stars[i].ID, err)
		}
		if i > 0 && i%1000 == 0 {
			fmt.Printf("Saved %d stars...\n", i)
		}
	}
	fmt.Println("Ingestion complete!")
}
