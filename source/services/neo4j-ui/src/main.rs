use actix_cors::Cors;
use actix_web::{middleware, web, App, HttpResponse, HttpServer};
use neo4rs::{query, Graph};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize)]
struct QueryResult {
    columns: Vec<String>,
    data: Vec<Vec<serde_json::Value>>,
    summary: String,
}

#[derive(Debug, Deserialize)]
struct QueryRequest {
    query: String,
}

struct AppState {
    graph: Arc<Graph>,
}

async fn execute_query(
    data: web::Data<AppState>,
    req: web::Json<QueryRequest>,
) -> Result<HttpResponse, actix_web::Error> {
    let query_str = &req.query;

    // Execute the query
    let mut result = match data.graph.execute(query(query_str)).await {
        Ok(r) => r,
        Err(e) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": format!("Query execution failed: {}", e)
            })))
        }
    };

    let mut columns: Vec<String> = Vec::new();
    let mut data_rows = Vec::new();
    let mut first_row = true;
    let mut row_count = 0;

    // Process results
    while let Ok(Some(row)) = result.next().await {
        row_count += 1;
        let mut row_data = Vec::new();

        // Get column names from first row by checking all possible keys
        if first_row {
            // Try to extract column names dynamically
            // First try common return aliases
            let test_keys = vec![
                "n",
                "m",
                "r",
                "node",
                "rel",
                "relationship",
                "id(n)",
                "labels(n)",
                "n.name",
                "label",
                "type",
                "count",
                "nodeCount",
                "relationshipCount",
                "relationshipType",
            ];

            for key in &test_keys {
                if row.get::<neo4rs::BoltType>(key).is_ok() {
                    columns.push(key.to_string());
                }
            }

            // If no columns found, try numeric indices
            if columns.is_empty() {
                let mut idx = 0;
                while let Ok(_) = row.get::<neo4rs::BoltType>(&idx.to_string()) {
                    columns.push(format!("col_{}", idx));
                    idx += 1;
                }
            }

            // If still no columns, use default
            if columns.is_empty() {
                columns.push("result".to_string());
            }

            first_row = false;
        }

        // Extract values
        for col in &columns {
            // Try to get as BoltType first
            if let Ok(val) = row.get::<neo4rs::BoltType>(col) {
                match val {
                    neo4rs::BoltType::Integer(i) => row_data.push(serde_json::json!(i.value)),
                    neo4rs::BoltType::Float(f) => row_data.push(serde_json::json!(f.value)),
                    neo4rs::BoltType::String(s) => row_data.push(serde_json::json!(s.value)),
                    neo4rs::BoltType::Boolean(b) => row_data.push(serde_json::json!(b.value)),
                    neo4rs::BoltType::List(l) => {
                        let list_values: Vec<_> = l
                            .value
                            .iter()
                            .map(|v| match v {
                                neo4rs::BoltType::String(s) => serde_json::json!(s.value),
                                neo4rs::BoltType::Integer(i) => serde_json::json!(i.value),
                                _ => serde_json::json!("[Complex Item]"),
                            })
                            .collect();
                        row_data.push(serde_json::json!(list_values));
                    }
                    _ => row_data.push(serde_json::json!("[Complex Type]")),
                }
            } else if let Ok(val) = row.get::<i64>(col) {
                row_data.push(serde_json::json!(val));
            } else if let Ok(val) = row.get::<f64>(col) {
                row_data.push(serde_json::json!(val));
            } else if let Ok(val) = row.get::<String>(col) {
                row_data.push(serde_json::json!(val));
            } else if let Ok(val) = row.get::<bool>(col) {
                row_data.push(serde_json::json!(val));
            } else {
                // For complex types, just show type info
                row_data.push(serde_json::json!("[Unknown Type]"));
            }
        }

        // If we still have no data, try to get the first value
        if row_data.is_empty() {
            if let Ok(val) = row.get::<neo4rs::BoltType>("result") {
                match val {
                    neo4rs::BoltType::Integer(i) => row_data.push(serde_json::json!(i.value)),
                    neo4rs::BoltType::Float(f) => row_data.push(serde_json::json!(f.value)),
                    neo4rs::BoltType::String(s) => row_data.push(serde_json::json!(s.value)),
                    neo4rs::BoltType::Boolean(b) => row_data.push(serde_json::json!(b.value)),
                    _ => row_data.push(serde_json::json!("[Complex Type]")),
                }
            } else {
                row_data.push(serde_json::json!("[No Data]"));
            }
        }

        data_rows.push(row_data);
    }

    let summary = format!("Query executed successfully. {} rows returned.", row_count);

    Ok(HttpResponse::Ok().json(QueryResult {
        columns,
        data: data_rows,
        summary,
    }))
}

async fn index() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/html")
        .body(include_str!("../static/index.html"))
}

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "healthy",
        "service": "neo4j-ui"
    }))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    dotenv::dotenv().ok();

    let neo4j_uri =
        std::env::var("NEO4J_URI").unwrap_or_else(|_| "bolt://localhost:7687".to_string());
    let neo4j_user = std::env::var("NEO4J_USER").unwrap_or_else(|_| "neo4j".to_string());
    let neo4j_password = std::env::var("NEO4J_PASSWORD").expect("NEO4J_PASSWORD must be set");

    log::info!("Connecting to Neo4j at {}", neo4j_uri);

    // Create Neo4j connection
    let graph = Arc::new(
        Graph::new(&neo4j_uri, &neo4j_user, &neo4j_password)
            .await
            .expect("Failed to connect to Neo4j"),
    );

    let app_state = web::Data::new(AppState { graph });

    log::info!("Starting Neo4j UI server on port 8081");

    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(middleware::Logger::default())
            .wrap(
                Cors::default()
                    .allow_any_origin()
                    .allow_any_method()
                    .allow_any_header()
                    .max_age(3600),
            )
            .route("/", web::get().to(index))
            .route("/health", web::get().to(health))
            .route("/query", web::post().to(execute_query))
    })
    .bind("0.0.0.0:8081")?
    .run()
    .await
}
