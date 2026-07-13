package server

import (
	"os"
	"strings"
	"testing"
)

func TestOpenAPIDocCoversImplementedHTTPContract(t *testing.T) {
	content, err := os.ReadFile("../../api/openapi.yaml")
	if err != nil {
		t.Fatalf("read OpenAPI document: %v", err)
	}
	document := string(content)
	for _, required := range []string{
		"/api/stars:",
		"/api/path:",
		"/.well-known/utra:",
		"/api/v1/capabilities:",
		"/api/v1/routes:",
		"/healthz:",
		"/readyz:",
		"max_jump_pc:",
		"speed_c:",
		"x-max-body-bytes: 10240",
		"additionalProperties: false",
		"method_not_allowed",
	} {
		if !strings.Contains(document, required) {
			t.Errorf("OpenAPI document is missing %q", required)
		}
	}
}

func TestArchitectureDocExplainsHeadlessSelfHostingBoundaries(t *testing.T) {
	content, err := os.ReadFile("../../docs/architecture.md")
	if err != nil {
		t.Fatalf("read architecture document: %v", err)
	}
	document := string(content)
	for _, required := range []string{
		"frontend-agnostic",
		"reference client",
		"UTRA_LISTEN_ADDR",
		"UTRA_DATA_PATH",
		"internal/server",
		"spatial indexing",
		"authentication",
	} {
		if !strings.Contains(document, required) {
			t.Errorf("architecture document is missing %q", required)
		}
	}
}
