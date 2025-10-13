use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
pub struct CanvasNodeDto {
    pub guid: String,
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

#[derive(Debug, Clone, Serialize)]
pub struct NodePosition {
    pub x: f64,
    pub y: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NodeDisplay {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CanvasRelationshipDto {
    pub guid: String,
    pub source_guid: String,
    pub target_guid: String,
    pub r#type: String,
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
    pub relationships: Vec<CanvasRelationshipDto>,
    pub metadata: QueryMetadataDto,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub telemetry_cursor: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw_rows: Option<Vec<Value>>,
}
