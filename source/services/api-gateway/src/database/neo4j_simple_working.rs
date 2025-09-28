use neo4rs::{Graph, query};
use serde_json::Value;

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
    pub async fn run_query(&self, query_str: &str) -> Result<Value, DatabaseError> {
        
        // Use neo4rs execute method to get results, not just run
        let mut result = self.graph.execute(query(query_str)).await
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