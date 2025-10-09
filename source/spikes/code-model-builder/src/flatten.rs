use crate::model::Location;
use crate::model::{CodeModel, EdgeMetadata, EdgeType, Language, Metadata, Node, NodeKind};
use serde::{Deserialize, Serialize};

/// Flattened representation of the code model for analytics/ingest pipelines.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlattenedNode {
    pub guid: String,
    pub parent_guid: Option<String>,
    pub kind: NodeKind,
    pub name: String,
    pub language: Language,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub labels: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

/// Flattened edge record suitable for streaming into external stores (Neo4j).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlattenedEdge {
    pub guid: String,
    pub edge_type: EdgeType,
    pub from_guid: String,
    pub to_guid: String,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<EdgeMetadata>,
}

/// Flattened view of the entire model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlattenedModel {
    pub nodes: Vec<FlattenedNode>,
    pub edges: Vec<FlattenedEdge>,
}

/// Flatten a hierarchical [`CodeModel`] into tabular node/edge lists.
pub fn flatten_code_model(model: &CodeModel) -> FlattenedModel {
    let mut nodes = Vec::new();
    flatten_node_recursive(&model.workspace, None, &mut nodes);

    let edges = model
        .edges
        .iter()
        .map(|edge| FlattenedEdge {
            guid: edge.guid.clone(),
            edge_type: edge.edge_type,
            from_guid: edge.from_guid.clone(),
            to_guid: edge.to_guid.clone(),
            tags: edge.tags.clone(),
            metadata: edge.metadata.clone(),
        })
        .collect();

    FlattenedModel { nodes, edges }
}

fn flatten_node_recursive(node: &Node, parent_guid: Option<&str>, out: &mut Vec<FlattenedNode>) {
    out.push(FlattenedNode {
        guid: node.guid.clone(),
        parent_guid: parent_guid.map(|guid| guid.to_string()),
        kind: node.kind,
        name: node.name.clone(),
        language: node.language,
        labels: node.labels.clone(),
        location: node.location.clone(),
        metadata: node.metadata.clone(),
        hash: node.hash.clone(),
    });

    for child in &node.children {
        flatten_node_recursive(child, Some(&node.guid), out);
    }
}
