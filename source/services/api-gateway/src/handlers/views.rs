use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use uuid::Uuid;

use crate::{middleware::auth::AuthUser, state::AppState};

// Views functionality disabled - all endpoints return disabled message
pub async fn list_views(
    State(_state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
) -> Result<impl IntoResponse, StatusCode> {
    Ok(Json(serde_json::json!({
        "success": false,
        "message": "Views functionality disabled - using unified /v0/cypher/unified endpoint",
        "data": null
    })))
}

pub async fn create_view(
    State(_state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Json(_request): Json<serde_json::Value>,
) -> Result<impl IntoResponse, StatusCode> {
    Ok(Json(serde_json::json!({
        "success": false,
        "message": "Views functionality disabled - using unified /v0/cypher/unified endpoint",
        "data": null
    })))
}

pub async fn get_view(
    State(_state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Path(_id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    Ok(Json(serde_json::json!({
        "success": false,
        "message": "Views functionality disabled - using unified /v0/cypher/unified endpoint",
        "data": null
    })))
}

pub async fn update_view(
    State(_state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Path(_id): Path<Uuid>,
    Json(_request): Json<serde_json::Value>,
) -> Result<impl IntoResponse, StatusCode> {
    Ok(Json(serde_json::json!({
        "success": false,
        "message": "Views functionality disabled - using unified /v0/cypher/unified endpoint",
        "data": null
    })))
}

pub async fn delete_view(
    State(_state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Path(_id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    Ok(Json(serde_json::json!({
        "success": false,
        "message": "Views functionality disabled - using unified /v0/cypher/unified endpoint",
        "data": null
    })))
}

pub async fn get_view_data(
    State(_state): State<AppState>,
    Extension(_user): Extension<AuthUser>,
    Path(_id): Path<Uuid>,
) -> Result<impl IntoResponse, StatusCode> {
    Ok(Json(serde_json::json!({
        "success": false,
        "message": "Views functionality disabled - using unified /v0/cypher/unified endpoint",
        "data": null
    })))
}
