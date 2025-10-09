use neo4rs::{query, BoltNull, BoltType, Query, Graph};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug)]
pub enum DatabaseError {
    ConnectionError(String),
    QueryError(String),
}

impl std::fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DatabaseError::ConnectionError(msg) => write!(f, "Connection error: {}", msg),
            DatabaseError::QueryError(msg) => write!(f, "Query error: {}", msg),
        }
    }
}

impl std::error::Error for DatabaseError {}

/// Simple working Neo4j client using exact neo4rs patterns
pub struct Neo4jSimpleClient {
    graph: Graph,
}

impl Neo4jSimpleClient {
    /// Create new client using neo4rs exactly as documented
    pub fn connect(uri: &str, username: &str, password: &str) -> Result<Self, DatabaseError> {
        // Try different neo4rs connection patterns to find what works
        let graph = Graph::new(uri, username, password)
            .map_err(|e| DatabaseError::ConnectionError(format!("Connection failed: {}", e)))?;

        Ok(Self { graph })
    }

    /// Execute query and return ALL data
    pub async fn run_query(
        &self,
        query_str: &str,
        parameters: &HashMap<String, Value>,
    ) -> Result<Value, DatabaseError> {
        let mut neo_query = query(query_str);

        for (key, value) in parameters {
            neo_query =
                apply_parameter(neo_query, key, value).map_err(|e| DatabaseError::QueryError(e))?;
        }

        let mut result = self
            .graph
            .execute(neo_query)
            .await
            .map_err(|e| DatabaseError::QueryError(format!("Query failed: {}", e)))?;

        // Extract data with zero processing - direct conversion
        let mut records = Vec::new();

        while let Ok(Some(row)) = result.next().await {
            // Use our custom schema-agnostic method
            let row_json = row.get_all_json();
            records.push(row_json);
        }

        Ok(serde_json::json!({
            "results": records,
            "count": records.len(),
            "query": query_str
        }))
    }
}

fn apply_parameter(
    query: Query,
    key: &str,
    value: &Value,
) -> Result<Query, String> {
    Ok(match value {
        Value::Null => query.param(key, BoltType::Null(BoltNull::default())),
        Value::Bool(b) => query.param(key, *b),
        Value::Number(num) => {
            if let Some(i) = num.as_i64() {
                query.param(key, i)
            } else if let Some(f) = num.as_f64() {
                query.param(key, f)
            } else {
                return Err(format!("Unsupported numeric parameter for key '{}'", key));
            }
        }
        Value::String(s) => query.param(key, s.clone()),
        Value::Array(_) | Value::Object(_) => query.param(key, value.to_string()),
    })
}
