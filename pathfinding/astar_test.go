package pathfinding

import (
	"testing"

	"codeberg.org/astronexus/brahe"
)

func TestAStarPathfinding(t *testing.T) {
	// Create mock stars for testing
	stars := []brahe.Star{
		{ID: 1, Name: "A", Position: brahe.CartesianVector{0, 0, 0}},
		{ID: 2, Name: "B", Position: brahe.CartesianVector{1, 0, 0}},
		{ID: 3, Name: "C", Position: brahe.CartesianVector{2, 0, 0}},
		{ID: 4, Name: "D", Position: brahe.CartesianVector{1, 1, 0}},
	}

	// Max dist of 1.5 should allow A -> B -> C but NOT A -> C directly
	graph := NewGraph(stars, 1.5)

	path, err := graph.FindPathAStar(&stars[0], &stars[2])
	if err != nil {
		t.Fatalf("Expected to find path, got error: %v", err)
	}

	if len(path) != 3 {
		t.Fatalf("Expected path length of 3 (A->B->C), got %d", len(path))
	}

	if path[0].Name != "A" || path[1].Name != "B" || path[2].Name != "C" {
		t.Errorf("Path is incorrect. Got %s -> %s -> %s", path[0].Name, path[1].Name, path[2].Name)
	}

	// Max dist of 0.5 should make C unreachable from A
	graphUnreachable := NewGraph(stars, 0.5)
	_, err = graphUnreachable.FindPathAStar(&stars[0], &stars[2])
	if err == nil {
		t.Fatal("Expected error for unreachable target, got nil")
	}
}

func TestDistance(t *testing.T) {
	s1 := &brahe.Star{Position: brahe.CartesianVector{0, 0, 0}}
	s2 := &brahe.Star{Position: brahe.CartesianVector{3, 4, 0}}

	dist := Distance(s1, s2)
	if dist != 5.0 {
		t.Errorf("Expected distance 5.0, got %f", dist)
	}
}
