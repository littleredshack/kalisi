use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::database::neo4j_gateway::GatewayError;
use crate::graph_events::try_emit_delta;
use crate::state::AppState;
use tracing::{error, info, warn};
use uuid::Uuid;

/// Unified request structure for all Cypher queries
#[derive(Debug, Deserialize)]
pub struct UnifiedCypherRequest {
    pub query: String,
    #[serde(default)]
    pub parameters: std::collections::HashMap<String, serde_json::Value>,
    /// Optional ViewNode ID for graph delta emission (feature-flagged)
    #[serde(default)]
    pub view_node_id: Option<String>,
}

/// Unified response structure for all Cypher results
#[derive(Debug, Serialize)]
pub struct UnifiedCypherResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
    pub execution_time_ms: u64,
    pub query: String,
    pub rows_returned: usize,
}

const SKIP_FIELDS: &[&str] = &["elementId", "element_id", "neo4jId", "neo4j_id", "identity", "startNodeId", "endNodeId"];

/// Transform raw Neo4j response into standardized graph format
/// Fully dynamic - passes through all fields except internal Neo4j IDs
fn transform_to_graph_format(raw_response: &serde_json::Value) -> serde_json::Value {
    let mut nodes_map: HashMap<String, serde_json::Value> = HashMap::new();
    let mut edges_map: HashMap<String, serde_json::Value> = HashMap::new();

    if let Some(results) = raw_response.get("results").and_then(|r| r.as_array()) {
        for row in results {
            if let Some(row_obj) = row.as_object() {
                for (_key, value) in row_obj.iter() {
                    extract_graph_elements_dynamic(value, &mut nodes_map, &mut edges_map);
                }
            }
        }
    }

    serde_json::json!({
        "nodes": nodes_map.values().collect::<Vec<_>>(),
        "edges": edges_map.values().collect::<Vec<_>>()
    })
}

/// Recursively extract nodes and edges - FULLY DYNAMIC
fn extract_graph_elements_dynamic(
    value: &serde_json::Value,
    nodes_map: &mut HashMap<String, serde_json::Value>,
    edges_map: &mut HashMap<String, serde_json::Value>,
) {
    match value {
        serde_json::Value::Object(obj) => {
            // Detect nodes: have "labels" field
            let is_node = obj.contains_key("labels");
            // Detect edges: have "type" field and it's a string
            let is_edge = obj.get("type").map(|v| v.is_string()).unwrap_or(false);

            if is_node || is_edge {
                // Get properties
                let properties = obj.get("properties")
                    .and_then(|p| p.as_object())
                    .cloned()
                    .unwrap_or_default();

                // Find GUID (check both top-level and properties)
                let guid = obj.get("GUID")
                    .or_else(|| obj.get("guid"))
                    .or_else(|| properties.get("GUID"))
                    .or_else(|| properties.get("guid"))
                    .and_then(|g| g.as_str())
                    .map(|s| s.to_string());

                if let Some(guid_key) = guid {
                    let mut result = serde_json::Map::new();

                    // Copy labels if node
                    if let Some(labels) = obj.get("labels") {
                        result.insert("labels".to_string(), labels.clone());
                    }

                    // Copy type if edge
                    if let Some(type_val) = obj.get("type") {
                        result.insert("type".to_string(), type_val.clone());
                    }

                    // Copy ALL properties dynamically, skip only internal Neo4j IDs
                    for (key, val) in properties {
                        if !SKIP_FIELDS.iter().any(|skip| skip.eq_ignore_ascii_case(&key)) {
                            result.insert(key.clone(), val.clone());
                        }
                    }

                    if is_node {
                        nodes_map.insert(guid_key, serde_json::Value::Object(result));
                    } else {
                        edges_map.insert(guid_key, serde_json::Value::Object(result));
                    }
                }
            } else {
                // Not a node or edge, recurse
                for (_key, nested_value) in obj {
                    extract_graph_elements_dynamic(nested_value, nodes_map, edges_map);
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr {
                extract_graph_elements_dynamic(item, nodes_map, edges_map);
            }
        }
        _ => {}
    }
}

/// Single unified endpoint for all Cypher queries in the application
/// Replaces: /v0/cypher/run, /v0/cypher/public, /v0/glen/cypher
pub async fn execute_unified_cypher(
    State(state): State<AppState>,
    Json(request): Json<UnifiedCypherRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    // Basic validation
    if request.query.trim().is_empty() {
        return Ok(Json(UnifiedCypherResponse {
            success: false,
            message: "Query cannot be empty".to_string(),
            data: None,
            execution_time_ms: 0,
            query: request.query,
            rows_returned: 0,
        }));
    }

    let query_id = Uuid::new_v4().to_string();

    // Extract trace_id from parameters if present for latency tracking
    let trace_id = request.parameters.get("trace_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // [TIMING T1] Request received at gateway
    if !trace_id.is_empty() {
        let t1 = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        warn!("[TIMING:{}:T1:{}] Request received at gateway", trace_id, t1);
    }

    info!(
        target: "kalisi_gateway::handlers::cypher_unified",
        query_id = %query_id,
        query = %request.query,
        parameters = ?request.parameters,
        "Executing unified Cypher request"
    );

    // Log the query being sent to Neo4j for debugging
    warn!(
        target: "kalisi_gateway::handlers::cypher_unified",
        "📤 Query sent to Neo4j:\n{}\nParameters: {:?}", request.query, request.parameters
    );

    match state
        .neo4j
        .execute(&query_id, &request.query, &request.parameters)
        .await
    {
        Ok(result) => {
            // [TIMING T2] Neo4j response received
            if !trace_id.is_empty() {
                let t2 = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis();
                warn!("[TIMING:{}:T2:{}] Neo4j response received", trace_id, t2);
            }
            // Attempt to emit graph delta if this was a write operation
            // Production implementation: pass actual Neo4j result data
            {
                let mut publisher = state.graph_delta_publisher.lock().await;
                if let Some(_delta) = try_emit_delta(
                    &mut publisher,
                    request.view_node_id.clone(),
                    &request.query,
                    &result.raw_response
                ).await {
                    // [TIMING T3] Delta published to Redis stream
                    if !trace_id.is_empty() {
                        let t3 = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap()
                            .as_millis();
                        warn!("[TIMING:{}:T3:{}] Delta published to Redis stream", trace_id, t3);
                    }
                    info!(
                        target: "kalisi_gateway::handlers::cypher_unified",
                        query_id = %query_id,
                        "Graph delta published to Redis stream"
                    );
                }
            }

            // Transform raw response to standardized graph format
            let graph_data = transform_to_graph_format(&result.raw_response);

            // Log the response for debugging
            let json_response = serde_json::to_string_pretty(&graph_data).unwrap_or_else(|_| "Failed to serialize".to_string());
            warn!(
                target: "kalisi_gateway::handlers::cypher_unified",
                query_id = %query_id,
                elapsed_ms = result.metrics.elapsed_ms,
                rows_returned = result.metrics.result_count,
                "✅ Query completed - returning response:\n{}", json_response
            );

            let response = UnifiedCypherResponse {
                success: true,
                message: format!(
                    "Query executed successfully in {}ms",
                    result.metrics.elapsed_ms
                ),
                data: Some(graph_data),
                execution_time_ms: result.metrics.elapsed_ms,
                query: request.query.clone(),
                rows_returned: result.metrics.result_count,
            };

            Ok(Json(response))
        }
        Err(error) => {
            let message = match error {
                GatewayError::Connection(reason) => {
                    error!(
                        target: "kalisi_gateway::handlers::cypher_unified",
                        query_id = %query_id,
                        %reason,
                        "Neo4j connection failed"
                    );
                    format!("Neo4j connection failed: {reason}")
                }
                GatewayError::Query(reason) => {
                    error!(
                        target: "kalisi_gateway::handlers::cypher_unified",
                        query_id = %query_id,
                        %reason,
                        "Neo4j query error"
                    );
                    format!("Query failed: {reason}")
                }
            };

            Ok(Json(UnifiedCypherResponse {
                success: false,
                message,
                data: None,
                execution_time_ms: 0,
                query: request.query.clone(),
                rows_returned: 0,
            }))
        }
    }
}
