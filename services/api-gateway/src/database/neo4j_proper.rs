use neo4rs::{query, Graph, Row, BoltType};
use serde_json::{json, Map, Value};
use std::sync::Arc;

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

/// Proper Neo4j client using shared connection and schema-agnostic extraction
pub struct Neo4jProperClient {
    graph: Arc<Graph>,
}

impl Neo4jProperClient {
    /// Create new client with shared connection
    pub fn new(uri: &str, username: &str, password: &str) -> Result<Self, DatabaseError> {
        println!("NEO4J_CONNECTING: uri='{}', user='{}'", uri, username);
        
        let graph = Graph::new(uri, username, password)
            .map_err(|e| DatabaseError::ConnectionError(format!("Neo4j connection failed: {}", e)))?;

        println!("NEO4J_CONNECTED: Shared connection established");
        Ok(Self { graph: Arc::new(graph) })
    }

    /// Execute query with complete schema-agnostic data extraction
    pub async fn execute(&self, query_str: &str, params: Map<String, Value>) -> Result<Value, DatabaseError> {
        println!("QUERY: {}", query_str);
        
        // Build query with dynamic params (schema-agnostic)
        let mut q = query(query_str);
        for (k, v) in params.iter() {
            if let Some(i) = v.as_i64() { q = q.param(k, i); continue; }
            if let Some(f) = v.as_f64() { q = q.param(k, f); continue; }
            if let Some(b) = v.as_bool() { q = q.param(k, b); continue; }
            if let Some(s) = v.as_str() { q = q.param(k, s.to_owned()); continue; }
            // Pass arbitrary JSON via neo4rs "json" feature
            q = q.param(k, v.clone());
        }

        let mut stream = self.graph.execute(q).await
            .map_err(|e| DatabaseError::QueryError(format!("Query execution failed: {}", e)))?;

        // Get dynamic columns from first row
        let first = stream.next().await
            .map_err(|e| DatabaseError::QueryError(format!("Stream error: {}", e)))?;

        let mut columns: Vec<String> = Vec::new();
        let mut rows: Vec<Map<String, Value>> = Vec::new();

        if let Some(row) = first {
            columns = row_keys(&row);
            rows.push(row_to_json(&row, &columns));

            // Stream the rest
            loop {
                match stream.next().await {
                    Ok(Some(r)) => rows.push(row_to_json(&r, &columns)),
                    Ok(None) => break,
                    Err(e) => return Err(DatabaseError::QueryError(format!("Stream error: {}", e))),
                }
            }
        }

        // Get result summary with counters
        let stats = match stream.finish().await {
            Ok(summary) => {
                let c = summary.counters();
                json!({
                    "rows": rows.len(),
                    "counters": {
                        "nodesCreated": c.nodes_created(),
                        "nodesDeleted": c.nodes_deleted(),
                        "relationshipsCreated": c.relationships_created(),
                        "relationshipsDeleted": c.relationships_deleted(),
                        "propertiesSet": c.properties_set(),
                        "labelsAdded": c.labels_added(),
                        "labelsRemoved": c.labels_removed(),
                        "containsUpdates": c.contains_updates()
                    }
                })
            }
            Err(_) => json!({"rows": rows.len(), "counters": null})
        };

        let response = json!({
            "success": true,
            "columns": columns,
            "results": rows,
            "stats": stats,
            "query": query_str
        });

        println!("NEO4J_RESULT: {}", serde_json::to_string_pretty(&response).unwrap_or_else(|_| format!("{:?}", response)));

        Ok(response)
    }
}

/// Get dynamic column names from Row
fn row_keys(row: &Row) -> Vec<String> {
    row.keys()
        .map(|ks| ks.as_ref().clone())
        .unwrap_or_default()
}

/// Convert Row to JSON using discovered columns
fn row_to_json(row: &Row, columns: &[String]) -> Map<String, Value> {
    let mut out = Map::new();
    for col in columns {
        match row.get::<NeoVal>(col) {
            Ok(v) => { out.insert(col.clone(), neo_to_json(v)); }
            Err(e) => { out.insert(col.clone(), json!({ "_error": format!("{e}") })); }
        }
    }
    out
}

/// Convert Neo4j Value to JSON
fn neo_to_json(v: NeoVal) -> Value {
    match v {
        NeoVal::Null        => Value::Null,
        NeoVal::Boolean(b)  => json!(b),
        NeoVal::Integer(i)  => json!(i),
        NeoVal::Float(f)    => json!(f),
        NeoVal::String(s)   => json!(s),
        NeoVal::Bytes(b)    => json!({ "_bytes_base64": base64::encode(b) }),
        NeoVal::List(list)  => Value::Array(list.into_iter().map(neo_to_json).collect()),
        NeoVal::Map(map) => {
            let mut m = Map::new();
            for (k, vv) in map { m.insert(k, neo_to_json(vv)); }
            Value::Object(m)
        }
        // Graph values (Node/Relation/Path) - keep generic
        other => json!(format!("{other:?}")),
    }
}