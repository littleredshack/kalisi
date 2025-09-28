use axum::{
    response::IntoResponse,
    Json,
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
// Unified cypher endpoint

use crate::database::neo4j_simple_working::Neo4jSimpleClient;

/// Unified request structure for all Cypher queries
#[derive(Debug, Deserialize)]
pub struct UnifiedCypherRequest {
    pub query: String,
    #[serde(default)]
    #[allow(dead_code)]
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
}

/// Single unified endpoint for all Cypher queries in the application
/// Replaces: /v0/cypher/run, /v0/cypher/public, /v0/glen/cypher
pub async fn execute_unified_cypher(
    Json(request): Json<UnifiedCypherRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let start_time = std::time::Instant::now();
    
    
    // Basic validation
    if request.query.trim().is_empty() {
        return Ok(Json(UnifiedCypherResponse {
            success: false,
            message: "Query cannot be empty".to_string(),
            data: None,
            execution_time_ms: start_time.elapsed().as_millis() as u64,
            query: request.query,
        }));
    }
    
    // Get Neo4j config from environment
    let neo4j_uri = std::env::var("NEO4J_URI").unwrap_or_else(|_| "bolt://localhost:7687".to_string());
    let neo4j_username = std::env::var("NEO4J_USERNAME").unwrap_or_else(|_| "neo4j".to_string());
    let neo4j_password = std::env::var("NEO4J_PASSWORD").unwrap_or_else(|_| "password".to_string());
    let _neo4j_database = std::env::var("NEO4J_DATABASE").unwrap_or_else(|_| "neo4j".to_string());
    
    
    // Create working Neo4j client with shared connection
    match Neo4jSimpleClient::connect(&neo4j_uri, &neo4j_username, &neo4j_password) {
        Ok(client) => {
            // Execute query 
            match client.run_query(&request.query).await {
                Ok(raw_data) => {
                    let execution_time = start_time.elapsed().as_millis() as u64;
                    
                    let response = UnifiedCypherResponse {
                        success: true,
                        message: format!("Query executed successfully in {}ms", execution_time),
                        data: Some(raw_data),
                        execution_time_ms: execution_time,
                        query: request.query.clone(),
                    };
                    
                    Ok(Json(response))
                }
                Err(db_error) => {
                    let execution_time = start_time.elapsed().as_millis() as u64;
                    
                    println!("NEO4J_ERROR: {}", db_error);
                    
                    let response = UnifiedCypherResponse {
                        success: false,
                        message: format!("Query failed: {}", db_error),
                        data: None,
                        execution_time_ms: execution_time,
                        query: request.query.clone(),
                    };
                    
                    Ok(Json(response))
                }
            }
        }
        Err(connection_error) => {
            let execution_time = start_time.elapsed().as_millis() as u64;
            
            println!("NEO4J_CONNECTION_ERROR: {}", connection_error);
            
            let response = UnifiedCypherResponse {
                success: false,
                message: format!("Neo4j connection failed: {}", connection_error),
                data: None,
                execution_time_ms: execution_time,
                query: request.query.clone(),
            };
            
            Ok(Json(response))
        }
    }
}