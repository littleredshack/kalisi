# Neo4j Cleanup Guide

## How to Delete Code Model Data

All nodes and edges in the code model are tagged with labels/tags for easy identification and deletion.

### Node Labels

Every node has these labels:
- **`CodeModel`** - Identifies all code model nodes
- **Language label** - `Rust`, `TypeScript`, `Python`, `Multi`, or `Unknown`
- **Kind label** - `File`, `Function`, `Class`, `Struct`, `Method`, etc.

Example:
```json
{
  "labels": ["CodeModel", "Rust", "Function"]
}
```

### Edge Tags

Every edge has these tags:
- **`CodeModel`** - Identifies all code model edges

Example:
```json
{
  "tags": ["CodeModel"]
}
```

## Deletion Cypher Queries

### Delete All Code Model Data (Recommended)

```cypher
// Delete all nodes with CodeModel label and their relationships
MATCH (n:CodeModel)
DETACH DELETE n
```

This will:
- Delete all code model nodes
- Delete all relationships connected to those nodes
- Leave all other data in the database untouched

### Delete Only Specific Languages

```cypher
// Delete only Rust code
MATCH (n:CodeModel:Rust)
DETACH DELETE n

// Delete only TypeScript code
MATCH (n:CodeModel:TypeScript)
DETACH DELETE n
```

### Delete Only Specific Node Types

```cypher
// Delete only functions
MATCH (n:CodeModel:Function)
DETACH DELETE n

// Delete only classes
MATCH (n:CodeModel:Class)
DETACH DELETE n
```

### Delete Specific Edge Types

```cypher
// Delete only CALLS relationships (keep nodes)
MATCH ()-[r:CALLS]-()
WHERE 'CodeModel' IN r.tags
DELETE r

// Delete only IMPORTS relationships
MATCH ()-[r:IMPORTS]-()
WHERE 'CodeModel' IN r.tags
DELETE r
```

### Verify Before Deletion

```cypher
// Count code model nodes
MATCH (n:CodeModel)
RETURN count(n)

// Count code model relationships
MATCH (n:CodeModel)-[r]-()
RETURN count(r)

// List all labels used
MATCH (n:CodeModel)
RETURN DISTINCT labels(n)
LIMIT 20
```

## Safe Deletion Process

1. **Verify** what will be deleted:
   ```cypher
   MATCH (n:CodeModel)
   RETURN labels(n), count(*) as count
   ORDER BY count DESC
   ```

2. **Backup** (optional but recommended):
   ```cypher
   // Export to JSON or use Neo4j backup tools
   CALL apoc.export.json.query(
     "MATCH (n:CodeModel) RETURN n",
     "backup_codemodel.json",
     {}
   )
   ```

3. **Delete**:
   ```cypher
   MATCH (n:CodeModel)
   DETACH DELETE n
   ```

4. **Verify deletion**:
   ```cypher
   MATCH (n:CodeModel)
   RETURN count(n)
   // Should return 0
   ```

## Re-importing

After deletion, you can re-import the latest model:

```bash
# Regenerate model
./target/release/build-model

# Import to Neo4j (using your import tool)
# The output is at: spikes/code-model-builder/output/model.json
```

## Notes

- The `CodeModel` label is automatically added to all nodes and edges
- All other data in Neo4j (user data, business logic, etc.) is **completely safe**
- The deletion is **fast** because it uses indexed labels
- No orphaned relationships will remain (DETACH DELETE handles that)
