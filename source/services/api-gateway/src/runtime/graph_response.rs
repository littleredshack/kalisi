use std::collections::HashMap;

use serde::Serialize;
use serde_json::Value;

use crate::database::neo4j_gateway::{GatewayQueryResult, QueryMetrics};

/// Canonical representation of a node in the runtime data contract.
#[derive(Debug, Clone, Serialize)]
pub struct CanonicalNode {
    pub guid: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_guid: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, Value>,
}

/// Canonical representation of a relationship/edge.
#[derive(Debug, Clone, Serialize)]
pub struct CanonicalRelationship {
    pub guid: String,
    pub source_guid: String,
    pub target_guid: String,
    pub r#type: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, Value>,
}

/// Additional metadata that accompanies a graph response.
#[derive(Debug, Clone, Serialize)]
pub struct GraphMetadata {
    pub elapsed_ms: u64,
    pub rows_returned: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub telemetry_cursor: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub tags: HashMap<String, Value>,
}

/// Canonical graph response returned to the runtime pipeline.
#[derive(Debug, Clone, Serialize)]
pub struct CanonicalGraphResponse {
    pub query_id: String,
    pub cypher: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub parameters: HashMap<String, Value>,
    pub nodes: Vec<CanonicalNode>,
    pub relationships: Vec<CanonicalRelationship>,
    pub metadata: GraphMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_rows: Option<Vec<Value>>,
}

impl CanonicalGraphResponse {
    pub fn from_gateway_result(
        query_id: String,
        cypher: String,
        parameters: HashMap<String, Value>,
        result: &GatewayQueryResult,
        include_raw_rows: bool,
    ) -> Self {
        let raw_rows = if include_raw_rows {
            result
                .raw_response
                .get("results")
                .and_then(|value| value.as_array())
                .map(|rows| rows.to_vec())
        } else {
            None
        };

        Self {
            query_id,
            cypher,
            parameters,
            nodes: Vec::new(),
            relationships: Vec::new(),
            metadata: GraphMetadata::from_metrics(&result.metrics),
            raw_rows,
        }
    }

    pub fn with_rows(mut self, rows: &[Value]) -> Self {
        let (nodes, relationships) = canonicalise_rows(rows);
        self.nodes = nodes;
        self.relationships = relationships;
        self
    }
}

impl GraphMetadata {
    pub fn from_metrics(metrics: &QueryMetrics) -> Self {
        Self {
            elapsed_ms: metrics.elapsed_ms,
            rows_returned: metrics.result_count,
            telemetry_cursor: None,
            tags: HashMap::new(),
        }
    }
}

fn canonicalise_rows(rows: &[Value]) -> (Vec<CanonicalNode>, Vec<CanonicalRelationship>) {
    let mut node_map: HashMap<String, CanonicalNode> = HashMap::new();
    let mut rel_map: HashMap<String, CanonicalRelationship> = HashMap::new();

    for row in rows {
        if let Some(object) = row.as_object() {
            for value in object.values() {
                if let Some(node) = parse_node(value) {
                    node_map.entry(node.guid.clone()).or_insert(node);
                    continue;
                }

                if let Some(rel) = parse_relationship(value) {
                    rel_map.entry(rel.guid.clone()).or_insert(rel);
                }
            }
        }
    }

    (
        node_map.into_values().collect(),
        rel_map.into_values().collect(),
    )
}

fn parse_node(value: &Value) -> Option<CanonicalNode> {
    let object = value.as_object()?;
    let properties = object.get("properties")?.as_object()?;

    let guid = extract_guid(properties, object)?;
    let labels = object
        .get("labels")
        .and_then(|labels| labels.as_array())
        .map(|labels| {
            labels
                .iter()
                .filter_map(|label| label.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let parent_guid = properties
        .get("parentGUID")
        .or_else(|| properties.get("parent_guid"))
        .or_else(|| properties.get("parentId"))
        .and_then(|value| value.as_str().map(|s| s.to_string()));

    let mut cleaned_properties = HashMap::new();
    for (key, value) in properties {
        cleaned_properties.insert(key.clone(), value.clone());
    }

    Some(CanonicalNode {
        guid,
        labels,
        parent_guid,
        properties: cleaned_properties,
    })
}

fn parse_relationship(value: &Value) -> Option<CanonicalRelationship> {
    let object = value.as_object()?;

    let properties = object
        .get("properties")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();

    let source_guid = properties
        .get("fromGUID")
        .or_else(|| properties.get("from_guid"))
        .or_else(|| object.get("startNodeId"))
        .or_else(|| object.get("source"))
        .and_then(|value| value.as_str().map(|s| s.to_string()))?;

    let target_guid = properties
        .get("toGUID")
        .or_else(|| properties.get("to_guid"))
        .or_else(|| object.get("endNodeId"))
        .or_else(|| object.get("target"))
        .and_then(|value| value.as_str().map(|s| s.to_string()))?;

    let rel_type = object
        .get("type")
        .or_else(|| properties.get("type"))
        .and_then(|value| value.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "RELATIONSHIP".to_string());

    let guid = properties
        .get("GUID")
        .or_else(|| properties.get("guid"))
        .and_then(|value| value.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| format!("{source_guid}->{target_guid}:{rel_type}"));

    let mut cleaned_properties = HashMap::new();
    for (key, value) in &properties {
        cleaned_properties.insert(key.clone(), value.clone());
    }

    Some(CanonicalRelationship {
        guid,
        source_guid,
        target_guid,
        r#type: rel_type,
        properties: cleaned_properties,
    })
}

fn extract_guid(
    properties: &serde_json::Map<String, Value>,
    object: &serde_json::Map<String, Value>,
) -> Option<String> {
    properties
        .get("GUID")
        .or_else(|| properties.get("guid"))
        .or_else(|| properties.get("id"))
        .or_else(|| object.get("id"))
        .and_then(|value| match value {
            Value::String(text) => Some(text.clone()),
            Value::Number(number) => Some(number.to_string()),
            _ => None,
        })
}
