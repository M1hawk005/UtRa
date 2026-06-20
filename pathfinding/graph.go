package pathfinding

import (
	"math"

	"codeberg.org/astronexus/brahe"
)

// Graph represents a stellar navigation network
type Graph struct {
	Nodes    map[int]*brahe.Star
	MaxDist  float64 // Constraint: Maximum jump distance
}

// NewGraph creates a new navigation graph from a list of stars
func NewGraph(stars []brahe.Star, maxDist float64) *Graph {
	nodes := make(map[int]*brahe.Star)
	for i := range stars {
		nodes[stars[i].ID] = &stars[i]
	}
	return &Graph{
		Nodes:   nodes,
		MaxDist: maxDist,
	}
}

// Distance calculates the Euclidean distance between two stars in parsecs
func Distance(s1, s2 *brahe.Star) float64 {
	dx := s1.Position[0] - s2.Position[0]
	dy := s1.Position[1] - s2.Position[1]
	dz := s1.Position[2] - s2.Position[2]
	return math.Sqrt(dx*dx + dy*dy + dz*dz)
}

// GetNeighbors returns all reachable stars from a given star within MaxDist
func (g *Graph) GetNeighbors(u *brahe.Star) []*brahe.Star {
	var neighbors []*brahe.Star
	for _, v := range g.Nodes {
		if u.ID == v.ID {
			continue
		}
		dist := Distance(u, v)
		if dist <= g.MaxDist {
			neighbors = append(neighbors, v)
		}
	}
	return neighbors
}
