use axum::{
    Router,
    routing::{get, post},
};
use tower_http::cors::{CorsLayer, Any};
use crate::state::AppState;
use crate::handlers::auth;
use crate::middleware::auth::auth_middleware;
use crate::websocket::websocket_handler;

pub fn create_routes(state: AppState) -> Router {
    // Public routes
    let public_routes = Router::new()
        .route("/auth/request-otp", post(auth::request_otp))
        .route("/auth/verify-otp", post(auth::verify_otp))
        .route("/ws", get(websocket_handler))
        // All other functionality removed - use unified endpoint
        ;
    
    // Protected routes
    let protected_routes = Router::new()
        .route("/auth/logout", post(auth::logout))
        .route("/auth/profile", get(auth::get_profile))
        // Chat removed - pure SPA uses Redis directly
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));
    
    // Combine routes
    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
        )
        .with_state(state)
}