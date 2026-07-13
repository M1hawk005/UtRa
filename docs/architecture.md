# UtRa architecture

UtRa is an open-source, self-hostable, frontend-agnostic stellar catalog and
navigation backend. Its HTTP API is the product boundary. The files under
`public/` are a replaceable Three.js reference client, not the backend's
presentation contract; another browser client, native application, or service
can consume the same API without depending on that implementation.

## Runtime boundaries

- `database/` defines stellar storage operations and supplies the current local
  JSON implementation. Storage-specific paths remain server-side and never
  appear in capability or readiness responses.
- `pathfinding/` owns graph construction, distance calculations, and A* route
  search. It has no HTTP or frontend concerns.
- `internal/server/` owns HTTP construction, versioned and compatibility DTOs,
  validation, serialization, and the optional static reference-client handler.
  It accepts a database interface and is directly testable with `httptest`.
- `internal/config/` reads process configuration.
- `cmd/web/` is the process adapter. It opens the configured database, creates
  the listener and HTTP server, installs timeouts, receives SIGINT/SIGTERM, and
  performs graceful shutdown.

The unversioned `GET /api/stars` and `GET /api/path` endpoints retain the
reference client's compact legacy representations. New consumers should use
the contract in `api/openapi.yaml`, particularly `POST /api/v1/routes` and the
v1 capability endpoint. Liveness describes the HTTP process; readiness and
capability dataset counts are queried from runtime database state.

## Self-hosting

The service uses only the Go standard library in its HTTP layer and can run as a
single process beside a mounted catalog directory:

| Variable | Default | Purpose |
| --- | --- | --- |
| `UTRA_LISTEN_ADDR` | `:8080` | TCP address on which the HTTP server listens |
| `UTRA_DATA_PATH` | `data/nosql_mock/stars` | Directory containing local JSON star documents |

Operators should mount the dataset at a private server path and expose the
listen address through their preferred reverse proxy or container network. The
configured local path is deliberately excluded from discovery and health data.
The bundled static client is served from `./public`; API consumers do not need
it and deployments may replace its files with another client.

## Phase 1 limits

This extraction deliberately keeps the existing in-memory graph and local JSON
catalog. This phase does not add spatial indexing, binary tile delivery,
authentication, persistence services, or frontend migration. Those concerns can be
added behind the storage, routing, and HTTP boundaries without making a
particular frontend authoritative.
