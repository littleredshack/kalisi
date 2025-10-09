# Neo4j Scripts

- `import_code_model.cypher` — loads the flattened code model (`nodes.jsonl`,
  `edges.jsonl`) produced by the Rust CLI. It enforces GUID uniqueness, rebuilds
  the hierarchy via `HAS_CHILD`, and creates all domain edges with their own
  GUID/metadata. (You can now also stream directly from the CLI using
  `--output neo4j` if you prefer to skip this script.)

Prepare the NDJSON files, copy them into Neo4j's `import/` directory, then run:

```cypher
:source scripts/neo4j/import_code_model.cypher
```

(When using `cypher-shell`, you can pipe the file:
`cat scripts/neo4j/import_code_model.cypher | cypher-shell`.)
