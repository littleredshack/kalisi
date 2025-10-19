use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

use crate::runtime::dto::{CanvasNodeDto, CanvasRelationshipDto};

/// Represents a partial update to a node's properties
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeUpdate {
    pub guid: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, Value>,
}

/// Represents a delta (incremental change) to a graph
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphDelta {
    #[serde(rename = "type")]
    pub message_type: String,
    pub view_node_id: String,
    pub timestamp: i64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodes_created: Vec<CanvasNodeDto>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodes_updated: Vec<NodeUpdate>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodes_deleted: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relationships_created: Vec<CanvasRelationshipDto>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub relationships_deleted: Vec<String>,
}

impl GraphDelta {
    /// Creates a new GraphDelta with the current timestamp
    pub fn new(view_node_id: String) -> Self {
        Self {
            message_type: "graph_delta".to_string(),
            view_node_id,
            timestamp: chrono::Utc::now().timestamp_millis(),
            nodes_created: Vec::new(),
            nodes_updated: Vec::new(),
            nodes_deleted: Vec::new(),
            relationships_created: Vec::new(),
            relationships_deleted: Vec::new(),
        }
    }

    /// Returns true if the delta contains any changes
    pub fn is_empty(&self) -> bool {
        self.nodes_created.is_empty()
            && self.nodes_updated.is_empty()
            && self.nodes_deleted.is_empty()
            && self.relationships_created.is_empty()
            && self.relationships_deleted.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_graph_delta_new() {
        let delta = GraphDelta::new("test-view-node-123".to_string());
        assert_eq!(delta.view_node_id, "test-view-node-123");
        assert_eq!(delta.message_type, "graph_delta");
        assert!(delta.is_empty());
    }

    #[test]
    fn test_graph_delta_serialization() {
        let delta = GraphDelta {
            message_type: "graph_delta".to_string(),
            view_node_id: "af6c06d2-5fd6-46e7-98d3-3b4249a7de45".to_string(),
            timestamp: 1734982292000,
            nodes_created: Vec::new(),
            nodes_updated: vec![NodeUpdate {
                guid: "node-123".to_string(),
                properties: {
                    let mut map = HashMap::new();
                    map.insert("name".to_string(), Value::String("Updated Name".to_string()));
                    map
                },
            }],
            nodes_deleted: vec!["node-456".to_string()],
            relationships_created: Vec::new(),
            relationships_deleted: vec!["rel-789".to_string()],
        };

        let json = serde_json::to_value(&delta).expect("Failed to serialize");

        assert_eq!(json["type"], "graph_delta");
        assert_eq!(json["viewNodeId"], "af6c06d2-5fd6-46e7-98d3-3b4249a7de45");
        assert_eq!(json["timestamp"], 1734982292000_i64);
        assert!(!delta.is_empty());
    }

    #[test]
    fn test_node_update_serialization() {
        let update = NodeUpdate {
            guid: "test-guid".to_string(),
            properties: {
                let mut map = HashMap::new();
                map.insert("foo".to_string(), Value::String("bar".to_string()));
                map
            },
        };

        let json = serde_json::to_value(&update).expect("Failed to serialize");
        assert_eq!(json["guid"], "test-guid");
        assert_eq!(json["properties"]["foo"], "bar");
    }
}
