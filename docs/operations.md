# UtRa Operations Guide

## Deployment Model

UtRa runs as a single self-hosted process. The static handler serves `./public`, so the process working directory must contain the matching `public/` tree if the reference UI is required. API-only deployments may omit browser use of that UI. Use an absolute `UTRA_DATA_PATH` in administrative deployments to avoid resolving the catalog against an unexpected working directory.

## Build and Verification

Build a temporary binary, then start it from the repository root with loopback binding and an absolute catalog path:

```bash
go build -o /tmp/utra-server ./cmd/web
UTRA_LISTEN_ADDR=127.0.0.1:8080 \
  UTRA_DATA_PATH="$(pwd)/data/nosql_mock/stars" \
  /tmp/utra-server
```

In a separate shell, check liveness and readiness:

```bash
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/readyz
```

Inspect the readiness JSON and compare `dataset_size` with the expected catalog count. Stop the foreground server with `Ctrl-C` (SIGINT).

An administrative installation can copy the binary:

```bash
sudo install -m 0755 /tmp/utra-server /usr/local/bin/utra-server
```

Installation does not make runtime paths independent of the working directory. Start the installed binary from a directory containing the intended `public/` tree, and configure an absolute `UTRA_DATA_PATH`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `UTRA_LISTEN_ADDR` | `:8080` | HTTP listen address; `:8080` binds all interfaces |
| `UTRA_DATA_PATH` | `data/nosql_mock/stars` | JSON catalog directory |

## Dataset Preparation and Loading

The repository already contains a JSON catalog, so normal startup does not require ingestion. `cmd/ingest` reads the hardcoded `uraniborg/data/athyg_33_subset.csv` input and writes to the hardcoded `data/nosql_mock/stars` output. It selects up to 10,000 records with a deterministic fixed stride. Each JSON file is written with mode `0644`, subject to the process umask.

The ingester does not clear the output directory or remove stale files. A safe regeneration procedure is:

1. Stop every server using the catalog.
2. Move the existing `data/nosql_mock/stars` directory to a backup, or deliberately delete it.
3. Run `go run ./cmd/ingest` from the repository root.
4. Start the service and verify `/readyz` reports the expected `dataset_size`.
5. Restart every other server that should use the replacement catalog.

A separate checkout can be used to stage output, but replacing files does not update running processes. Each server loads an in-memory startup snapshot and has no reload mechanism.

The loader creates a missing configured directory and considers only `.json` files. It silently skips unreadable or malformed individual documents. Files are processed in lexicographic filename order; for duplicate star IDs, the later filename wins. A failure to read the directory itself prevents startup.

## Health and Readiness

- `/healthz` returning `200` proves the HTTP process is responding.
- `/readyz` returning `200` proves that server construction completed; it does not prove catalog integrity.
- `/readyz` and `/api/v1/capabilities` report the runtime `dataset_size`.

Integrity checks must compare `dataset_size` with an exact or minimum expected count. A ready server can report zero, and unreadable or malformed individual JSON documents can silently reduce the count. By contrast, a directory-level read failure causes startup to fail.

## Process Lifecycle and Timeouts

The process handles SIGINT and SIGTERM. It allows active connections up to 10 seconds to finish during graceful shutdown.

| Timeout | Value |
| --- | --- |
| ReadHeader | 5 seconds |
| Read | 15 seconds |
| Write | 30 seconds |
| Idle | 60 seconds |

## Security Hardening

UtRa provides unauthenticated HTTP. It has no built-in TLS, authentication or authorization, rate limit, concurrency limit, CORS middleware, or per-request access log. The raw default listen address, `:8080`, binds all interfaces.

The absence of CORS middleware does not make the API safe. It only means cross-origin browser clients receive no opt-in CORS response headers.

Place the service behind a trusted proxy or gateway that enforces:

- TLS and authentication/authorization
- Network allowlists and a private upstream bind
- A maximum request body no larger than the API's 10 KiB limit
- Strict rate limits, concurrency limits, and timeouts
- Per-request access logs with appropriate redaction and retention
- Safe forwarding-header handling, including replacement or validation of client-supplied forwarding headers

Legacy `GET /api/path` places route values in the query string. Proxies and other intermediaries can log those values, so restrict or disable that endpoint where query disclosure matters.

## Reference-client CDN Dependencies

The reference UI loads Three.js 0.128.0 from cdnjs and OrbitControls from jsDelivr. The script tags do not specify Subresource Integrity (SRI). Browsers need outbound access to those public CDNs and Content Security Policy rules that allow them. This creates supply-chain, privacy, and availability exposure.

API-only deployments do not need the CDN resources. The repository does not contain an offline or vendorized reference-client bundle. Releases and rollbacks that include the UI are therefore not fully self-contained or reproducible: smoke-test CDN reachability and UI loading, and recognize that rolling back the local binary and static files does not roll back CDN content. A controlled deployment should vendor and integrity-pin these dependencies before relying on offline operation, but this repository does not currently provide that bundle.

## Observability

The Go standard logger writes startup and fatal messages to standard error. The application has no per-request access log, metrics, or tracing. Collect stderr and use proxy telemetry plus health, readiness, CPU, and memory monitoring.

## Release and Rollback

Treat the binary, `public/` assets, and catalog snapshot as one release unit. Back up the catalog before regeneration or replacement. A rollback must restore the matching binary, static tree, and catalog, restart every process, verify the expected `dataset_size`, and smoke-test both health endpoints. For UI deployments, also account for the external CDN dependencies described above.

## Troubleshooting

| Symptom | Likely cause or action |
| --- | --- |
| Ready with a low or zero count | Empty catalog, or silently skipped unreadable/malformed JSON; compare `dataset_size` with the expected count and inspect file permissions and contents |
| Startup fails while loading the catalog | Directory-level read failure; verify the configured path, parent permissions, and file type |
| Catalog changes do not appear | The server uses a startup snapshot; restart every running process |
| Unexpected star for a duplicate ID | The later lexicographic JSON filename overwrites earlier entries |
| Reference UI assets return 404 | Process working directory does not contain the expected `./public` tree |
| Reference UI fails before rendering | CDN unavailable or blocked by network/CSP; no offline bundle is included |
| `415 Unsupported Media Type` | A v1 route request lacks `Content-Type: application/json` |
| `413 Payload Too Large` | Request body exceeds 10 KiB |
| `400 Bad Request` | Unknown fields, trailing JSON, malformed JSON, or invalid values |
| `404 Not Found` from routing | A star is missing or no route satisfies `max_jump_pc` |
| Bind failure | Address is in use, unavailable, or requires additional privilege |
| Shutdown error | Connections did not finish within the 10-second deadline |

## Capacity

The entire catalog resides in memory. Name lookup is linear over a map, graph context is constructed per route request, and every expanded node scans all stars for neighbors. There is no spatial index. Enforce concurrency limits and monitor CPU and memory under representative route workloads.
