use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasNodeDto {
    pub GUID: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub labels: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_guid: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<NodePosition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<NodeDisplay>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub tags: HashMap<String, Vec<String>>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDisplay {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub badges: Vec<BadgeDisplay>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_visible: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BadgeDisplay {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipDisplay {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label_visible: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dash: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasRelationshipDto {
    pub GUID: String,
    pub fromGUID: String,
    pub toGUID: String,
    pub r#type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display: Option<RelationshipDisplay>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct QueryMetadataDto {
    pub elapsed_ms: u64,
    pub rows_returned: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct CanvasGraphDto {
    pub query_id: String,
    pub cypher: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub parameters: HashMap<String, Value>,
    pub nodes: Vec<CanvasNodeDto>,
    pub edges: Vec<CanvasRelationshipDto>,
    pub metadata: QueryMetadataDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub telemetry_cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_rows: Option<Vec<Value>>,
}
