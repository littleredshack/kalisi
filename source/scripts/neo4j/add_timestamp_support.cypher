// ============================================================================
// Neo4j Real-Time Graph Delta Support - Timestamp Migration
// ============================================================================
//
// This script adds lastModified timestamps to all nodes and relationships
// to support real-time graph delta detection and CDC (Change Data Capture).
//
// Run this script using cypher-shell or Neo4j Browser:
//   cat add_timestamp_support.cypher | cypher-shell -u neo4j -p <password>
//
// ============================================================================

// Step 1: Add lastModified to all existing nodes
// ============================================================================
MATCH (n)
WHERE n.lastModified IS NULL
SET n.lastModified = datetime().epochMillis
RETURN count(n) as nodesUpdated;

// Step 2: Add lastModified to all existing relationships
// ============================================================================
MATCH ()-[r]->()
WHERE r.lastModified IS NULL
SET r.lastModified = datetime().epochMillis
RETURN count(r) as relationshipsUpdated;

// Step 3: Create indexes on lastModified for efficient queries
// ============================================================================

// Index for CodeElement nodes (most common type)
CREATE INDEX code_element_last_modified IF NOT EXISTS
FOR (n:CodeElement)
ON (n.lastModified);

// Index for ViewNode nodes (used for canvas views)
CREATE INDEX view_node_last_modified IF NOT EXISTS
FOR (n:ViewNode)
ON (n.lastModified);

// Generic index for all nodes (optional, but useful for CDC)
// Note: This creates a composite index that can be used for range queries
CREATE INDEX node_last_modified IF NOT EXISTS
FOR (n)
ON (n.lastModified);

// Step 4: Verify indexes were created
// ============================================================================
SHOW INDEXES YIELD name, labelsOrTypes, properties, type
WHERE properties = ["lastModified"]
RETURN name, labelsOrTypes, properties, type;

// ============================================================================
// Optional: APOC Trigger Setup (Requires APOC plugin)
// ============================================================================
//
// If you have APOC installed, you can create triggers that automatically
// update lastModified on every write operation:
//
// CALL apoc.trigger.add(
//   'updateLastModifiedOnNodeCreate',
//   'UNWIND $createdNodes AS n
//    SET n.lastModified = datetime().epochMillis',
//   {phase: 'after'}
// );
//
// CALL apoc.trigger.add(
//   'updateLastModifiedOnNodeUpdate',
//   'UNWIND $assignedNodeProperties AS prop
//    WITH prop.node AS n
//    SET n.lastModified = datetime().epochMillis',
//   {phase: 'after'}
// );
//
// CALL apoc.trigger.add(
//   'updateLastModifiedOnRelCreate',
//   'UNWIND $createdRelationships AS r
//    SET r.lastModified = datetime().epochMillis',
//   {phase: 'after'}
// );
//
// CALL apoc.trigger.add(
//   'updateLastModifiedOnRelUpdate',
//   'UNWIND $assignedRelationshipProperties AS prop
//    WITH prop.relationship AS r
//    SET r.lastModified = datetime().epochMillis',
//   {phase: 'after'}
// );
//
// To list all triggers:
//   CALL apoc.trigger.list() YIELD name, query, paused RETURN *;
//
// To remove triggers:
//   CALL apoc.trigger.remove('updateLastModifiedOnNodeCreate');
//
// ============================================================================
// Notes:
// ============================================================================
//
// 1. The lastModified property is stored as epoch milliseconds (Long)
// 2. Indexes improve query performance for CDC polling and delta detection
// 3. APOC triggers are optional but recommended for automatic updates
// 4. Without triggers, ensure all write operations update lastModified:
//    - In Cypher: SET n.lastModified = datetime().epochMillis
//    - In API handlers: include lastModified in all CREATE/MERGE/SET operations
// 5. For CDC without APOC, use polling queries like:
//    MATCH (n) WHERE n.lastModified > $lastPollTimestamp RETURN n
//
// ============================================================================
