# Tree-Table Data Contract

The tree-table view is backed by a flattened hierarchy fetched from Neo4j. The
layout engine expects the payload to match the interfaces defined in
`src/app/shared/tree-table/tree-table.types.ts`. This document clarifies how we
shape the Cypher query and what each field represents so new data sources can
plug in without touching the renderer.

## Query Responsibilities

1. **Flatten the Hierarchy**  
   Return a row per node with
   - `guid` and `parentGuid` (both are UUIDs from the import pipeline)
   - `label`, `kind`, `language`
   - `depth` (`0` for root, incremented per level)
   - `position` (integer sibling order; optional but keeps deterministic sorting)

2. **Join Column Values**  
   Each metric/text column is projected into a map entry keyed by `column.key`.
   Example Cypher skeleton:

   ```cypher
   MATCH (n:CodeElement {import_batch: $batch})
   OPTIONAL MATCH (n)-[:CALLS]->(callee)
   WITH n,
        count(callee) AS callCount,
        size([r IN relationships((n)-[:HAS_CHILD*]->()) WHERE type(r) = 'HAS_CHILD']) AS descendantCount
   RETURN n.guid              AS guid,
          n.parent_guid       AS parentGuid,
          n.name              AS label,
          n.kind              AS kind,
          n.language          AS language,
          n.depth             AS depth,
          n.position          AS position,
          {
            calls: { raw: callCount, formatted: toString(callCount) },
            descendants: { raw: descendantCount }
          }                   AS values
   ```

   The values map becomes `TreeTableNode.values` on the frontend.

3. **Provide Column Metadata**  
   The query (or an accompanying metadata fetch) should return the column
   definitions so the renderer knows how to label and format each metric. These
   align with `TreeTableColumn`. For static configurations you can attach them
   to the `ViewNode` definition; for dynamic sets they can be emitted alongside
   the node rows via `collect()` and `apoc.map.fromPairs`.

4. **Include Aggregates (Optional)**  
   When the backend pre-computes aggregates (sum, avg, etc.) per node, place
   them in `TreeTableNode.aggregates` using the same column keys. The renderer
   can then show group rows or tooltips without recomputing in the browser.

5. **Return Batch Metadata**  
   Attach the `import_batch` identifier (or equivalent dataset version) so the
   UI can surface provenance and support rollbacks. We expose this as
   `TreeTableQueryResult.batchId` and `generatedAt`.

## Backend Response Shape

The API handler should emit JSON similar to:

```json
{
  "columns": [
    { "key": "calls", "label": "Calls", "valueType": "integer", "allowAggregation": true },
    { "key": "descendants", "label": "Descendants", "valueType": "integer" }
  ],
  "nodes": [
    {
      "guid": "55f129a8-71ef-5846-ab92-368771e39491",
      "parentGuid": null,
      "label": "source",
      "kind": "Repository",
      "language": "multi",
      "depth": 0,
      "position": 0,
      "values": {
        "calls": { "raw": 0, "formatted": "0" },
        "descendants": { "raw": 8281 }
      }
    }
  ],
  "batchId": "ad52a600-fdb7-4b97-aac9-ef255f864a0f",
  "generatedAt": "2024-05-12T10:15:00.000Z"
}
```

## Next Steps

- Implement a backend query helper that produces the above JSON.
- Teach `ComponentFactory` to register a `tree-table` layout/renderer pairing
  that consumes `TreeTableQueryResult`.
- When we introduce pivoting, extend `TreeTableColumn` with dimension metadata
  (e.g. `role: 'row' | 'column' | 'value'`) without breaking the existing view.

### Client Integration

Use `Neo4jDataService.fetchTreeTable(batchId?: string)` to call the unified
Cypher endpoint (`/v0/cypher/unified`). The service executes the query above,
normalises the payload, and hands a `TreeTableLayoutResult` to the renderer
layer. You can supply a specific `import_batch` or omit the argument to fall
back to the most recently imported dataset.
