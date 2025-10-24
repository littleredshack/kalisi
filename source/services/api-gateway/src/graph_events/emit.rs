use crate::graph_events::{GraphDelta, GraphDeltaPublisher, NodeUpdate};
use serde_json::Value;
use std::collections::HashMap;
use tracing::{error, warn};

/// Detects if a Cypher query is a write operation
/// Initial implementation: any query that doesn't start with MATCH is considered a write
pub fn is_write_query(cypher: &str) -> bool {
    let trimmed = cypher.trim().to_uppercase();

    // List of write operations
    let write_keywords = [
        "CREATE",
        "MERGE",
        "SET",
        "DELETE",
        "REMOVE",
        "DETACH DELETE",
    ];

    write_keywords
        .iter()
        .any(|keyword| trimmed.starts_with(keyword) || trimmed.contains(&format!(" {}", keyword)))
}

/// Attempts to emit a graph delta after a successful write
/// Production implementation: extracts actual changed nodes from Neo4j result
pub async fn try_emit_delta(
    publisher: &mut GraphDeltaPublisher,
    view_node_id: Option<String>,
    cypher: &str,
    neo4j_result: &Value,
) -> Option<GraphDelta> {
    // Feature flag check
    let enabled = std::env::var("ENABLE_GRAPH_DELTA")
        .unwrap_or_else(|_| "false".to_string())
        .parse::<bool>()
        .unwrap_or(false);

    warn!("🔍 try_emit_delta called: enabled={}, view_node_id={:?}, query_starts_with={}",
        enabled, view_node_id, cypher.chars().take(50).collect::<String>());

    if !enabled {
        warn!("❌ Graph delta emission disabled (ENABLE_GRAPH_DELTA={})", enabled);
        return None;
    }

    // Check if we have a view node ID
    let view_node_id = match view_node_id {
        Some(id) => {
            warn!("✅ ViewNode ID provided: {}", id);
            id
        },
        None => {
            warn!("❌ No view_node_id provided, skipping delta emission");
            return None;
        }
    };

    // Check if this is a write query
    if !is_write_query(cypher) {
        warn!("❌ Query is not a write operation, skipping delta emission");
        return None;
    }

    warn!("✅ This IS a write query, proceeding with delta emission");

    // Extract changed nodes from Neo4j result
    // raw_response structure: { "results": [...], "count": N }
    let mut delta = GraphDelta::new(view_node_id);

    if let Some(results) = neo4j_result.get("results").and_then(|v| v.as_array()) {
        warn!("📊 Extracting {} result(s) from Neo4j response", results.len());

        for result in results {
            // Each result is an object with variable names as keys (e.g., {"n": {...}})
            if let Some(result_obj) = result.as_object() {
                for (_var_name, node_value) in result_obj {
                    // Check if this is a node object with GUID
                    if let Some(guid) = node_value.get("GUID").and_then(|v| v.as_str()) {
                        // Extract properties from the node
                        let mut properties = HashMap::new();

                        if let Some(props) = node_value.get("properties").and_then(|v| v.as_object()) {
                            for (key, value) in props {
                                // Skip GUID in properties since it's in the main object
                                if key != "GUID" {
                                    properties.insert(key.clone(), value.clone());
                                }
                            }
                        }

                        let node_update = NodeUpdate {
                            guid: guid.to_string(),
                            properties,
                        };

                        warn!("✅ Adding node update for GUID: {} with {} properties", guid, node_update.properties.len());
                        delta.nodes_updated.push(node_update);
                    }
                }
            }
        }
    }

    if delta.is_empty() {
        warn!("⚠️  Delta is empty, no changes detected");
        return None;
    }

    warn!("✅ Delta contains {} updated node(s)", delta.nodes_updated.len());

    // Publish to Redis stream
    match publisher.publish(&delta).await {
        Ok(message_id) => {
            warn!("✅ Published delta to Redis: message_id={}", message_id);
            Some(delta)
        }
        Err(e) => {
            error!("❌ Failed to publish delta to Redis: {}", e);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_write_query() {
        assert!(is_write_query("CREATE (n:Node {name: 'test'})"));
        assert!(is_write_query("MERGE (n:Node {id: '123'})"));
        assert!(is_write_query("MATCH (n) SET n.name = 'updated'"));
        assert!(is_write_query("MATCH (n) DELETE n"));
        assert!(is_write_query("MATCH (n) DETACH DELETE n"));
        assert!(is_write_query("MATCH (n) REMOVE n.property"));

        assert!(!is_write_query("MATCH (n) RETURN n"));
        assert!(!is_write_query("MATCH (n:Node) WHERE n.id = '123' RETURN n"));

        // Edge cases
        assert!(is_write_query("  CREATE (n)"));
        assert!(is_write_query("create (n)"));
    }
}
