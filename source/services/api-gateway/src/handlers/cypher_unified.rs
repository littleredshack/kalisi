use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};

use crate::database::neo4j_gateway::GatewayError;
use crate::state::AppState;
use tracing::{error, info};
use uuid::Uuid;

/// Unified request structure for all Cypher queries
#[derive(Debug, Deserialize)]
pub struct UnifiedCypherRequest {
    pub query: String,
    #[serde(default)]
    pub parameters: std::collections::HashMap<String, serde_json::Value>,
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

    info!(
        target: "kalisi_gateway::handlers::cypher_unified",
        query_id = %query_id,
        query = %request.query,
        parameters = ?request.parameters,
        "Executing unified Cypher request"
    );

    match state
        .neo4j
        .execute(&query_id, &request.query, &request.parameters)
        .await
    {
        Ok(result) => {
            let response = UnifiedCypherResponse {
                success: true,
                message: format!(
                    "Query executed successfully in {}ms",
                    result.metrics.elapsed_ms
                ),
                data: Some(result.raw_response),
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
