# Neo4j Scripts

## Scripts

### `import_code_model.cypher`

Loads the flattened code model (`nodes.jsonl`, `edges.jsonl`) produced by the Rust CLI.
It enforces GUID uniqueness, rebuilds the hierarchy via `HAS_CHILD`, and creates all
domain edges with their own GUID/metadata. (You can now also stream directly from the
CLI using `--output neo4j` if you prefer to skip this script.)

**Usage:**

Prepare the NDJSON files, copy them into Neo4j's `import/` directory, then run:

```cypher
:source scripts/neo4j/import_code_model.cypher
```

Or using `cypher-shell`:

```bash
cat scripts/neo4j/import_code_model.cypher | cypher-shell -u neo4j -p <password>
```

### `add_timestamp_support.cypher`

Adds real-time graph delta support by adding `lastModified` timestamps to all nodes
and relationships, plus creates indexes for efficient querying. This enables:

- Real-time delta detection for incremental graph updates
- Change Data Capture (CDC) for external systems
- Timestamp-based polling for graph changes

**Usage:**

```bash
cat scripts/neo4j/add_timestamp_support.cypher | cypher-shell -u neo4j -p <password>
```

Or in Neo4j Browser:

```cypher
:source scripts/neo4j/add_timestamp_support.cypher
```

**What it does:**

1. Adds `lastModified` property to all existing nodes and relationships
2. Creates indexes on `lastModified` for `CodeElement`, `ViewNode`, and all nodes
3. Documents optional APOC trigger setup for automatic timestamp updates

**After running this migration:**

- All new write operations should include: `SET n.lastModified = datetime().epochMillis`
- Consider setting up APOC triggers (see script comments) for automatic updates
- The real-time delta system will use these timestamps for CDC

**Related Documentation:**

See `/workspace/source/docs/realtime-neo4j-architecture.md` for the complete
real-time graph delta architecture.
