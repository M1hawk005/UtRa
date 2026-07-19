# UtRa Architecture

UtRa is a self-hostable, frontend-agnostic stellar catalog and navigation backend. The HTTP API is the product boundary. Files under `public/` implement a replaceable reference client; other browser clients, native applications, and services can consume the API independently.

## Runtime Boundaries

- `database/` defines storage operations and the local JSON implementation.
- `pathfinding/` owns graph construction, distance calculations, and A* search.
- `internal/server/` owns HTTP routing, DTOs, validation, serialization, health endpoints, and optional static-file serving.
- `internal/config/` reads process configuration.
- `cmd/web/` opens the catalog, constructs the server, listens for HTTP traffic, handles signals, and performs graceful shutdown.

The unversioned `GET /api/stars` and `GET /api/path` routes retain compact legacy representations. New consumers should use `api/openapi.yaml`, especially `POST /api/v1/routes` and `/api/v1/capabilities`. Liveness describes the HTTP process; readiness and capability counts come from runtime database state.

## Catalog Loading and Snapshot

At startup, the local JSON implementation:

1. Creates the configured `UTRA_DATA_PATH` directory if it is missing.
2. Reads directory entries in lexicographic filename order, as provided by `ioutil.ReadDir`.
3. Considers only non-directory entries whose names end in `.json`.
4. Silently skips individual files that cannot be read or decoded as JSON.
5. Stores decoded stars by numeric ID. If multiple documents use the same ID, the document with the later lexicographically sorted filename wins.
6. Retains the resulting catalog in memory as a startup snapshot.

A directory-level read failure is returned and prevents startup. There is no file watcher or reload path; every running server must restart to observe catalog changes. Name lookup iterates over the in-memory map.

Data flow: configuration → LocalJSON loader → startup snapshot → server routes and static handler.

## Request Flow

For a v1 route request:

1. The server validates the content type, 10 KiB body limit, JSON shape, and field values.
2. The database resolves the start and end names.
3. `pathfinding/` creates graph context for the request.
4. Each A* expansion scans the full catalog for neighbors within the maximum jump distance.
5. The server serializes the route DTO.

There is no spatial index.

Request flow: validation → name lookup → per-request graph → A* → route DTO.

## Frontend State Boundary

The reference client fetches the legacy endpoints and owns its WebGL scene, selection, FOCUS and SLIDE transitions, and map-only state. Those presentation states are not part of the API contract. The server only serves `./public` and does not interpret client interaction state.

## Self-hosting

| Variable | Default | Purpose |
| --- | --- | --- |
| `UTRA_LISTEN_ADDR` | `:8080` | HTTP listen address; the default binds all interfaces |
| `UTRA_DATA_PATH` | `data/nosql_mock/stars` | Local JSON catalog directory |

The default catalog and `./public` paths are relative to the working directory. Operators can use an absolute private data path, but serving the bundled UI still requires a working directory with the matching `public/` directory.

The HTTP server uses ReadHeader, Read, Write, and Idle timeouts of 5, 15, 30, and 60 seconds. SIGINT or SIGTERM starts graceful shutdown with a 10-second deadline.

## Current Limits and Extension Seams

The implementation retains an in-memory graph and local JSON catalog. It does not provide spatial indexing, authentication, persistence services, or a frontend-state contract. Those concerns can be added behind the existing storage, routing, and HTTP boundaries.
