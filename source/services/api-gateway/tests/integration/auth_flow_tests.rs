use actix_web::{http::StatusCode, test, App};
use edt_gateway::{create_app, state::AppState, storage::Storage};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;

async fn setup_test_app() -> test::TestServer {
    let storage = Storage::new_test()
        .await
        .expect("Failed to create test storage");
    let state = AppState {
        storage: Arc::new(RwLock::new(storage)),
        neo4j_client: None,
    };

    test::start(|| App::new().configure(|cfg| create_app(cfg, state.clone())))
}

#[actix_web::test]
async fn test_complete_auth_flow() {
    let server = setup_test_app().await;
    let client = server.client();

    let email = "integration@example.com";

    // Step 1: Request OTP
    let response = client
        .post("/auth/request-otp")
        .send_json(&json!({
            "email": email
        }))
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::OK);

    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    assert!(body["success"].as_bool().unwrap());

    // In real scenario, OTP would be sent via email
    // For testing, we'll directly access the storage to get the OTP
    let otp = {
        let app_state = server.app_data::<AppState>().unwrap();
        let storage = app_state.storage.read().await;

        // Get OTP from database
        let result = sqlx::query!(
            "SELECT code FROM otp_codes WHERE email = $1 AND used = false ORDER BY created_at DESC LIMIT 1",
            email
        )
        .fetch_one(&storage.pool)
        .await
        .expect("Failed to get OTP");

        result.code
    };

    // Step 2: Verify OTP
    let response = client
        .post("/auth/verify-otp")
        .send_json(&json!({
            "email": email,
            "otp": otp
        }))
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::OK);

    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    let token = body["token"].as_str().expect("Token not found");
    assert!(!token.is_empty());

    // Step 3: Access protected endpoint with token
    let response = client
        .get("/api/reflection")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::OK);

    // Step 4: Refresh token
    let response = client
        .post("/auth/refresh")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::OK);

    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    let new_token = body["token"].as_str().expect("New token not found");
    assert_ne!(token, new_token);

    // Step 5: Logout
    let response = client
        .post("/auth/logout")
        .insert_header(("Authorization", format!("Bearer {}", new_token)))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::OK);

    // Step 6: Verify token is invalid after logout
    let response = client
        .get("/api/reflection")
        .insert_header(("Authorization", format!("Bearer {}", new_token)))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[actix_web::test]
async fn test_multiple_otp_attempts() {
    let server = setup_test_app().await;
    let client = server.client();

    let email = "multiple-attempts@example.com";

    // Request OTP
    let response = client
        .post("/auth/request-otp")
        .send_json(&json!({ "email": email }))
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::OK);

    // Try wrong OTP multiple times
    for attempt in 1..=5 {
        let response = client
            .post("/auth/verify-otp")
            .send_json(&json!({
                "email": email,
                "otp": format!("00000{}", attempt)
            }))
            .await
            .expect("Failed to send request");

        if attempt < 5 {
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        } else {
            // After 5 attempts, should be rate limited
            assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        }
    }
}

#[actix_web::test]
async fn test_concurrent_login_sessions() {
    let server = setup_test_app().await;
    let client = server.client();

    let email = "concurrent@example.com";

    // Helper function to complete login
    async fn login(client: &awc::Client, email: &str) -> String {
        // Request OTP
        client
            .post("/auth/request-otp")
            .send_json(&json!({ "email": email }))
            .await
            .expect("Failed to request OTP");

        // Get OTP from test database
        let otp = "123456"; // In test mode, use fixed OTP

        // Verify OTP
        let response = client
            .post("/auth/verify-otp")
            .send_json(&json!({
                "email": email,
                "otp": otp
            }))
            .await
            .expect("Failed to verify OTP");

        let body: serde_json::Value = response.json().await.expect("Failed to parse response");
        body["token"].as_str().unwrap().to_string()
    }

    // Create multiple sessions
    let mut tokens = Vec::new();
    for _ in 0..3 {
        let token = login(&client, email).await;
        tokens.push(token);
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    // All tokens should be valid
    for token in &tokens {
        let response = client
            .get("/api/reflection")
            .insert_header(("Authorization", format!("Bearer {}", token)))
            .send()
            .await
            .expect("Failed to send request");

        assert_eq!(response.status(), StatusCode::OK);
    }

    // Logout from one session
    let response = client
        .post("/auth/logout")
        .insert_header(("Authorization", format!("Bearer {}", tokens[0])))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::OK);

    // First token should be invalid
    let response = client
        .get("/api/reflection")
        .insert_header(("Authorization", format!("Bearer {}", tokens[0])))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    // Other tokens should still be valid
    for token in &tokens[1..] {
        let response = client
            .get("/api/reflection")
            .insert_header(("Authorization", format!("Bearer {}", token)))
            .send()
            .await
            .expect("Failed to send request");

        assert_eq!(response.status(), StatusCode::OK);
    }
}

#[actix_web::test]
async fn test_session_expiry_handling() {
    let server = setup_test_app().await;
    let client = server.client();

    let email = "expiry@example.com";

    // Complete login
    let response = client
        .post("/auth/request-otp")
        .send_json(&json!({ "email": email }))
        .await
        .expect("Failed to send request");
    assert_eq!(response.status(), StatusCode::OK);

    let otp = "123456"; // Test OTP

    let response = client
        .post("/auth/verify-otp")
        .send_json(&json!({
            "email": email,
            "otp": otp
        }))
        .await
        .expect("Failed to send request");

    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    let token = body["token"].as_str().unwrap();

    // Manually expire the session
    {
        let app_state = server.app_data::<AppState>().unwrap();
        let storage = app_state.storage.write().await;

        sqlx::query!(
            "UPDATE sessions SET expires_at = NOW() - INTERVAL '1 day' WHERE token = $1",
            token
        )
        .execute(&storage.pool)
        .await
        .expect("Failed to expire session");
    }

    // Try to use expired token
    let response = client
        .get("/api/reflection")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[actix_web::test]
async fn test_auth_event_logging_integration() {
    let server = setup_test_app().await;
    let client = server.client();

    let email = "events@example.com";

    // Successful login
    client
        .post("/auth/request-otp")
        .send_json(&json!({ "email": email }))
        .await
        .expect("Failed to send request");

    let response = client
        .post("/auth/verify-otp")
        .send_json(&json!({
            "email": email,
            "otp": "123456"
        }))
        .await
        .expect("Failed to send request");

    let body: serde_json::Value = response.json().await.expect("Failed to parse response");
    let token = body["token"].as_str().unwrap();

    // Failed login attempt
    client
        .post("/auth/verify-otp")
        .send_json(&json!({
            "email": email,
            "otp": "wrong-otp"
        }))
        .await
        .expect("Failed to send request");

    // Logout
    client
        .post("/auth/logout")
        .insert_header(("Authorization", format!("Bearer {}", token)))
        .send()
        .await
        .expect("Failed to send request");

    // Check auth events
    {
        let app_state = server.app_data::<AppState>().unwrap();
        let storage = app_state.storage.read().await;

        let events = sqlx::query!(
            "SELECT event_type, success FROM auth_events WHERE user_id IN (SELECT id FROM users WHERE email = $1) ORDER BY created_at",
            email
        )
        .fetch_all(&storage.pool)
        .await
        .expect("Failed to get auth events");

        assert_eq!(events.len(), 3);
        assert_eq!(events[0].event_type, "login");
        assert!(events[0].success);
        assert_eq!(events[1].event_type, "login");
        assert!(!events[1].success);
        assert_eq!(events[2].event_type, "logout");
        assert!(events[2].success);
    }
}
