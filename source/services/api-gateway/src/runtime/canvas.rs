use std::collections::HashMap;

use chrono::Utc;
use serde_json::{Map, Value};

use crate::database::neo4j_gateway::GatewayQueryResult;

use super::dto::{
    BadgeDisplay, CanvasGraphDto, CanvasNodeDto, CanvasRelationshipDto, NodeDisplay, NodePosition,
    QueryMetadataDto, RelationshipDisplay,
};

const SKIP_FIELDS: &[&str] = &["elementId", "element_id", "neo4jId", "neo4j_id", "identity", "startNodeId", "endNodeId"];

pub fn build_canvas_response(
    query_id: String,
    cypher: String,
    parameters: HashMap<String, Value>,
    result: GatewayQueryResult,
    _include_raw_rows: bool,
) -> CanvasGraphDto {
    // Log 1: Query sent to database
    eprintln!("[{}] Query sent to Neo4j:\n{}\n", Utc::now().format("%Y-%m-%d %H:%M:%S%.3f"), cypher);

    let rows = result
        .raw_response
        .get("results")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let (nodes, relationships) = harvest_graph_entities(&rows);

    let metadata = QueryMetadataDto {
        elapsed_ms: result.metrics.elapsed_ms,
        rows_returned: result.metrics.result_count,
    };

    let response = CanvasGraphDto {
        query_id,
        cypher,
        parameters,
        nodes,
        edges: relationships,
        metadata,
        telemetry_cursor: None,
        raw_rows: None,
    };

    // Log 2: Response to frontend
    eprintln!("[{}] Response to frontend:\n{}\n",
        Utc::now().format("%Y-%m-%d %H:%M:%S%.3f"),
        serde_json::to_string_pretty(&response).unwrap_or_else(|_| "Failed to serialize".to_string())
    );

    response
}

fn harvest_graph_entities(rows: &[Value]) -> (Vec<CanvasNodeDto>, Vec<CanvasRelationshipDto>) {
    let mut node_map: HashMap<String, CanvasNodeDto> = HashMap::new();
    let mut rel_map: HashMap<String, CanvasRelationshipDto> = HashMap::new();

    for row in rows {
        visit_value(row, &mut node_map, &mut rel_map);
    }

    (
        node_map.into_values().collect(),
        rel_map.into_values().collect(),
    )
}

fn visit_value(
    value: &Value,
    node_map: &mut HashMap<String, CanvasNodeDto>,
    rel_map: &mut HashMap<String, CanvasRelationshipDto>,
) {
    match value {
        Value::Object(object) => {
            // Neo4j nodes have "labels", relationships have "type" at top level
            if object.contains_key("labels") {
                if let Some(node) = build_node(object) {
                    node_map.entry(node.guid.clone()).or_insert(node);
                    return;
                }
            } else if object.contains_key("type") {
                if let Some(rel) = build_edge(object) {
                    rel_map.entry(rel.guid.clone()).or_insert(rel);
                    return;
                }
            }

            // Recurse into nested objects
            for nested in object.values() {
                visit_value(nested, node_map, rel_map);
            }
        }
        Value::Array(array) => {
            for item in array {
                visit_value(item, node_map, rel_map);
            }
        }
        _ => {}
    }
}

fn build_node(object: &Map<String, Value>) -> Option<CanvasNodeDto> {
    let properties = object.get("properties")?.as_object()?.clone();

    // Find GUID
    let guid = properties.get("GUID")
        .or_else(|| properties.get("guid"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())?;

    // Get labels
    let labels = object
        .get("labels")
        .and_then(|value| value.as_array())
        .map(|array| {
            array
                .iter()
                .filter_map(|value| value.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    // Pass through ALL properties dynamically, skip only internal Neo4j IDs
    let cleaned_properties: HashMap<String, Value> = properties
        .into_iter()
        .filter(|(key, _)| !SKIP_FIELDS.iter().any(|skip| skip.eq_ignore_ascii_case(key)))
        .collect();

    Some(CanvasNodeDto {
        guid,
        labels,
        parent_guid: None,
        position: None,
        display: None,
        tags: HashMap::new(),
        properties: cleaned_properties,
    })
}

fn build_edge(object: &Map<String, Value>) -> Option<CanvasRelationshipDto> {
    let properties = object
        .get("properties")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();

    // Find GUID
    let guid = properties.get("GUID")
        .or_else(|| properties.get("guid"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())?;

    // Get type
    let edge_type = object
        .get("type")
        .or_else(|| properties.get("type"))
        .and_then(|value| value.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "RELATES_TO".to_string());

    // Extract fromGUID and toGUID
    let from_guid = properties.get("fromGUID")
        .or_else(|| properties.get("from_guid"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let to_guid = properties.get("toGUID")
        .or_else(|| properties.get("to_guid"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    // Pass through ALL properties dynamically, skip only internal Neo4j IDs
    let cleaned_properties = properties
        .into_iter()
        .filter(|(key, _)| !SKIP_FIELDS.iter().any(|skip| skip.eq_ignore_ascii_case(key)))
        .collect::<HashMap<_, _>>();

    Some(CanvasRelationshipDto {
        guid,
        fromGUID: from_guid,
        toGUID: to_guid,
        r#type: edge_type,
        display: None,
        properties: cleaned_properties,
    })
}

