package server

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"

	"codeberg.org/astronexus/brahe"
	"github.com/M1hawk005/UtRa/pathfinding"
)

const (
	maxJumpDistancePC = 500.0
	parsecToLightYear = 3.26156
)

type legacyStarResponse struct {
	Name   string  `json:"n"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Z      float64 `json:"z"`
	Spec   string  `json:"s"`
	AbsMag float64 `json:"m"`
}

type legacyHopResponse struct {
	Name     string  `json:"name"`
	DistPC   float64 `json:"dist_pc"`
	ObsTime  float64 `json:"obs_time"`
	ShipTime float64 `json:"ship_time"`
}

type legacyPathResponse struct {
	Hops          []legacyHopResponse `json:"hops"`
	TotalDistPC   float64             `json:"total_dist_pc"`
	TotalObsTime  float64             `json:"total_obs_time"`
	TotalShipTime float64             `json:"total_ship_time"`
}

func (s *Server) handleLegacyStars(w http.ResponseWriter, _ *http.Request) {
	response := make([]legacyStarResponse, len(s.stars))
	for i, star := range s.stars {
		response[i] = legacyStarResponse{
			Name:   star.Name,
			X:      star.Position[0],
			Y:      star.Position[1],
			Z:      star.Position[2],
			Spec:   star.Spectrum,
			AbsMag: star.AbsoluteMag,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

func (s *Server) handleLegacyPath(w http.ResponseWriter, r *http.Request) {
	distance, err := strconv.ParseFloat(r.URL.Query().Get("dist"), 64)
	if err != nil || !isFinite(distance) || distance <= 0 || distance > maxJumpDistancePC {
		http.Error(w, "Invalid distance", http.StatusBadRequest)
		return
	}

	speed := 0.99
	if parsed, err := strconv.ParseFloat(r.URL.Query().Get("speed"), 64); err == nil && isFinite(parsed) && parsed > 0 && parsed < 1 {
		speed = parsed
	}

	start, err := s.db.GetStarByName(r.URL.Query().Get("start"))
	if err != nil {
		http.Error(w, "Start star not found", http.StatusNotFound)
		return
	}
	end, err := s.db.GetStarByName(r.URL.Query().Get("end"))
	if err != nil {
		http.Error(w, "End star not found", http.StatusNotFound)
		return
	}

	path, err := pathfinding.NewGraph(s.stars, distance).FindPathAStar(start, end)
	if err != nil {
		http.Error(w, "Unreachable", http.StatusNotFound)
		return
	}

	response := routeResponse(path, speed)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

func routeResponse(path []*brahe.Star, speed float64) legacyPathResponse {
	response := legacyPathResponse{
		Hops: []legacyHopResponse{{Name: path[0].Name}},
	}
	gamma := 1 / math.Sqrt(1-speed*speed)
	for i := 1; i < len(path); i++ {
		distance := pathfinding.Distance(path[i-1], path[i])
		observerTime := distance * parsecToLightYear / speed
		shipTime := observerTime / gamma
		response.TotalDistPC += distance
		response.TotalObsTime += observerTime
		response.TotalShipTime += shipTime
		response.Hops = append(response.Hops, legacyHopResponse{
			Name:     path[i].Name,
			DistPC:   distance,
			ObsTime:  observerTime,
			ShipTime: shipTime,
		})
	}
	return response
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
