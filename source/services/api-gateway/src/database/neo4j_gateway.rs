use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use neo4rs::{query, BoltNull, BoltType, ConfigBuilder, Graph, Query};
use serde::Serialize;
use serde_json::Value;
use tracing::{debug, info, warn};

use crate::config::Config;

#[derive(Debug, thiserror::Error)]
pub enum GatewayError {
    #[error("neo4j connection error: {0}")]
    Connection(String),
    #[error("neo4j query error: {0}")]
    Query(String),
}

#[derive(Debug, Serialize)]
pub struct QueryMetrics {
    pub elapsed_ms: u64,
    pub result_count: usize,
}

#[derive(Debug)]
pub struct GatewayQueryResult {
    pub metrics: QueryMetrics,
    pub raw_response: Value,
}

#[derive(Clone)]
pub struct Neo4jGateway {
    graph: Arc<Graph>,
    log_queries: bool,
}

impl Neo4jGateway {
    pub async fn new(config: &Config) -> anyhow::Result<Self> {
        let max_connections = std::env::var("NEO4J_POOL_MAX")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(24);

        let fetch_size = std::env::var("NEO4J_FETCH_SIZE")
            .ok()
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(500);

        let log_queries = std::env::var("NEO4J_DEBUG_QUERIES")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        let config_builder = ConfigBuilder::default()
            .uri(config.neo4j_uri.clone())
            .user(config.neo4j_username.clone())
            .password(config.neo4j_password.clone())
            .db(config.neo4j_database.clone())
            .max_connections(max_connections)
            .fetch_size(fetch_size);

        let graph = Graph::connect(config_builder.build()?)
            .map_err(|err| anyhow::anyhow!("failed to initialize Neo4j connection pool: {err}"))?;

        info!(
            target: "kalisi_gateway::database::neo4j",
            "Neo4j connection pool initialised (uri={}, max_connections={}, fetch_size={})",
            config.neo4j_uri,
            max_connections,
            fetch_size
        );

        Ok(Self {
            graph: Arc::new(graph),
            log_queries,
        })
    }

    pub async fn execute(
        &self,
        query_id: &str,
        cypher: &str,
        parameters: &HashMap<String, Value>,
    ) -> Result<GatewayQueryResult, GatewayError> {
        let mut prepared = query(cypher);
        for (key, value) in parameters {
            prepared = apply_parameter(prepared, key, value).map_err(|error| {
                GatewayError::Query(format!("invalid parameter {key}: {error}"))
            })?;
        }

        if self.log_queries {
            debug!(
                target: "kalisi_gateway::database::neo4j",
                query_id = %query_id,
                cypher = cypher,
                parameters = ?parameters,
                "Executing Cypher query"
            );
        }

        let start = Instant::now();
        let mut stream = self
            .graph
            .execute(prepared)
            .await
            .map_err(|error| GatewayError::Connection(error.to_string()))?;

        let mut rows = Vec::new();
        while let Ok(Some(row)) = stream.next().await {
            rows.push(row.get_all_json());
        }

        let elapsed_ms = start.elapsed().as_millis() as u64;

        if elapsed_ms > 750 {
            warn!(
                target: "kalisi_gateway::database::neo4j",
                query_id = %query_id,
                elapsed_ms,
                row_count = rows.len(),
                cypher = cypher,
                "Slow Cypher query detected"
            );
        }

        let raw_response = serde_json::json!({
            "results": rows,
            "count": rows.len(),
        });

        Ok(GatewayQueryResult {
            metrics: QueryMetrics {
                elapsed_ms,
                result_count: rows.len(),
            },
            raw_response,
        })
    }
}

fn apply_parameter(query: Query, key: &str, value: &Value) -> Result<Query, String> {
    Ok(match value {
        Value::Null => query.param(key, BoltType::Null(BoltNull)),
        Value::Bool(boolean) => query.param(key, *boolean),
        Value::Number(number) => {
            if let Some(int_value) = number.as_i64() {
                query.param(key, int_value)
            } else if let Some(float_value) = number.as_f64() {
                query.param(key, float_value)
            } else {
                return Err("unsupported numeric type".to_string());
            }
        }
        Value::String(text) => query.param(key, text.clone()),
        Value::Array(_) | Value::Object(_) => query.param(key, value.to_string()),
    })
}
