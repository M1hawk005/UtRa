package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"codeberg.org/astronexus/brahe"
)

func routeRequest(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/routes", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func requireAPIError(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if rec.Code != status {
		t.Fatalf("status = %d, want %d; body = %q", rec.Code, status, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q", got)
	}
	var envelope errorEnvelope
	if err := json.NewDecoder(rec.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode error envelope: %v", err)
	}
	if envelope.Error.Code != code || envelope.Error.Message == "" {
		t.Fatalf("error = %#v, want code %q and a message", envelope.Error, code)
	}
}

func TestV1RoutesReturnsJSONRoute(t *testing.T) {
	stars := []brahe.Star{
		{ID: 1, Name: "A", Position: brahe.CartesianVector{0, 0, 0}},
		{ID: 2, Name: "B", Position: brahe.CartesianVector{3, 0, 0}},
	}
	srv := newTestServer(t, stars)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, routeRequest(`{"start":"A","end":"B","max_jump_pc":4,"speed_c":0.5}`))

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
	if len(got.Hops) != 2 || got.Hops[0].Name != "A" || got.Hops[1].Name != "B" || got.TotalDistPC != 3 {
		t.Fatalf("response = %#v", got)
	}
}

func TestV1RoutesRequiresJSONContentType(t *testing.T) {
	srv := newTestServer(t, nil)
	for _, contentType := range []string{"", "text/plain", "application/json; bad"} {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/routes", strings.NewReader(`{}`))
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		requireAPIError(t, rec, http.StatusUnsupportedMediaType, "unsupported_media_type")
	}
}

func TestV1RoutesRejectsInvalidJSONShape(t *testing.T) {
	srv := newTestServer(t, nil)
	for _, body := range []string{
		``,
		`{`,
		`{"start":"A","end":"B","max_jump_pc":1,"speed_c":0.5,"extra":true}`,
		`{"start":"A","end":"B","max_jump_pc":1,"speed_c":0.5} {}`,
	} {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, routeRequest(body))
		requireAPIError(t, rec, http.StatusBadRequest, "invalid_json")
	}
}

func TestV1RoutesCapsRequestBody(t *testing.T) {
	srv := newTestServer(t, nil)
	body := `{"start":"` + strings.Repeat("x", 10*1024) + `","end":"B","max_jump_pc":1,"speed_c":0.5}`
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, routeRequest(body))
	requireAPIError(t, rec, http.StatusRequestEntityTooLarge, "request_too_large")
}

func TestV1RoutesValidatesAllFieldsStrictly(t *testing.T) {
	srv := newTestServer(t, nil)
	tests := []struct {
		body string
		code string
	}{
		{`{"end":"B","max_jump_pc":1,"speed_c":0.5}`, "invalid_start"},
		{`{"start":"A","max_jump_pc":1,"speed_c":0.5}`, "invalid_end"},
		{`{"start":"A","end":"B","speed_c":0.5}`, "invalid_max_jump_pc"},
		{`{"start":"A","end":"B","max_jump_pc":0,"speed_c":0.5}`, "invalid_max_jump_pc"},
		{`{"start":"A","end":"B","max_jump_pc":-1,"speed_c":0.5}`, "invalid_max_jump_pc"},
		{`{"start":"A","end":"B","max_jump_pc":500.01,"speed_c":0.5}`, "invalid_max_jump_pc"},
		{`{"start":"A","end":"B","max_jump_pc":1}`, "invalid_speed_c"},
		{`{"start":"A","end":"B","max_jump_pc":1,"speed_c":0}`, "invalid_speed_c"},
		{`{"start":"A","end":"B","max_jump_pc":1,"speed_c":1}`, "invalid_speed_c"},
		{`{"start":"A","end":"B","max_jump_pc":1,"speed_c":-0.1}`, "invalid_speed_c"},
	}
	for _, test := range tests {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, routeRequest(test.body))
		requireAPIError(t, rec, http.StatusBadRequest, test.code)
	}
}

func TestV1RoutesReturnsStructuredDomainErrors(t *testing.T) {
	stars := []brahe.Star{
		{ID: 1, Name: "A", Position: brahe.CartesianVector{0, 0, 0}},
		{ID: 2, Name: "B", Position: brahe.CartesianVector{10, 0, 0}},
	}
	srv := newTestServer(t, stars)
	tests := []struct {
		body   string
		status int
		code   string
	}{
		{`{"start":"missing","end":"B","max_jump_pc":1,"speed_c":0.5}`, http.StatusNotFound, "start_not_found"},
		{`{"start":"A","end":"missing","max_jump_pc":1,"speed_c":0.5}`, http.StatusNotFound, "end_not_found"},
		{`{"start":"A","end":"B","max_jump_pc":1,"speed_c":0.5}`, http.StatusNotFound, "route_not_found"},
	}
	for _, test := range tests {
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, routeRequest(test.body))
		requireAPIError(t, rec, test.status, test.code)
	}
}
