# UtRa

UtRa is a self-hostable stellar catalog and navigation backend. Its HTTP API is the product boundary, and the bundled WebGL application is a replaceable reference client.

## Features

- A* route planning over a real AT-HYG dataset subset
- Relativistic observer and ship travel-time estimates
- Versioned JSON routing and discovery APIs, plus legacy compatibility endpoints
- A bundled interactive Three.js reference client

## Repository Layout

| Path | Purpose |
| --- | --- |
| `cmd/web` | HTTP API server and static file process |
| `cmd/utra` | Command-line route calculator |
| `cmd/ingest` | Dataset sampler and JSON exporter |
| `internal/` | Server logic and configuration |
| `database/` | Local JSON catalog implementation |
| `pathfinding/` | Graph construction and A* routing |
| `api/` | OpenAPI specification |
| `public/` | Reference client assets |
| `docs/` | Architecture and operations documentation |

## Prerequisites

- Go `1.26.1`
- A modern WebGL-capable browser for the reference client
- Node.js, optionally, to run the JavaScript tests
- The checked-in CSV at `uraniborg/data/athyg_33_subset.csv` only when regenerating the JSON catalog

## Quick Start

The JSON catalog is already checked in at `data/nosql_mock/stars`, so ingestion is normally unnecessary. From the repository root, start the server on loopback:

```bash
UTRA_LISTEN_ADDR=127.0.0.1:8080 go run ./cmd/web
```

Open [http://localhost:8080](http://localhost:8080). The raw `UTRA_LISTEN_ADDR` default is `:8080`, which binds all interfaces rather than only loopback.

### Regenerating the Catalog

The ingester uses hardcoded input and output paths and does not remove stale JSON documents. To regenerate safely:

1. Stop the service.
2. Move `data/nosql_mock/stars` to a backup location, or deliberately delete it after confirming that destructive removal is intended.
3. From the repository root, run:

   ```bash
   go run ./cmd/ingest
   ```

4. Start the server and verify the `dataset_size` reported by `/readyz` against the expected count.
5. Restart every server process that should use the new catalog.

A separate checkout can stage a regenerated catalog. Do not swap a catalog underneath a running process: each server holds a startup snapshot and must be restarted. This workflow does not promise zero downtime.

### Dataset Loading Facts

- A missing configured data directory is created.
- Only files ending in `.json` are considered.
- Unreadable or malformed individual documents are silently skipped.
- Entries are read in lexicographic filename order. If documents repeat an ID, the later filename wins.
- The catalog is an in-memory startup snapshot; files are not reloaded while the process runs.
- A directory-level read failure prevents startup.
- A `200` response from `/readyz` proves server construction, not catalog integrity. Check `dataset_size` against an expected count.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `UTRA_LISTEN_ADDR` | `:8080` | HTTP listen address; the default binds all interfaces |
| `UTRA_DATA_PATH` | `data/nosql_mock/stars` | JSON catalog directory |

## API Usage

The full contract is in `api/openapi.yaml`.

```bash
curl -X POST http://localhost:8080/api/v1/routes \
  -H "Content-Type: application/json" \
  -d '{"start":"Sol","end":"GJ 4265","max_jump_pc":50,"speed_c":0.99}'

curl http://localhost:8080/.well-known/utra
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
```

## CLI Usage

```bash
go run ./cmd/utra "Sol" "GJ 4265" 50 0.99
```

The CLI hardcodes `data/nosql_mock/stars` and does not use `UTRA_DATA_PATH`.

## Testing

```bash
go test ./...
node --test public/js/*.test.js test_*.js
```

The Node.js command is optional and tests the reference client.

## Limits and Security

The catalog is loaded entirely into memory. Each route request constructs a graph, and each expanded node scans all stars for neighbors; there is no spatial index.

The service exposes unauthenticated HTTP. Its raw default listen address binds all interfaces, and it has no built-in TLS, authentication, authorization, rate limit, concurrency limit, or per-request access log. Deploy it behind suitable network and reverse-proxy controls. See the [operations guide](docs/operations.md) for the complete checklist.

### Reference-client Dependencies

`public/index.html` loads Three.js 0.128.0 and OrbitControls from public CDNs without Subresource Integrity (SRI). Browser clients therefore need outbound access and compatible Content Security Policy rules. This creates supply-chain, privacy, availability, and release-reproducibility exposure. API-only deployments do not need these browser dependencies, and the repository has no offline or vendorized reference-client bundle.

## Documentation

- [Architecture](docs/architecture.md)
- [Operations Guide](docs/operations.md)
- [OpenAPI Specification](api/openapi.yaml)

## Licensing

There is no root-level project license. Bundled upstream dataset and component directories contain their own license files, which must be reviewed before redistribution. Do not infer permission until a project license is added.
