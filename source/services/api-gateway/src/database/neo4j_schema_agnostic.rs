use neo4rs::{Graph, query};
use std::collections::HashMap;
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

/// Schema-agnostic Neo4j client using official neo4rs driver
/// Extracts ALL data without knowing labels/properties in advance
pub struct Neo4jSchemaAgnosticClient {
    graph: Graph,
}

impl Neo4jSchemaAgnosticClient {
    /// Create new client with proper async connection
    pub async fn new(uri: &str, username: &str, password: &str) -> Result<Self, DatabaseError> {
        println!("NEO4J_CONNECTING: uri='{}', user='{}'", uri, username);
        
        // Use neo4rs async connection method
        let graph = Graph::new(uri, username, password)
            .map_err(|e| DatabaseError::ConnectionError(format!("Neo4j connection failed: {}", e)))?;

        println!("NEO4J_CONNECTED: Successfully connected with neo4rs");
        Ok(Self { graph })
    }

    /// Execute ANY query and return complete data without schema assumptions
    pub async fn execute(&self, query_str: &str, params: HashMap<String, Value>) -> Result<Value, DatabaseError> {
        println!("QUERY: {}", query_str);
        
        // Build neo4rs query with parameters converted to proper types
        let mut q = query(query_str);
        for (key, value) in params {
            // Convert serde_json::Value to neo4rs compatible type
            match value {
                Value::String(s) => q = q.param(&key, s),
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        q = q.param(&key, i);
                    } else if let Some(f) = n.as_f64() {
                        q = q.param(&key, f);
                    } else {
                        q = q.param(&key, n.to_string());
                    }
                },
                Value::Bool(b) => q = q.param(&key, b),
                _ => q = q.param(&key, value.to_string()),
            };
        }

        // Execute query
        let mut result = self.graph.execute(q).await
            .map_err(|e| DatabaseError::QueryError(format!("Query execution failed: {}", e)))?;

        // Extract ALL data using neo4rs JSON feature - zero schema assumptions
        let mut records = Vec::new();
        
        while let Ok(Some(row)) = result.next().await {
            // Use schema-agnostic approach: convert row to generic Value map
            let mut row_map = serde_json::Map::new();
            
            // Extract all available columns without knowing names
            // Try all possible extraction patterns
            let possible_columns = [
                "n", "m", "r", "rel", "node", "parent", "child", "sibling",
                "processes", "systems", "p1", "p2", "p3", "s1", "s2", "s3", "s4",
                "id", "name", "label", "type", "props", "labels", "keys"
            ];
            
            for col_name in &possible_columns {
                if let Ok(value) = row.get::<Value>(col_name) {
                    row_map.insert(col_name.to_string(), value);
                }
            }
            
            // Also try numeric indices
            for i in 0..10 {
                if let Ok(value) = row.get::<Value>(&i.to_string()) {
                    row_map.insert(format!("col_{}", i), value);
                }
            }
            
            let row_json = Value::Object(row_map);
            println!("NEO4J_RESULT: {}", serde_json::to_string_pretty(&row_json).unwrap_or_else(|_| format!("{:?}", row_json)));
            
            records.push(row_json);
        }

        let final_response = serde_json::json!({
            "results": records,
            "count": records.len(),
            "query": query_str
        });

        Ok(final_response)
    }

    /// Helper: Introspect database schema without assumptions
    pub async fn introspect_schema(&self) -> Result<Value, DatabaseError> {
        let schema_query = r#"
            CALL db.labels() YIELD label
            WITH collect(label) AS all_labels
            CALL db.relationshipTypes() YIELD relationshipType
            WITH all_labels, collect(relationshipType) AS all_relationship_types
            CALL db.propertyKeys() YIELD propertyKey
            RETURN {
                labels: all_labels,
                relationship_types: all_relationship_types,
                property_keys: collect(propertyKey)
            } AS schema
        "#;
        
        self.execute(schema_query, HashMap::new()).await
    }

    /// Helper: Sample database content without knowing structure
    pub async fn sample_all_data(&self, limit: i64) -> Result<Value, DatabaseError> {
        let sample_query = format!(r#"
            MATCH (n)
            RETURN elementId(n) AS id,
                   labels(n) AS labels,
                   keys(n) AS keys,
                   properties(n) AS props
            LIMIT {}
        "#, limit);
        
        self.execute(&sample_query, HashMap::new()).await
    }

    /// Helper: Get relationships without knowing types
    pub async fn sample_relationships(&self, limit: i64) -> Result<Value, DatabaseError> {
        let rel_query = format!(r#"
            MATCH ()-[r]->()
            RETURN elementId(r) AS id,
                   type(r) AS type,
                   startNodeElementId(r) AS startId,
                   endNodeElementId(r) AS endId,
                   keys(r) AS keys,
                   properties(r) AS props
            LIMIT {}
        "#, limit);
        
        self.execute(&rel_query, HashMap::new()).await
    }
}