package server

import (
	"os"
	"strings"
	"testing"
)

func readDocumentation(t *testing.T, path string) string {
	t.Helper()
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(content)
}

func requireFragments(t *testing.T, document string, fragments ...string) {
	t.Helper()
	for _, fragment := range fragments {
		if !strings.Contains(document, fragment) {
			t.Errorf("document is missing %q", fragment)
		}
	}
}

func rejectFragments(t *testing.T, document string, fragments ...string) {
	t.Helper()
	for _, fragment := range fragments {
		if strings.Contains(document, fragment) {
			t.Errorf("document contains forbidden text %q", fragment)
		}
	}
}

func TestFirstPartyDocumentationAvoidsStaleClaimsAndFiller(t *testing.T) {
	paths := []string{
		"../../README.md",
		"../../docs/architecture.md",
		"../../docs/operations.md",
		"../../api/openapi.yaml",
	}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			document := readDocumentation(t, path)
			rejectFragments(t, document,
				"HIP 611", "open-source", "Crucially", "Furthermore",
				"Please note", "serves as",
			)
		})
	}
}

func TestOpenAPIDocCoversImplementedHTTPContract(t *testing.T) {
	document := readDocumentation(t, "../../api/openapi.yaml")
	requireFragments(t, document,
		"/api/stars:", "/api/path:", "/.well-known/utra:",
		"/api/v1/capabilities:", "/api/v1/routes:", "/healthz:", "/readyz:",
		"max_jump_pc:", "speed_c:", "x-max-body-bytes: 10240",
		"additionalProperties: false", "method_not_allowed",
		"case-insensitive", "exact `Name`", "prefix followed by a space",
		"exact `ProperName`", "Bayer designation plus constellation",
		"ambiguous matches nondeterministic", "do not guarantee",
	)
}

func TestREADMEHasSafeQuickStartAndVerifiedExamples(t *testing.T) {
	document := readDocumentation(t, "../../README.md")
	requireFragments(t, document,
		"UTRA_LISTEN_ADDR=127.0.0.1:8080 go run ./cmd/web",
		"default is `:8080`", "binds all interfaces",
		"UTRA_DATA_PATH", "data/nosql_mock/stars",
		`{"start":"Sol","end":"GJ 4265","max_jump_pc":50,"speed_c":0.99}`,
		`go run ./cmd/utra "Sol" "GJ 4265" 50 0.99`,
		"Node.js, optionally", "JSON catalog is already checked in",
	)
}

func TestArchitectureDocumentsRuntimeBoundaries(t *testing.T) {
	document := readDocumentation(t, "../../docs/architecture.md")
	requireFragments(t, document,
		"frontend-agnostic", "## Frontend State Boundary", "legacy endpoints",
		"Creates the configured `UTRA_DATA_PATH` directory", "`.json`",
		"Silently skips", "lexicographic filename order", "later lexicographically sorted filename wins",
		"startup snapshot", "no file watcher or reload", "restart",
		"Data flow:", " → ", "spatial index", "./public",
		"ReadHeader", "10-second deadline",
	)
}

func TestOperationsDocumentsCatalogAndReadinessRisks(t *testing.T) {
	document := readDocumentation(t, "../../docs/operations.md")
	requireFragments(t, document,
		"deterministic fixed stride", "up to 10,000", "hardcoded `uraniborg/data/athyg_33_subset.csv`",
		"hardcoded `data/nosql_mock/stars`", "does not clear", "stale files", "`0644`", "umask",
		"Stop every server", "backup", "verify `/readyz`", "Restart every other server",
		"only `.json`", "silently skips unreadable or malformed", "lexicographic filename order",
		"later filename wins", "startup snapshot", "no reload mechanism",
		"server construction completed", "does not prove catalog integrity",
		"silently reduce the count", "directory-level read failure causes startup to fail",
	)
}

func TestOperationsDocumentsDeploymentAndSecurityBoundaries(t *testing.T) {
	document := readDocumentation(t, "../../docs/operations.md")
	requireFragments(t, document,
		"go build -o /tmp/utra-server ./cmd/web", "UTRA_LISTEN_ADDR=127.0.0.1:8080",
		`UTRA_DATA_PATH="$(pwd)/data/nosql_mock/stars"`, "curl --fail", "SIGINT",
		"sudo install -m 0755", "working directory", "absolute `UTRA_DATA_PATH`",
		"unauthenticated HTTP", "no built-in TLS", "authentication or authorization",
		"rate limit", "concurrency limit", "CORS middleware", "per-request access log",
		"does not make the API safe", "no opt-in CORS response headers",
		"maximum request body no larger", "10 KiB", "Safe forwarding-header handling",
		"query string", "Proxies and other intermediaries can log",
		"ReadHeader", "5 seconds", "15 seconds", "30 seconds", "60 seconds", "10-second deadline",
	)
}

func TestOperationsDocumentsCDNAndObservabilityBoundaries(t *testing.T) {
	document := readDocumentation(t, "../../docs/operations.md")
	requireFragments(t, document,
		"Three.js 0.128.0", "OrbitControls", "cdnjs", "jsDelivr",
		"Subresource Integrity (SRI)", "outbound access", "Content Security Policy",
		"supply-chain, privacy, and availability", "API-only deployments do not need",
		"does not contain an offline or vendorized", "Releases and rollbacks",
		"does not roll back CDN content", "standard logger", "standard error",
		"no per-request access log, metrics, or tracing",
	)

	index := readDocumentation(t, "../../public/index.html")
	requireFragments(t, index,
		"https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
		"https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
	)
	if strings.Contains(index, "integrity=") {
		t.Error("reference-client scripts unexpectedly use SRI; update operations documentation")
	}
}
