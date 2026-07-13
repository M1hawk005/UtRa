package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"codeberg.org/astronexus/brahe"
	"github.com/M1hawk005/UtRa/internal/config"
)

func TestHealthzReportsLive(t *testing.T) {
	srv := newTestServer(t, nil)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %q", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q", got)
	}
	if strings.TrimSpace(rec.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestProbesUseCachedRuntimeDataset(t *testing.T) {
	db := &stubDatabase{stars: []brahe.Star{{ID: 1, Name: "Sol"}}}
	srv, err := New(&config.Config{}, db, t.TempDir())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	for i := 0; i < 2; i++ {
		for _, endpoint := range []string{"/readyz", "/.well-known/utra", "/api/v1/capabilities"} {
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, endpoint, nil))
			if rec.Code != http.StatusOK {
				t.Fatalf("%s: status = %d, body = %q", endpoint, rec.Code, rec.Body.String())
			}
		}
	}
	if db.getAllCall != 1 {
		t.Fatalf("GetAllStars calls = %d, want 1 startup load", db.getAllCall)
	}
}

func TestDiscoveryAndCapabilitiesDescribeRuntimeWithoutPaths(t *testing.T) {
	db := &stubDatabase{stars: []brahe.Star{{ID: 1}, {ID: 2}}}
	cfg := &config.Config{DataPath: "/secret/local/catalog"}
	srv, err := New(cfg, db, t.TempDir())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	for _, endpoint := range []string{"/.well-known/utra", "/api/v1/capabilities"} {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, endpoint, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status = %d, body = %q", endpoint, rec.Code, rec.Body.String())
		}
		want := `{"name":"UtRa Navigation API","version":"v1","capabilities":["routing","stars"],"dataset_size":2}`
		if strings.TrimSpace(rec.Body.String()) != want {
			t.Errorf("%s: body = %q, want %s", endpoint, rec.Body.String(), want)
		}
		if strings.Contains(rec.Body.String(), cfg.DataPath) {
			t.Errorf("%s leaked configured data path", endpoint)
		}
	}
}

func TestGetEndpointsSupportHeadWithoutResponseBodies(t *testing.T) {
	srv := newTestServer(t, nil)
	for _, endpoint := range []string{"/healthz", "/readyz", "/.well-known/utra", "/api/v1/capabilities"} {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodHead, endpoint, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("HEAD %s: status = %d, want %d; body = %q", endpoint, rec.Code, http.StatusOK, rec.Body.String())
		}
		if got := rec.Header().Get("Content-Type"); got != "application/json" {
			t.Errorf("HEAD %s: Content-Type = %q, want application/json", endpoint, got)
		}
		if rec.Body.Len() != 0 {
			t.Errorf("HEAD %s: body = %q, want empty", endpoint, rec.Body.String())
		}
	}
}

func TestNewEndpointsRejectUnsupportedMethodsConsistently(t *testing.T) {
	srv := newTestServer(t, nil)
	tests := []struct {
		method   string
		endpoint string
		allow    string
	}{
		{http.MethodPost, "/healthz", "GET, HEAD"},
		{http.MethodPost, "/readyz", "GET, HEAD"},
		{http.MethodPost, "/.well-known/utra", "GET, HEAD"},
		{http.MethodPost, "/api/v1/capabilities", "GET, HEAD"},
		{http.MethodGet, "/api/v1/routes", http.MethodPost},
	}
	for _, test := range tests {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(test.method, test.endpoint, nil))
		requireAPIError(t, rec, http.StatusMethodNotAllowed, "method_not_allowed")
		if got := rec.Header().Get("Allow"); got != test.allow {
			t.Errorf("%s %s: Allow = %q, want %q", test.method, test.endpoint, got, test.allow)
		}
	}
}
