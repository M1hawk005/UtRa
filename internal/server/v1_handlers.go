package server

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/M1hawk005/UtRa/pathfinding"
)

const maxRequestBodyBytes = 10 * 1024

type routeRequestV1 struct {
	Start     string  `json:"start"`
	End       string  `json:"end"`
	MaxJumpPC float64 `json:"max_jump_pc"`
	SpeedC    float64 `json:"speed_c"`
}

func (s *Server) handleV1Routes(w http.ResponseWriter, r *http.Request) {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json")
		return
	}
	if r.ContentLength > maxRequestBodyBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request body exceeds 10 KiB")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var request routeRequestV1
	if err := decoder.Decode(&request); err != nil {
		if isBodyTooLarge(err) {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request body exceeds 10 KiB")
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_json", "request body must contain one valid JSON object with no unknown fields")
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if isBodyTooLarge(err) {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request body exceeds 10 KiB")
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_json", "request body must contain exactly one JSON object")
		return
	}

	request.Start = strings.TrimSpace(request.Start)
	if request.Start == "" {
		writeError(w, http.StatusBadRequest, "invalid_start", "start must be a non-empty star name")
		return
	}
	request.End = strings.TrimSpace(request.End)
	if request.End == "" {
		writeError(w, http.StatusBadRequest, "invalid_end", "end must be a non-empty star name")
		return
	}
	if !isFinite(request.MaxJumpPC) || request.MaxJumpPC <= 0 || request.MaxJumpPC > maxJumpDistancePC {
		writeError(w, http.StatusBadRequest, "invalid_max_jump_pc", "max_jump_pc must be greater than 0 and at most 500")
		return
	}
	if !isFinite(request.SpeedC) || request.SpeedC <= 0 || request.SpeedC >= 1 {
		writeError(w, http.StatusBadRequest, "invalid_speed_c", "speed_c must be greater than 0 and less than 1")
		return
	}

	start, err := s.db.GetStarByName(request.Start)
	if err != nil {
		writeError(w, http.StatusNotFound, "start_not_found", "start star was not found")
		return
	}
	end, err := s.db.GetStarByName(request.End)
	if err != nil {
		writeError(w, http.StatusNotFound, "end_not_found", "end star was not found")
		return
	}
	path, err := pathfinding.NewGraph(s.stars, request.MaxJumpPC).FindPathAStar(start, end)
	if err != nil {
		writeError(w, http.StatusNotFound, "route_not_found", "no route satisfies max_jump_pc")
		return
	}

	writeJSON(w, http.StatusOK, routeResponse(path, request.SpeedC))
}

func isBodyTooLarge(err error) bool {
	var maxBytesError *http.MaxBytesError
	return errors.As(err, &maxBytesError)
}
