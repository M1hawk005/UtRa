package main

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/M1hawk005/UtRa/database"
	"github.com/M1hawk005/UtRa/pathfinding"
)

type StarResponse struct {
	Name   string  `json:"n"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Z      float64 `json:"z"`
	Spec   string  `json:"s"`
	AbsMag float64 `json:"m"`
}

type HopResponse struct {
	Name     string  `json:"name"`
	DistPC   float64 `json:"dist_pc"`
	ObsTime  float64 `json:"obs_time"`
	ShipTime float64 `json:"ship_time"`
}

type PathResponse struct {
	Hops          []HopResponse `json:"hops"`
	TotalDistPC   float64       `json:"total_dist_pc"`
	TotalObsTime  float64       `json:"total_obs_time"`
	TotalShipTime float64       `json:"total_ship_time"`
}

func main() {
	db, err := database.NewLocalJSONDatabase("data/nosql_mock/stars")
	if err != nil {
		log.Fatalf("Failed to load database: %v", err)
	}

	allStars, _ := db.GetAllStars()

	http.Handle("/", http.FileServer(http.Dir("./public")))

	http.HandleFunc("/api/stars", func(w http.ResponseWriter, r *http.Request) {
		resp := make([]StarResponse, len(allStars))
		for i, s := range allStars {
			resp[i] = StarResponse{
				Name:   s.Name,
				X:      s.Position[0],
				Y:      s.Position[1],
				Z:      s.Position[2],
				Spec:   s.Spectrum,
				AbsMag: s.AbsoluteMag,
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	http.HandleFunc("/api/path", func(w http.ResponseWriter, r *http.Request) {
		start := r.URL.Query().Get("start")
		end := r.URL.Query().Get("end")
		distStr := r.URL.Query().Get("dist")
		speedStr := r.URL.Query().Get("speed")

		dist, err := strconv.ParseFloat(distStr, 64)
		if err != nil {
			http.Error(w, "Invalid distance", http.StatusBadRequest)
			return
		}

		speed := 0.99
		if speedStr != "" {
			if s, err := strconv.ParseFloat(speedStr, 64); err == nil && s > 0 && s < 1 {
				speed = s
			}
		}

		sStar, err := db.GetStarByName(start)
		if err != nil {
			http.Error(w, "Start star not found", http.StatusNotFound)
			return
		}
		eStar, err := db.GetStarByName(end)
		if err != nil {
			http.Error(w, "End star not found", http.StatusNotFound)
			return
		}

		graph := pathfinding.NewGraph(allStars, dist)
		path, err := graph.FindPathAStar(sStar, eStar)
		if err != nil {
			http.Error(w, "Unreachable", http.StatusNotFound)
			return
		}

		gamma := 1.0 / math.Sqrt(1.0-speed*speed)
		pcToLy := 3.26156

		var pResp PathResponse
		pResp.Hops = append(pResp.Hops, HopResponse{Name: path[0].Name, DistPC: 0})

		for i := 1; i < len(path); i++ {
			d := pathfinding.Distance(path[i-1], path[i])
			dLy := d * pcToLy
			oTime := dLy / speed
			sTime := oTime / gamma

			pResp.TotalDistPC += d
			pResp.TotalObsTime += oTime
			pResp.TotalShipTime += sTime

			pResp.Hops = append(pResp.Hops, HopResponse{
				Name:     path[i].Name,
				DistPC:   d,
				ObsTime:  oTime,
				ShipTime: sTime,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(pResp)
	})

	fmt.Println("Server running at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
