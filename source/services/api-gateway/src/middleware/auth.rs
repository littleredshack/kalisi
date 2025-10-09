use crate::{state::AppState, storage::SessionStorage};
use axum::{
    extract::State,
    http::{HeaderMap, Request, StatusCode},
    middleware::Next,
    response::Response,
    Json,
};
use kalisi_core::types::ApiResponse;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub email: String,
    pub session_id: Uuid,
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut req: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, (StatusCode, Json<ApiResponse<()>>)> {
    // Try to get token from Authorization header first
    let token = headers
        .get("authorization")
        .and_then(|auth| auth.to_str().ok())
        .and_then(|auth| auth.strip_prefix("Bearer "))
        .map(|t| t.to_string())
        .or_else(|| {
            // Fallback to cookie
            headers
                .get("cookie")
                .and_then(|cookie| cookie.to_str().ok())
                .and_then(|cookie_str| {
                    cookie_str.split(';').find_map(|c| {
                        let parts: Vec<&str> = c.trim().splitn(2, '=').collect();
                        if parts.len() == 2 && parts[0] == "token" {
                            Some(parts[1].to_string())
                        } else {
                            None
                        }
                    })
                })
        });

    let token = match token {
        Some(t) => t,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Authentication required")),
            ));
        }
    };

    // Verify JWT token
    let claims = match state.jwt_auth.verify_token(&token) {
        Ok(claims) => claims,
        Err(_) => {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::error("Invalid authentication token")),
            ));
        }
    };

    // Verify session exists
    let mut session_storage = SessionStorage::new(state.redis.clone());
    match session_storage
        .get_session(&claims.session_id.to_string())
        .await
    {
        Ok(Some(session)) if session.user_id == claims.sub => {
            // Session is valid, add user info to request extensions
            let auth_user = AuthUser {
                user_id: claims.sub,
                email: claims.email,
                session_id: claims.session_id,
            };
            req.extensions_mut().insert(auth_user);

            let response = next.run(req).await;
            Ok(response)
        }
        _ => Err((
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Session expired or invalid")),
        )),
    }
}
