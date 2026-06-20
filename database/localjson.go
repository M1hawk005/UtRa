package database

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"

	"strings"

	"codeberg.org/astronexus/brahe"
)

// LocalJSONDatabase implements StarDatabase using individual JSON files
// for each star. This serves as a local mock for a scalable NoSQL DB.
type LocalJSONDatabase struct {
	baseDir string
	stars   map[int]*brahe.Star // In-memory cache for fast pathfinding
}

// NewLocalJSONDatabase initializes the local JSON database
func NewLocalJSONDatabase(baseDir string) (*LocalJSONDatabase, error) {
	err := os.MkdirAll(baseDir, 0755)
	if err != nil {
		return nil, err
	}
	db := &LocalJSONDatabase{
		baseDir: baseDir,
		stars:   make(map[int]*brahe.Star),
	}
	err = db.loadAllIntoMemory()
	if err != nil {
		return nil, err
	}
	return db, nil
}

func (db *LocalJSONDatabase) loadAllIntoMemory() error {
	entries, err := ioutil.ReadDir(db.baseDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			path := filepath.Join(db.baseDir, entry.Name())
			data, err := ioutil.ReadFile(path)
			if err != nil {
				continue
			}
			var star brahe.Star
			if err := json.Unmarshal(data, &star); err == nil {
				db.stars[star.ID] = &star
			}
		}
	}
	return nil
}

func (db *LocalJSONDatabase) GetStar(id int) (*brahe.Star, error) {
	if star, ok := db.stars[id]; ok {
		return star, nil
	}
	return nil, fmt.Errorf("star with ID %d not found", id)
}

func (db *LocalJSONDatabase) GetStarByName(name string) (*brahe.Star, error) {
	nameLower := strings.ToLower(name)
	for _, star := range db.stars {
		if strings.ToLower(star.Name) == nameLower || strings.HasPrefix(strings.ToLower(star.Name), nameLower+" ") {
			return star, nil
		}
		if strings.ToLower(star.Designations.ProperName) == nameLower {
			return star, nil
		}
		if star.Designations.Bayer != "" && strings.ToLower(star.Designations.Bayer+" "+star.Constellation) == nameLower {
			return star, nil
		}
	}
	return nil, fmt.Errorf("star with name %s not found", name)
}

func (db *LocalJSONDatabase) GetAllStars() ([]brahe.Star, error) {
	result := make([]brahe.Star, 0, len(db.stars))
	for _, star := range db.stars {
		result = append(result, *star)
	}
	return result, nil
}

func (db *LocalJSONDatabase) SaveStar(star *brahe.Star) error {
	db.stars[star.ID] = star
	data, err := json.MarshalIndent(star, "", "  ")
	if err != nil {
		return err
	}
	filename := filepath.Join(db.baseDir, fmt.Sprintf("%d.json", star.ID))
	return ioutil.WriteFile(filename, data, 0644)
}
