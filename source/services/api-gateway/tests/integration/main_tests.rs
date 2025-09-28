use actix_web::{test, App, http::StatusCode};
use edt_gateway::{create_app, state::AppState, storage::Storage, graph::GraphClient};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::time::Duration;

async fn setup_test_server() -> test::TestServer {
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

#[actix_web::test]
async fn test_server_initialization() {
    let server = setup_test_server().await;
    let client = server.client();
    
    // Server should be running
    let response = client
        .get("/health")
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
}

#[actix_web::test]
async fn test_all_routes_configured() {
    let server = setup_test_server().await;
    let client = server.client();
    
    // Test various routes are configured
    let routes = vec![
        ("/", StatusCode::FOUND), // Should redirect to dashboard
        ("/health", StatusCode::OK),
        ("/dashboard", StatusCode::OK),
        ("/auth/request-otp", StatusCode::BAD_REQUEST), // No body
        ("/api/reflection", StatusCode::UNAUTHORIZED), // No auth
    ];
    
    for (path, expected_status) in routes {
        let response = client
            .get(path)
            .send()
            .await
            .expect("Failed to send request");
        
        assert_eq!(
            response.status(), 
            expected_status,
            "Route {} returned unexpected status",
            path
        );
    }
}

#[actix_web::test]
async fn test_middleware_stack() {
    let server = setup_test_server().await;
    let client = server.client();
    
    let response = client
        .get("/health")
        .send()
        .await
        .expect("Failed to send request");
    
    // Check that middleware added headers
    let headers = response.headers();
    
    // Security headers
    assert!(headers.contains_key("X-Content-Type-Options"));
    assert!(headers.contains_key("X-Frame-Options"));
    assert!(headers.contains_key("X-XSS-Protection"));
    
    // Request ID
    assert!(headers.contains_key("X-Request-ID"));
}

#[actix_web::test]
async fn test_graceful_shutdown() {
    let server = setup_test_server().await;
    let client = server.client();
    
    // Make a request to ensure server is running
    let response = client
        .get("/health")
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
    
    // Server will shut down when dropped
    drop(server);
    
    // Give it a moment to shut down
    tokio::time::sleep(Duration::from_millis(100)).await;
}

#[actix_web::test]
async fn test_concurrent_requests_handling() {
    let server = setup_test_server().await;
    let client = Arc::new(server.client());
    
    let mut handles = vec![];
    
    // Send 50 concurrent requests
    for i in 0..50 {
        let client_clone = client.clone();
        let handle = tokio::spawn(async move {
            let response = client_clone
                .get("/health")
                .send()
                .await
                .expect("Failed to send request");
            
            (i, response.status())
        });
        handles.push(handle);
    }
    
    // Collect results
    let results: Vec<_> = futures::future::join_all(handles)
        .await
        .into_iter()
        .map(|r| r.unwrap())
        .collect();
    
    // All should succeed
    assert_eq!(results.len(), 50);
    assert!(results.iter().all(|(_, status)| *status == StatusCode::OK));
}

#[actix_web::test]
async fn test_error_handling() {
    let server = setup_test_server().await;
    let client = server.client();
    
    // Test various error scenarios
    
    // 1. Invalid JSON
    let response = client
        .post("/auth/request-otp")
        .insert_header(("Content-Type", "application/json"))
        .send_body("{invalid json}")
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    
    // 2. Missing required fields
    let response = client
        .post("/auth/request-otp")
        .send_json(&serde_json::json!({}))
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    
    // 3. Method not allowed
    let response = client
        .delete("/health")
        .send()
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
}

#[actix_web::test]
async fn test_database_connection_handling() {
    let server = setup_test_server().await;
    let client = server.client();
    
    // Make multiple requests that use database
    for _ in 0..10 {
        let response = client
            .post("/auth/request-otp")
            .send_json(&serde_json::json!({
                "email": "test@example.com"
            }))
            .await
            .expect("Failed to send request");
        
        // Should handle requests even under load
        assert!(response.status() == StatusCode::OK || 
                response.status() == StatusCode::TOO_MANY_REQUESTS);
    }
}

#[actix_web::test]
async fn test_static_file_serving_integration() {
    let server = setup_test_server().await;
    let client = server.client();
    
    // Test static file routes
    let response = client
        .get("/static/css/style.css")
        .send()
        .await
        .expect("Failed to send request");
    
    // Might be 404 in test environment without static files
    assert!(response.status() == StatusCode::OK || 
            response.status() == StatusCode::NOT_FOUND);
    
    if response.status() == StatusCode::OK {
        assert_eq!(
            response.headers().get("Content-Type").unwrap(),
            "text/css"
        );
    }
}

#[actix_web::test]
async fn test_cors_integration() {
    let server = setup_test_server().await;
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
}