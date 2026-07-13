package server

import (
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"codeberg.org/astronexus/brahe"
	"github.com/M1hawk005/UtRa/internal/config"
)

func newTestServer(t *testing.T, stars []brahe.Star) *Server {
	t.Helper()
	srv, err := New(&config.Config{}, &stubDatabase{stars: stars}, t.TempDir())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	return srv
}

func TestLegacyPathPreservesRouteResponse(t *testing.T) {
	stars := []brahe.Star{
		{ID: 1, Name: "A", Position: brahe.CartesianVector{0, 0, 0}},
		{ID: 2, Name: "B", Position: brahe.CartesianVector{3, 0, 0}},
	}
	srv := newTestServer(t, stars)
	req := httptest.NewRequest(http.MethodGet, "/api/path?start=A&end=B&dist=4&speed=0.5", nil)
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %q", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q", got)
	}
	var got legacyPathResponse
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(got.Hops) != 2 || got.Hops[0].Name != "A" || got.Hops[1].Name != "B" {
		t.Fatalf("hops = %#v", got.Hops)
	}
	observerTime := 3 * 3.26156 / 0.5
	if got.TotalDistPC != 3 || math.Abs(got.TotalObsTime-observerTime) > 1e-12 {
		t.Fatalf("totals = %#v", got)
	}
	if math.Abs(got.TotalShipTime-observerTime*math.Sqrt(1-0.5*0.5)) > 1e-12 {
		t.Fatalf("ship time = %f", got.TotalShipTime)
	}
}

func TestLegacyPathKeepsSilentSpeedFallback(t *testing.T) {
	stars := []brahe.Star{
		{ID: 1, Name: "A", Position: brahe.CartesianVector{0, 0, 0}},
		{ID: 2, Name: "B", Position: brahe.CartesianVector{1, 0, 0}},
	}
	srv := newTestServer(t, stars)
	request := func(speed string) legacyPathResponse {
		t.Helper()
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/path?start=A&end=B&dist=2&speed="+speed, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("speed %q: status = %d, body = %q", speed, rec.Code, rec.Body.String())
		}
		var response legacyPathResponse
		if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return response
	}

	want := request("0.99")
	for _, invalid := range []string{"", "nope", "0", "1", "NaN", "+Inf"} {
		if got := request(invalid); got.TotalObsTime != want.TotalObsTime || got.TotalShipTime != want.TotalShipTime {
			t.Errorf("speed %q did not fall back to 0.99", invalid)
		}
	}
}

func TestLegacyPathRejectsUnsafeDistanceAsPlainText(t *testing.T) {
	srv := newTestServer(t, nil)
	for _, distance := range []string{"bad", "0", "-1", "501", "NaN", "+Inf"} {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/path?dist="+distance, nil))
		if rec.Code != http.StatusBadRequest || rec.Body.String() != "Invalid distance\n" {
			t.Errorf("dist %q: status = %d, body = %q", distance, rec.Code, rec.Body.String())
		}
		if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "text/plain") {
			t.Errorf("dist %q: Content-Type = %q", distance, got)
		}
	}
}

func TestLegacyPathPreservesLookupAndUnreachableErrors(t *testing.T) {
	stars := []brahe.Star{
		{ID: 1, Name: "A", Position: brahe.CartesianVector{0, 0, 0}},
		{ID: 2, Name: "B", Position: brahe.CartesianVector{10, 0, 0}},
	}
	srv := newTestServer(t, stars)
	tests := []struct {
		url  string
		want string
	}{
		{"/api/path?start=missing&end=B&dist=1", "Start star not found\n"},
		{"/api/path?start=A&end=missing&dist=1", "End star not found\n"},
		{"/api/path?start=A&end=B&dist=1", "Unreachable\n"},
	}
	for _, test := range tests {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, test.url, nil))
		if rec.Code != http.StatusNotFound || rec.Body.String() != test.want {
			t.Errorf("%s: status = %d, body = %q", test.url, rec.Code, rec.Body.String())
		}
	}
}

func TestLegacyStarsPreservesCompactResponse(t *testing.T) {
	srv := newTestServer(t, []brahe.Star{{
		ID:          1,
		Name:        "Sol",
		Position:    brahe.CartesianVector{1, 2, 3},
		Spectrum:    "G2V",
		AbsoluteMag: 4.83,
	}})
	req := httptest.NewRequest(http.MethodGet, "/api/stars", nil)
	rec := httptest.NewRecorder()

	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q", got)
	}
	want := `[{"n":"Sol","x":1,"y":2,"z":3,"s":"G2V","m":4.83}]`
	if strings.TrimSpace(rec.Body.String()) != want {
		t.Fatalf("body = %s, want %s", rec.Body.String(), want)
	}
}

func TestLegacyEndpointsRejectMutationMethods(t *testing.T) {
	srv := newTestServer(t, nil)
	for _, endpoint := range []string{"/api/stars", "/api/path"} {
		for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, httptest.NewRequest(method, endpoint, nil))
			requireAPIError(t, rec, http.StatusMethodNotAllowed, "method_not_allowed")
			if got := rec.Header().Get("Allow"); got != "GET, HEAD" {
				t.Errorf("%s %s: Allow = %q, want %q", method, endpoint, got, "GET, HEAD")
			}
		}
	}
}
