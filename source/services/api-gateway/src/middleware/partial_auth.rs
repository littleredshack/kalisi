use crate::state::AppState;
use axum::{
    extract::State,
    http::{HeaderMap, Request, StatusCode},
    middleware::Next,
    response::Response,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct PartialAuthUser {
    pub user_id: Uuid,
    pub email: String,
    pub stage: String,
}

#[derive(Debug, Deserialize)]
struct PartialSessionData {
    user_id: String,
    email: String,
    stage: String,
    expires_at: i64,
}

/// Middleware that allows authentication with partial tokens for MFA setup flow
pub async fn partial_auth_middleware(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    // Try to get partial token from Authorization header or custom header
    let partial_token = headers
        .get("x-partial-token")
        .and_then(|auth| auth.to_str().ok())
        .map(|t| t.to_string())
        .or_else(|| {
            // Also check Authorization header with "Partial" prefix
            headers
                .get("authorization")
                .and_then(|auth| auth.to_str().ok())
                .and_then(|auth| auth.strip_prefix("Partial "))
                .map(|t| t.to_string())
        });

    let partial_token = match partial_token {
        Some(t) => t,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "error": "Partial authentication token required"
                })),
            ));
        }
    };

    // Verify partial token from Redis
    let partial_key = format!("partial_session:{}", partial_token);
    let mut redis = state.redis.clone();

    let partial_data: Option<String> = match redis::cmd("GET")
        .arg(&partial_key)
        .query_async(&mut redis)
        .await
    {
        Ok(data) => data,
        Err(_) => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "error": "Invalid partial token"
                })),
            ));
        }
    };

    let session_data: PartialSessionData = match partial_data {
        Some(data) => match serde_json::from_str(&data) {
            Ok(info) => info,
            Err(_) => {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({
                        "error": "Invalid session data"
                    })),
                ));
            }
        },
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "error": "Partial session expired or not found"
                })),
            ));
        }
    };

    // Check if session is expired
    let now = chrono::Utc::now().timestamp();
    if session_data.expires_at < now {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "error": "Partial session expired"
            })),
        ));
    }

    // Parse user ID
    let user_id = match Uuid::parse_str(&session_data.user_id) {
        Ok(id) => id,
        Err(_) => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "error": "Invalid user ID in session"
                })),
            ));
        }
    };

    // Add partial auth user info to request extensions
    let partial_auth_user = PartialAuthUser {
        user_id,
        email: session_data.email,
        stage: session_data.stage,
    };
    req.extensions_mut().insert(partial_auth_user);

    let response = next.run(req).await;
    Ok(response)
}
