# Code Model Builder CLI

This spike builds a hierarchical code model for the repository and exports it in
formats that feed the Neo4j workspace. The CLI performs four passes:

1. Parse Rust/TypeScript files into a nested `CodeModel`.
2. Index the tree in a `SymbolTable`.
3. Extract relationships (e.g. `CALLS`, `IMPORTS`).
4. Aggregate duplicate edges so metadata carries call counts.

## Usage

```bash
cargo run --bin build-model -- --repo-root /workspace/source \
  --output flat \
  --out-dir /workspace/source/spikes/code-model-builder/output
```

Arguments:

- `--repo-root` (default `.`): project root to analyse.
- `--output` (default `tree`): `tree` (pretty JSON), `flat` (NDJSON tables),
  `neo4j` (writes the flat files and streams them into Neo4j).
- `--out-dir`: override the output directory; defaults to
  `spikes/code-model-builder/output` under the repo root.

## Outputs

| Mode   | Files                                                   | Notes                                        |
|--------|---------------------------------------------------------|----------------------------------------------|
| tree   | `model.json`                                            | Original hierarchical document.              |
| flat   | `nodes.jsonl`, `edges.jsonl`, `model.json`              | NDJSON rows with `guid`/`parent_guid`.       |
| neo4j  | `nodes.jsonl`, `edges.jsonl`, `model.json` + direct import| Streams into Neo4j and keeps local bundles.   |

The NDJSON tables are GUID-only: no Neo4j internal IDs are generated or used.

### Direct Neo4j Import

Use the new `neo4j` output mode to stream the flattened model straight into the
database (no Python involved):

```bash
cargo run --bin build-model -- \
  --repo-root /workspace/source \
  --output neo4j \
  --neo4j-uri bolt://localhost:7687 \
  --neo4j-user neo4j \
  --neo4j-password kalisi-neo4j \
  --neo4j-database neo4j \
  --neo4j-clear
```

Flags:

- `--neo4j-clear`: wipe existing `:CodeElement` graph before import.
- `--neo4j-delete-batch <id>`: remove a previous batch (matched by
  `import_batch` property) before loading.
- `--neo4j-batch <id>`: override the generated batch identifier (otherwise a new
  UUID is produced).
- `--neo4j-backup <file.graphml>`: attempt an `apoc.export.graphml.all` backup
  before any destructive step (written to Neo4j’s `import/` directory).

Every imported node and relationship carries an `import_batch` property so you
can safely roll back with:

```cypher
MATCH (n:CodeElement {import_batch: $batch}) DETACH DELETE n;
MATCH ()-[r]->() WHERE r.import_batch = $batch DELETE r;
```

## Importing into Neo4j

1. Copy `nodes.jsonl` and `edges.jsonl` into Neo4j's `import/` directory.
2. Execute the helper script:

   ```cypher
   :use neo4j
   :source scripts/neo4j/import_code_model.cypher
   ```

   (In a Neo4j Browser session you can paste the file; with `cypher-shell`
   run `:play` or use `cat import_code_model.cypher | cypher-shell`.)

The script:

- Creates a `CodeElement.guid` uniqueness constraint (GUID only).
- Loads nodes, attaches language/kind labels, and rebuilds `HAS_CHILD`.
- Loads domain edges, persisting their own GUID plus metadata.

Run a quick validation afterwards:

```cypher
MATCH (n:CodeElement) RETURN count(n);         // should match nodes.jsonl line count
MATCH ()-[r]->() WHERE r.guid IS NULL RETURN r LIMIT 5;  // expect zero rows
```
