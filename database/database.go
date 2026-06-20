package database

import "codeberg.org/astronexus/brahe"

// StarDatabase represents a NoSQL-like document database interface
// designed to scale to millions of stars in production (e.g. MongoDB).
type StarDatabase interface {
	// GetStar retrieves a single star document by its ID
	GetStar(id int) (*brahe.Star, error)
	// GetStarByName retrieves a star by its canonical name or designation
	GetStarByName(name string) (*brahe.Star, error)
	// GetAllStars retrieves all stars (useful for building graphs for subsets)
	GetAllStars() ([]brahe.Star, error)
	// SaveStar saves or updates a single star document
	SaveStar(star *brahe.Star) error
}
