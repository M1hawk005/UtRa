package pathfinding

import (
	"container/heap"
	"errors"
	"math"

	"codeberg.org/astronexus/brahe"
)

// FindPathAStar finds the shortest path using A*
func (g *Graph) FindPathAStar(start, goal *brahe.Star) ([]*brahe.Star, error) {
	pq := make(PriorityQueue, 0)
	heap.Init(&pq)

	gScore := make(map[int]float64)
	cameFrom := make(map[int]*brahe.Star)

	// Initialize
	for id := range g.Nodes {
		gScore[id] = math.Inf(1)
	}
	gScore[start.ID] = 0

	startItem := &Item{
		Star:     start,
		Priority: Distance(start, goal),
	}
	heap.Push(&pq, startItem)

	inQueue := make(map[int]*Item)
	inQueue[start.ID] = startItem

	for pq.Len() > 0 {
		current := heap.Pop(&pq).(*Item).Star
		delete(inQueue, current.ID)

		if current.ID == goal.ID {
			// Reconstruct path
			path := []*brahe.Star{current}
			for curr := current; cameFrom[curr.ID] != nil; {
				curr = cameFrom[curr.ID]
				path = append([]*brahe.Star{curr}, path...)
			}
			return path, nil
		}

		for _, neighbor := range g.GetNeighbors(current) {
			tentativeGScore := gScore[current.ID] + Distance(current, neighbor)
			if tentativeGScore < gScore[neighbor.ID] {
				cameFrom[neighbor.ID] = current
				gScore[neighbor.ID] = tentativeGScore
				fScore := tentativeGScore + Distance(neighbor, goal)

				if item, exists := inQueue[neighbor.ID]; exists {
					item.Priority = fScore
					heap.Fix(&pq, item.Index)
				} else {
					newItem := &Item{
						Star:     neighbor,
						Priority: fScore,
					}
					heap.Push(&pq, newItem)
					inQueue[neighbor.ID] = newItem
				}
			}
		}
	}

	return nil, errors.New("target star is unreachable under our parameters")
}
