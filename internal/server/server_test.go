package server

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"codeberg.org/astronexus/brahe"
	"github.com/M1hawk005/UtRa/database"
	"github.com/M1hawk005/UtRa/internal/config"
)

type stubDatabase struct {
	stars      []brahe.Star
	allErr     error
	getAllCall int
}

func TestUnknownAPIPathReturnsStableJSONNotFound(t *testing.T) {
	srv := newTestServer(t, nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/does-not-exist", nil))

	body := strings.TrimSpace(rec.Body.String())
	requireAPIError(t, rec, http.StatusNotFound, "not_found")
	if body != `{"error":{"code":"not_found","message":"endpoint not found"}}` {
		t.Fatalf("body = %q", body)
	}
}

var _ database.StarDatabase = (*stubDatabase)(nil)

func (db *stubDatabase) GetStar(int) (*brahe.Star, error) {
	return nil, errors.New("not found")
}

func (db *stubDatabase) GetStarByName(name string) (*brahe.Star, error) {
	for i := range db.stars {
		if db.stars[i].Name == name {
			return &db.stars[i], nil
		}
	}
	return nil, errors.New("not found")
}

func (db *stubDatabase) GetAllStars() ([]brahe.Star, error) {
	db.getAllCall++
	return db.stars, db.allErr
}

func (db *stubDatabase) SaveStar(*brahe.Star) error { return nil }

func TestNewLoadsRuntimeDatasetAndBuildsHandler(t *testing.T) {
	db := &stubDatabase{stars: []brahe.Star{{ID: 1, Name: "Sol"}}}
	srv, err := New(&config.Config{}, db, t.TempDir())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	if db.getAllCall != 1 {
		t.Fatalf("GetAllStars calls = %d, want 1", db.getAllCall)
	}
	if len(srv.stars) != 1 {
		t.Fatalf("cached stars = %d, want 1", len(srv.stars))
	}
	if _, ok := any(srv).(http.Handler); !ok {
		t.Fatal("server does not implement http.Handler")
	}
}

func TestNewServerBuildsDefaultReferenceClientServer(t *testing.T) {
	db := &stubDatabase{}
	srv, err := NewServer(&config.Config{}, db)
	if err != nil {
		t.Fatalf("NewServer() error = %v", err)
	}
	if srv == nil {
		t.Fatal("NewServer() returned nil")
	}
}
