use std::collections::HashMap;

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tracing::info;

use crate::{runtime::canvas::build_canvas_response, state::AppState};

#[derive(Debug, Deserialize)]
pub struct RuntimeGraphRequest {
    pub query: String,
    #[serde(default)]
    pub parameters: HashMap<String, Value>,
    #[serde(default)]
    pub include_raw_rows: bool,
}

pub async fn fetch_canvas_data(
    State(state): State<AppState>,
    Json(request): Json<RuntimeGraphRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    if request.query.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let query_id = derive_query_id(&request.query, &request.parameters);

    info!(
        target: "kalisi_gateway::handlers::runtime",
        query_id = %query_id,
        "Runtime canvas data request",
    );

    let include_raw =
        request.include_raw_rows || state.config.environment.eq_ignore_ascii_case("development");

    let result = state
        .neo4j
        .execute(&query_id, &request.query, &request.parameters)
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let response = build_canvas_response(
        query_id,
        request.query,
        request.parameters,
        result,
        include_raw,
    );

    Ok(Json(response))
}

fn derive_query_id(cypher: &str, params: &HashMap<String, Value>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(cypher.as_bytes());

    let mut sorted: Vec<_> = params.iter().collect();
    sorted.sort_by(|a, b| a.0.cmp(b.0));

    for (key, value) in sorted {
        hasher.update(key.as_bytes());
        hasher.update(value.to_string().as_bytes());
    }

    format!("{:x}", hasher.finalize())
}
