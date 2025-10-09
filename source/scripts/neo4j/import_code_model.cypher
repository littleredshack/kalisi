// Cypher helper for importing the flattened code model bundles.
// Assumes nodes.jsonl and edges.jsonl are staged in Neo4j's import directory.

// 1. GUID uniqueness (no reliance on Neo4j internal IDs)
CREATE CONSTRAINT code_element_guid IF NOT EXISTS
FOR (n:CodeElement)
REQUIRE n.guid IS UNIQUE;

// Optional supporting indexes
CREATE INDEX code_element_kind IF NOT EXISTS
FOR (n:CodeElement)
ON (n.kind);

CREATE INDEX code_element_language IF NOT EXISTS
FOR (n:CodeElement)
ON (n.language);

// 2. Load flattened nodes
CALL apoc.load.json("file:///nodes.jsonl") YIELD value AS node
MERGE (n:CodeElement {guid: node.guid})
SET
  n.kind = node.kind,
  n.name = node.name,
  n.language = node.language,
  n.labels_raw = node.labels,
  n.location = node.location,
  n.metadata = node.metadata,
  n.hash = node.hash,
  n.updatedAt = timestamp()
WITH n, node
WHERE node.kind IS NOT NULL
CALL apoc.create.addLabels(n, [node.kind]) YIELD node AS labelled
RETURN count(labelled);

// 3. Build hierarchy links
CALL apoc.load.json("file:///nodes.jsonl") YIELD value AS node
WITH node WHERE node.parent_guid IS NOT NULL
MATCH (parent:CodeElement {guid: node.parent_guid})
MATCH (child:CodeElement {guid: node.guid})
MERGE (parent)-[:HAS_CHILD]->(child);

// 4. Load domain edges (edge_type becomes relationship type)
CALL apoc.load.json("file:///edges.jsonl") YIELD value AS edge
MATCH (src:CodeElement {guid: edge.from_guid})
MATCH (dst:CodeElement {guid: edge.to_guid})
CALL apoc.create.relationship(
  src,
  edge.edge_type,
  {
    guid: edge.guid,
    tags: edge.tags,
    metadata: edge.metadata
  },
  dst
) YIELD rel
RETURN count(rel);
