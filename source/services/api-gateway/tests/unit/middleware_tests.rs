use actix_web::dev::ServiceRequest;
use actix_web::{http::StatusCode, middleware::Logger, test, web, App};
use edt_gateway::{
    middleware::{auth::AuthMiddleware, security::SecurityHeaders},
    state::AppState,
    storage::Storage,
};
use std::sync::Arc;
use tokio::sync::RwLock;

async fn setup_test_app() -> (web::Data<AppState>, String) {
    let storage = Storage::new_test()
        .await
        .expect("Failed to create test storage");

    // Create a test user and session
    let token = {
        let mut storage_guard = storage.clone();
        let user_id = storage_guard
            .create_user("test@example.com", "Test User")
            .await
            .expect("Failed to create user");
        storage_guard
            .create_session(user_id, "test-token")
            .await
            .expect("Failed to create session");
        "test-token".to_string()
    };

    let state = web::Data::new(AppState {
        storage: Arc::new(RwLock::new(storage)),
        neo4j_client: None,
    });

    (state, token)
}

#[actix_web::test]
async fn test_auth_middleware_valid_token() {
    let (state, token) = setup_test_app().await;

    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .wrap(AuthMiddleware)
            .service(
                web::resource("/protected").route(web::get().to(|| async { "Protected content" })),
            ),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/protected")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);
}

#[actix_web::test]
async fn test_auth_middleware_missing_token() {
    let (state, _) = setup_test_app().await;

    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .wrap(AuthMiddleware)
            .service(
                web::resource("/protected").route(web::get().to(|| async { "Protected content" })),
            ),
    )
    .await;

    let req = test::TestRequest::get().uri("/protected").to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[actix_web::test]
async fn test_auth_middleware_invalid_token() {
    let (state, _) = setup_test_app().await;

    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .wrap(AuthMiddleware)
            .service(
                web::resource("/protected").route(web::get().to(|| async { "Protected content" })),
            ),
    )
    .await;

    let req = test::TestRequest::get()
        .uri("/protected")
        .insert_header(("Authorization", "Bearer invalid-token"))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
}

#[actix_web::test]
async fn test_security_headers_middleware() {
    let app = test::init_service(
        App::new()
            .wrap(SecurityHeaders)
            .service(web::resource("/test").route(web::get().to(|| async { "Test response" }))),
    )
    .await;

    let req = test::TestRequest::get().uri("/test").to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    // Check security headers
    let headers = resp.headers();
    assert_eq!(headers.get("X-Content-Type-Options").unwrap(), "nosniff");
    assert_eq!(headers.get("X-Frame-Options").unwrap(), "DENY");
    assert_eq!(headers.get("X-XSS-Protection").unwrap(), "1; mode=block");
    assert!(headers.get("Content-Security-Policy").is_some());
    assert!(headers.get("Strict-Transport-Security").is_some());
}

#[actix_web::test]
async fn test_cors_configuration() {
    let (state, _) = setup_test_app().await;

    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .wrap(
                actix_cors::Cors::default()
                    .allowed_origin("http://localhost:3000")
                    .allowed_methods(vec!["GET", "POST"])
                    .allowed_headers(vec!["Authorization", "Content-Type"])
                    .max_age(3600),
            )
            .service(web::resource("/api/test").route(web::get().to(|| async { "CORS test" }))),
    )
    .await;

    // Preflight request
    let req = test::TestRequest::options()
        .uri("/api/test")
        .insert_header(("Origin", "http://localhost:3000"))
        .insert_header(("Access-Control-Request-Method", "GET"))
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let headers = resp.headers();
    assert_eq!(
        headers.get("Access-Control-Allow-Origin").unwrap(),
        "http://localhost:3000"
    );
}

#[actix_web::test]
async fn test_rate_limiting_middleware() {
    use edt_gateway::middleware::rate_limit::RateLimiter;

    let limiter = RateLimiter::new(2, std::time::Duration::from_secs(60));

    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(limiter))
            .wrap_fn(|req, srv| {
                use actix_web::dev::Service;
                use std::future::Future;
                use std::pin::Pin;

                let limiter = req.app_data::<web::Data<RateLimiter>>().cloned();
                let fut = srv.call(req);

                async move {
                    if let Some(limiter) = limiter {
                        let ip = "127.0.0.1";
                        if !limiter.check_rate_limit(ip).await {
                            return Err(actix_web::error::ErrorTooManyRequests(
                                "Rate limit exceeded",
                            ));
                        }
                    }
                    fut.await
                }
            })
            .service(
                web::resource("/limited")
                    .route(web::get().to(|| async { "Rate limited endpoint" })),
            ),
    )
    .await;

    // First two requests should succeed
    for _ in 0..2 {
        let req = test::TestRequest::get().uri("/limited").to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);
    }

    // Third request should be rate limited
    let req = test::TestRequest::get().uri("/limited").to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[cfg(test)]
mod request_id_tests {
    use super::*;
    use edt_gateway::middleware::request_id::RequestId;

    #[actix_web::test]
    async fn test_request_id_generation() {
        let app = test::init_service(App::new().wrap(RequestId).service(
            web::resource("/test").route(web::get().to(|req: actix_web::HttpRequest| async move {
                let extensions = req.extensions();
                let request_id = extensions.get::<String>().expect("Request ID not found");
                format!("Request ID: {}", request_id)
            })),
        ))
        .await;

        let req = test::TestRequest::get().uri("/test").to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        // Check that response includes request ID header
        assert!(resp.headers().get("X-Request-ID").is_some());
    }

    #[actix_web::test]
    async fn test_request_id_propagation() {
        let app = test::init_service(
            App::new()
                .wrap(RequestId)
                .service(web::resource("/test").route(web::get().to(|| async { "Test" }))),
        )
        .await;

        // Send request with existing request ID
        let existing_id = "test-request-id-12345";
        let req = test::TestRequest::get()
            .uri("/test")
            .insert_header(("X-Request-ID", existing_id))
            .to_request();

        let resp = test::call_service(&app, req).await;
        assert_eq!(resp.status(), StatusCode::OK);

        // Check that the same request ID is returned
        assert_eq!(resp.headers().get("X-Request-ID").unwrap(), existing_id);
    }
}
