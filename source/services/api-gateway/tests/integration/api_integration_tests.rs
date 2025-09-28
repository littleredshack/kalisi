use actix_web::{test, App, http::StatusCode};
use serde_json::json;
use edt_gateway::{create_app, state::AppState, storage::Storage, graph::GraphClient};
use std::sync::Arc;
use tokio::sync::RwLock;

async fn setup_full_test_app() -> test::TestServer {
    let storage = Storage::new_test().await.expect("Failed to create test storage");
    let neo4j_client = GraphClient::new_test().await.ok();
    
    let state = AppState {
        storage: Arc::new(RwLock::new(storage)),
        neo4j_client,
    };
    
    test::start(|| {
        App::new()
            .configure(|cfg| create_app(cfg, state.clone()))
    })
}

async fn get_auth_token(client: &awc::Client, email: &str) -> String {
    // Request OTP
    client
        .post("/auth/request-otp")
        .send_json(&json!({ "email": email }))
        .await
        .expect("Failed to request OTP");
    
    // Verify OTP (using test OTP)
    let response = client
        .post("/auth/verify-otp")
        .send_json(&json!({
            "email": email,
            "otp": "123456"
        }))
        .await
        .expect("Failed to verify OTP");
    
    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    body["token"].as_str().unwrap().to_string()
}

#[actix_web::test]
async fn test_health_check_endpoint() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    let response = client
        .get("/health")
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert_eq!(body["status"], "ok");
    assert!(body["timestamp"].is_string());
    assert!(body["version"].is_string());
}

#[actix_web::test]
async fn test_dashboard_redirect() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    let response = client
        .get("/")
        .send()
        .await
        .expect("Failed to send request");
    
    // Should redirect to dashboard
    assert_eq!(response.status(), StatusCode::FOUND);
    assert_eq!(
        response.headers().get("Location").unwrap(),
        "/dashboard"
    );
}

#[actix_web::test]
async fn test_static_file_serving() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    // Test CSS file
    let response = client
        .get("/static/css/style.css")
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("Content-Type").unwrap(),
        "text/css"
    );
    
    // Test JS file
    let response = client
        .get("/static/js/dashboard.js")
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("Content-Type").unwrap(),
        "application/javascript"
    );
}

#[actix_web::test]
async fn test_api_error_handling() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    // Test 404 error
    let response = client
        .get("/api/nonexistent")
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    
    // Test malformed JSON
    let response = client
        .post("/auth/request-otp")
        .insert_header(("Content-Type", "application/json"))
        .send_body("{invalid json}")
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[actix_web::test]
async fn test_cors_headers() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    // Preflight request
    let response = client
        .request(actix_web::http::Method::OPTIONS, "/api/reflection")
        .insert_header(("Origin", "http://localhost:3000"))
        .insert_header(("Access-Control-Request-Method", "GET"))
        .insert_header(("Access-Control-Request-Headers", "Authorization"))
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let headers = response.headers();
    assert!(headers.contains_key("Access-Control-Allow-Origin"));
    assert!(headers.contains_key("Access-Control-Allow-Methods"));
    assert!(headers.contains_key("Access-Control-Allow-Headers"));
}

#[actix_web::test]
async fn test_security_headers_present() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    let response = client
        .get("/health")
        .send()
        .await
        .expect("Failed to send request");
    
    let headers = response.headers();
    assert_eq!(headers.get("X-Content-Type-Options").unwrap(), "nosniff");
    assert_eq!(headers.get("X-Frame-Options").unwrap(), "DENY");
    assert_eq!(headers.get("X-XSS-Protection").unwrap(), "1; mode=block");
    assert!(headers.contains_key("Content-Security-Policy"));
    assert!(headers.contains_key("Strict-Transport-Security"));
}

#[actix_web::test]
async fn test_request_id_propagation() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    let custom_request_id = "test-request-12345";
    
    let response = client
        .get("/health")
        .insert_header(("X-Request-ID", custom_request_id))
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(
        response.headers().get("X-Request-ID").unwrap(),
        custom_request_id
    );
}

#[actix_web::test]
async fn test_self_awareness_endpoints_integration() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    let token = get_auth_token(&client, "self-aware@example.com").await;
    
    // Test reflection endpoint
    let response = client
        .get("/api/reflection")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(body["current_state"].is_object());
    assert!(body["capabilities"].is_array());
    assert!(body["system_health"].is_object());
    
    // Test analyze endpoint
    let response = client
        .post("/api/analyze")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .send_json(&json!({
            "content": "How can you help me?",
            "context": {}
        }))
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(body["intent"].is_string());
    assert!(body["confidence"].is_number());
    
    // Test learning endpoint
    let response = client
        .post("/api/learn")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .send_json(&json!({
            "interaction_id": "test-123",
            "outcome": "success",
            "feedback": {
                "rating": 5,
                "helpful": true
            },
            "patterns": ["test_pattern"]
        }))
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
}

#[actix_web::test]
async fn test_rate_limiting_integration() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    let email = "ratelimit@example.com";
    
    // Make requests rapidly
    let mut responses = Vec::new();
    for _ in 0..10 {
        let response = client
            .post("/auth/request-otp")
            .send_json(&json!({ "email": email }))
            .await
            .expect("Failed to send request");
        
        responses.push(response.status());
    }
    
    // Check that rate limiting kicked in
    let rate_limited_count = responses.iter()
        .filter(|&&status| status == StatusCode::TOO_MANY_REQUESTS)
        .count();
    
    assert!(rate_limited_count > 0, "Rate limiting should have triggered");
}

#[actix_web::test]
async fn test_graceful_database_error_handling() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    // Try to create a user with invalid data that would violate constraints
    let response = client
        .post("/auth/request-otp")
        .send_json(&json!({
            "email": "" // Empty email
        }))
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    
    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(body["error"].is_string());
}

#[actix_web::test]
async fn test_concurrent_api_requests() {
    let server = setup_full_test_app().await;
    let client = Arc::new(server.client());
    
    let mut tasks = Vec::new();
    
    // Spawn multiple concurrent requests
    for i in 0..20 {
        let client_clone = client.clone();
        let task = tokio::spawn(async move {
            let response = client_clone
                .get("/health")
                .send()
                .await
                .expect("Failed to send request");
            
            (i, response.status())
        });
        tasks.push(task);
    }
    
    // Wait for all requests
    let results: Vec<_> = futures::future::join_all(tasks)
        .await
        .into_iter()
        .map(|r| r.unwrap())
        .collect();
    
    // All should succeed
    assert!(results.iter().all(|(_, status)| *status == StatusCode::OK));
    assert_eq!(results.len(), 20);
}

#[actix_web::test]
async fn test_api_versioning() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    let token = get_auth_token(&client, "version@example.com").await;
    
    // Current API endpoints should work
    let response = client
        .get("/api/reflection")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
    
    // Future: test versioned endpoints like /api/v2/reflection
    // This is a placeholder for when API versioning is implemented
}

#[actix_web::test]
async fn test_metrics_endpoint() {
    let server = setup_full_test_app().await;
    let client = server.client();
    
    // If metrics endpoint exists
    let response = client
        .get("/metrics")
        .send()
        .await
        .expect("Failed to send request");
    
    // Metrics might be protected or not implemented yet
    assert!(
        response.status() == StatusCode::OK || 
        response.status() == StatusCode::NOT_FOUND ||
        response.status() == StatusCode::UNAUTHORIZED
    );
}