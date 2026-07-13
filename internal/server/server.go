// Package server constructs UtRa's HTTP API independently of process lifecycle.
package server

import (
	"errors"
	"net/http"

	"codeberg.org/astronexus/brahe"
	"github.com/M1hawk005/UtRa/database"
	"github.com/M1hawk005/UtRa/internal/config"
)

// Server is UtRa's injectable HTTP handler and runtime dataset state.
type Server struct {
	cfg   config.Config
	db    database.StarDatabase
	stars []brahe.Star
	mux   *http.ServeMux
}

// NewServer constructs the deployable HTTP handler, including the bundled
// reference client from ./public.
func NewServer(cfg *config.Config, db database.StarDatabase) (*Server, error) {
	return New(cfg, db, "./public")
}

// New constructs an HTTP handler from configuration and an already-open database.
func New(cfg *config.Config, db database.StarDatabase, publicDir string) (*Server, error) {
	if cfg == nil {
		return nil, errors.New("config is required")
	}
	if db == nil {
		return nil, errors.New("database is required")
	}
	stars, err := db.GetAllStars()
	if err != nil {
		return nil, err
	}

	s := &Server{cfg: *cfg, db: db, stars: stars, mux: http.NewServeMux()}
	s.mux.Handle("/api/stars", methodOnly(http.MethodGet, http.HandlerFunc(s.handleLegacyStars)))
	s.mux.Handle("/api/path", methodOnly(http.MethodGet, http.HandlerFunc(s.handleLegacyPath)))
	s.mux.Handle("/healthz", methodOnly(http.MethodGet, http.HandlerFunc(s.handleHealth)))
	s.mux.Handle("/readyz", methodOnly(http.MethodGet, http.HandlerFunc(s.handleReady)))
	s.mux.Handle("/.well-known/utra", methodOnly(http.MethodGet, http.HandlerFunc(s.handleCapabilities)))
	s.mux.Handle("/api/v1/capabilities", methodOnly(http.MethodGet, http.HandlerFunc(s.handleCapabilities)))
	s.mux.Handle("/api/v1/routes", methodOnly(http.MethodPost, http.HandlerFunc(s.handleV1Routes)))
	s.mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		writeError(w, http.StatusNotFound, "not_found", "endpoint not found")
	})
	s.mux.Handle("/", http.FileServer(http.Dir(publicDir)))
	return s, nil
}

func methodOnly(method string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		allow := method
		allowed := r.Method == method
		if method == http.MethodGet {
			allow = http.MethodGet + ", " + http.MethodHead
			allowed = allowed || r.Method == http.MethodHead
		}
		if !allowed {
			w.Header().Set("Allow", allow)
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed")
			return
		}
		if r.Method == http.MethodHead {
			w = headResponseWriter{ResponseWriter: w}
		}
		next.ServeHTTP(w, r)
	})
}

type headResponseWriter struct {
	http.ResponseWriter
}

func (w headResponseWriter) Write(body []byte) (int, error) {
	return len(body), nil
}

// ServeHTTP dispatches UtRa API and reference-client requests.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}
