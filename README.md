# UtRa - Stellar Pathfinding & Navigation System

UtRa is a modern Graph-Based Pathfinding & Navigation System designed to compute optimal routes across weighted graph networks built from real astronomical data (The Astronomy Nexus dataset).

Initially prototyped in C using Dijkstra's and Bellman-Ford algorithms on raw coordinates, the core logic has been fully migrated to Go to improve concurrency handling, scalability, and code maintainability. 

## Current State & Architecture

The project has transitioned from a C-based monolithic script to a modular Go workspace. 

### 1. Data Layer (Scalable NoSQL Architecture)
We migrated away from the static `coo.txt` file and integrated the real Gaia subset from the Augmented Tycho-HYG (AT-HYG) dataset.
* **Local JSON Store**: The `database/` package implements a `StarDatabase` interface. For local development, this is backed by a directory of JSON files (`data/nosql_mock/stars/*.json`), where each star serves as an independent document.
* **Production Scalability**: The architecture perfectly emulates a Document NoSQL database (like MongoDB). When scaling to the full 2.5 million stars, the interface can easily be swapped out with a MongoDB driver without rewriting core logic.
* **Data Ingestion**: A Go ingestion utility (`cmd/ingest`) is provided to stream CSV dataset releases directly into the NoSQL store.

### 2. Core Pathfinding Engine (`pathfinding/`)
The `pathfinding/` module handles all graph abstractions and traversal logic.
* **Graph Modeling**: Stars are represented as graph nodes, and 3D Euclidean distances in parsecs act as edge weights.
* **A* Algorithm**: An optimized A* search algorithm leverages `container/heap` priority queues for extremely fast traversals.
* **Constraint-Based Optimization**: The pathfinding actively respects the physical limitations of the hypothetical ship—specifically, a `max_dist` parameter capping the distance of a single hyperdrive jump. If a star is too isolated, the system outputs an explicit `Unreachable` warning rather than failing silently.

### 3. CLI Application (`cmd/utra`)
The user-facing CLI combines the database and pathfinding engines.
* **Visual Route Mapping**: Automatically builds and prints an ASCII diagram of the calculated route between stars.
* **Relativistic Time Dilation**: Users can optionally provide the ship's speed as a fraction of the speed of light ($c$). The CLI computes the Lorentz factor ($\gamma$) to calculate the time experienced by outside observers vs. the much shorter proper time experienced by the ship's crew.

## Usage

### Ingesting Data
Before running the CLI, you must ingest the star dataset into the local NoSQL mock database.
```bash
go run ./cmd/ingest
```

### Running the CLI
Provide the starting star name, destination star name, and maximum jump distance in parsecs. Optionally, provide the ship's speed as a fraction of $c$ (defaults to `0.99c`).
```bash
go run ./cmd/utra "Sol" "HIP 611" 500 0.99
```

**Output Example:**
```
Database loaded. Searching for stars...
Calculating optimal route from 'Sol' to 'HIP 611 (TYC 7526-641-1)' with max jump 500.00 pc...

Route Map:
Sol --- 103.18 pc ---> HIP 611 (TYC 7526-641-1)

Hop Details:
Hop 1: Sol -> HIP 611 (TYC 7526-641-1)
  Distance: 103.18 pc (336.53 ly)
  Time (Observer): 339.93 years
  Time (Ship/Crew): 47.95 years

--- Trip Summary ---
Total Distance: 103.18 pc (336.53 ly)
Ship Speed: 0.9900c (Lorentz factor γ = 7.09)
Total Time (Outside Observer): 339.93 years
Total Time (Ship/Crew experienced): 47.95 years
```

### Testing
Run the comprehensive end-to-end test suite via standard Go tools:
```bash
go test ./...
```

## Technologies Used
* **Go**: Pathfinding, Concurrency, JSON parsing, and CLI structure.
* **C**: Legacy pathfinding implementation (kept for reference/interoperability).
* **AT-HYG Database**: Real-world astronomical dataset.
* **Relativity Mathematics**: Real-world physics application.
