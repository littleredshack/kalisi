use super::*;
use crate::runtime::dto::CanvasNodeDto;

#[cfg(test)]
mod integration_tests {
    use super::*;

    #[test]
    fn test_graph_delta_creation() {
        let delta = GraphDelta::new("test-view-node-123".to_string());

        assert_eq!(delta.view_node_id, "test-view-node-123");
        assert_eq!(delta.message_type, "graph_delta");
        assert!(delta.is_empty());
        assert!(delta.timestamp > 0);
    }

    #[test]
    fn test_graph_delta_with_changes() {
        let mut delta = GraphDelta::new("test-view-node".to_string());

        // Add a created node
        delta.nodes_created.push(CanvasNodeDto {
            guid: "node-1".to_string(),
            labels: vec!["TestNode".to_string()],
            parent_guid: None,
            position: None,
            display: None,
            tags: std::collections::HashMap::new(),
            properties: std::collections::HashMap::new(),
        });

        // Add an updated node
        delta.nodes_updated.push(NodeUpdate {
            guid: "node-2".to_string(),
            properties: {
                let mut map = std::collections::HashMap::new();
                map.insert("name".to_string(), serde_json::Value::String("Updated".to_string()));
                map
            },
        });

        // Add a deleted node
        delta.nodes_deleted.push("node-3".to_string());

        assert!(!delta.is_empty());
        assert_eq!(delta.nodes_created.len(), 1);
        assert_eq!(delta.nodes_updated.len(), 1);
        assert_eq!(delta.nodes_deleted.len(), 1);
    }

    #[test]
    fn test_graph_delta_serialization() {
        let mut delta = GraphDelta::new("view-123".to_string());
        delta.nodes_deleted.push("deleted-node".to_string());

        let json = serde_json::to_string(&delta).expect("Should serialize");

        assert!(json.contains("graph_delta"));
        assert!(json.contains("view-123"));
        assert!(json.contains("deleted-node"));
        assert!(json.contains("viewNodeId")); // camelCase from serde rename
    }

    #[test]
    fn test_graph_delta_deserialization() {
        let json = r#"{
            "type": "graph_delta",
            "viewNodeId": "view-abc",
            "timestamp": 1734982292000,
            "nodesCreated": [],
            "nodesUpdated": [],
            "nodesDeleted": ["node-123"],
            "relationshipsCreated": [],
            "relationshipsDeleted": []
        }"#;

        let delta: GraphDelta = serde_json::from_str(json).expect("Should deserialize");

        assert_eq!(delta.view_node_id, "view-abc");
        assert_eq!(delta.timestamp, 1734982292000_i64);
        assert_eq!(delta.nodes_deleted.len(), 1);
        assert_eq!(delta.nodes_deleted[0], "node-123");
    }
}

#[cfg(test)]
mod emit_tests {
    use super::*;

    #[test]
    fn test_is_write_query_create() {
        assert!(is_write_query("CREATE (n:Node {name: 'test'})"));
        assert!(is_write_query("create (n)"));
        assert!(is_write_query("  CREATE (n)  "));
    }

    #[test]
    fn test_is_write_query_merge() {
        assert!(is_write_query("MERGE (n:Node {id: '123'})"));
        assert!(is_write_query("MATCH (a) MERGE (b)"));
    }

    #[test]
    fn test_is_write_query_set() {
        assert!(is_write_query("MATCH (n) SET n.name = 'updated'"));
        assert!(is_write_query("MATCH (n) WHERE n.id = '1' SET n.prop = 'value'"));
    }

    #[test]
    fn test_is_write_query_delete() {
        assert!(is_write_query("MATCH (n) DELETE n"));
        assert!(is_write_query("MATCH (n) DETACH DELETE n"));
    }

    #[test]
    fn test_is_not_write_query() {
        assert!(!is_write_query("MATCH (n) RETURN n"));
        assert!(!is_write_query("MATCH (n:Node) WHERE n.id = '123' RETURN n"));
        assert!(!is_write_query("CALL db.labels()"));
    }
}
