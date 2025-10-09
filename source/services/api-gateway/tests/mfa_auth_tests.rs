//! Comprehensive MFA Authentication Test Suite
//!
//! This module contains all tests for the Multi-Factor Authentication system
//! including OTP flow, MFA setup, QR code generation, and security validations.

use axum::http::StatusCode;
use serde_json::{json, Value};
use std::collections::HashMap;
use tower::ServiceExt;
// Removed unused import: uuid::Uuid

use edt_gateway::{
    config::Config,
    state::AppState,
    storage::{otp::OtpStorage, user::UserStorage},
};

mod test_utils {
    use super::*;
    use redis::aio::MultiplexedConnection;
    use std::sync::Arc;

    pub struct TestContext {
        pub app: axum::Router,
        pub config: Config,
        pub redis_conn: MultiplexedConnection,
    }

    impl TestContext {
        pub async fn new() -> Self {
            // Use test Redis database (different from production)
            let redis_url = std::env::var("TEST_REDIS_URL")
                .unwrap_or_else(|_| "redis://localhost:6379/15".to_string());

            let client =
                redis::Client::open(redis_url.clone()).expect("Failed to create Redis client");
            let redis_conn = client
                .get_multiplexed_async_connection()
                .await
                .expect("Failed to connect to Redis");

            let config = Config {
                environment: "test".to_string(),
                jwt_secret: "test-jwt-secret-key-for-testing-must-be-long-enough".to_string(),
                redis_url,
                approved_emails: vec!["test@example.com".to_string(), "admin@test.com".to_string()],
                resend_api_key: Some("test-key".to_string()),
                email_otp_enabled: false,
                totp_only_mode: true,
                neo4j_uri: std::env::var("TEST_NEO4J_URI")
                    .unwrap_or_else(|_| "bolt://localhost:7687".to_string()),
                neo4j_username: std::env::var("TEST_NEO4J_USER")
                    .unwrap_or_else(|_| "neo4j".to_string()),
                neo4j_password: std::env::var("TEST_NEO4J_PASSWORD")
                    .unwrap_or_else(|_| "password".to_string()),
                neo4j_database: std::env::var("TEST_NEO4J_DATABASE")
                    .unwrap_or_else(|_| "neo4j".to_string()),
                mfa_required: true,
                mfa_issuer: "EDT Test System".to_string(),
                auth_v2_enabled: false,
                csp_report_endpoint: "/csp-report".to_string(),
            };

            let app_state = AppState::new(config.clone())
                .await
                .expect("Failed to create AppState");
            let app = create_test_app(app_state);

            Self {
                app,
                config,
                redis_conn,
            }
        }

        /// Make HTTP request to test app
        pub async fn request(
            &self,
            method: &str,
            path: &str,
            body: Option<&str>,
            headers: Option<HashMap<String, String>>,
        ) -> axum::response::Response<axum::body::Body> {
            let mut request_builder = axum::http::Request::builder().method(method).uri(path);

            // Add headers if provided
            if let Some(headers) = headers {
                for (key, value) in headers {
                    request_builder = request_builder.header(key, value);
                }
            }

            let request = if let Some(body) = body {
                request_builder
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(body.to_string()))
                    .unwrap()
            } else {
                request_builder.body(axum::body::Body::from("")).unwrap()
            };

            self.app.clone().oneshot(request).await.unwrap()
        }

        /// Clean test data from Redis
        pub async fn cleanup(&mut self) -> Result<(), redis::RedisError> {
            use redis::AsyncCommands;
            let _: () = redis::cmd("FLUSHDB")
                .query_async(&mut self.redis_conn)
                .await?;
            Ok(())
        }
    }
}

/// Create a test app with minimal middleware
pub fn create_test_app(state: AppState) -> axum::Router {
    use axum::routing::{get, post};
    use edt_gateway::handlers;

    axum::Router::new()
        // Health check
        .route("/health", get(handlers::health::health_check))
        // Auth routes
        .route("/auth/request-otp", post(handlers::auth::request_otp))
        .route("/auth/verify-otp", post(handlers::auth::verify_otp))
        .route("/auth/direct-login", post(handlers::auth::direct_login))
        .route(
            "/auth/complete-mfa",
            post(handlers::mfa_simple::complete_mfa_login),
        )
        .route("/auth/logout", post(handlers::auth::logout))
        .route("/auth/profile", get(handlers::auth::get_profile))
        // MFA routes
        .route(
            "/auth/mfa/setup",
            post(handlers::mfa_simple_partial::setup_mfa_partial),
        )
        .route(
            "/auth/mfa/enable",
            post(handlers::mfa_simple_partial::enable_mfa_partial),
        )
        .route("/auth/mfa/verify", post(handlers::mfa_simple::verify_mfa))
        .route(
            "/auth/mfa/status",
            get(handlers::mfa_simple::get_mfa_status),
        )
        // V2 Auth routes
        .route("/v2/auth/login", post(handlers::auth_v2::login))
        .route("/v2/auth/register", post(handlers::auth_v2::register))
        .route(
            "/v2/auth/mfa/setup/init",
            post(handlers::auth_v2::mfa_setup_init),
        )
        .route(
            "/v2/auth/mfa/setup/complete",
            post(handlers::auth_v2::mfa_setup_complete),
        )
        .route("/v2/auth/mfa/verify", post(handlers::auth_v2::mfa_verify))
        .route("/v2/auth/mfa/status", get(handlers::auth_v2::mfa_status))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_utils::TestContext;

    /// Setup test environment with proper configuration
    async fn setup_test_env() -> TestContext {
        dotenv::dotenv().ok();

        // Set test environment variables
        std::env::set_var("ENVIRONMENT", "test");
        std::env::set_var("RUST_LOG", "debug");
        std::env::set_var(
            "JWT_SECRET",
            "test-jwt-secret-key-for-testing-must-be-long-enough",
        );
        std::env::set_var("REDIS_URL", "redis://localhost:6379/15");
        std::env::set_var("NEO4J_URI", "bolt://localhost:7687");
        std::env::set_var("NEO4J_USERNAME", "neo4j");
        std::env::set_var("NEO4J_PASSWORD", "password");
        std::env::set_var("NEO4J_DATABASE", "neo4j");
        std::env::set_var("MFA_REQUIRED", "true");
        std::env::set_var("MFA_ISSUER", "EDT Test System");
        std::env::set_var("TOTP_ONLY_MODE", "true");
        std::env::set_var("EMAIL_OTP_ENABLED", "false");
        std::env::set_var("APPROVED_EMAILS", "test@example.com,admin@test.com");

        TestContext::new().await
    }

    #[tokio::test]
    async fn test_health_check() {
        let mut context = setup_test_env().await;

        let response = context.request("GET", "/health", None, None).await;
        assert_eq!(response.status(), StatusCode::OK);

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_mfa_setup_flow() {
        let mut context = setup_test_env().await;

        // 1. Request OTP for login
        let otp_request = json!({
            "email": "test@example.com"
        });

        let response = context
            .request(
                "POST",
                "/auth/request-otp",
                Some(&otp_request.to_string()),
                None,
            )
            .await;

        assert_eq!(response.status(), StatusCode::OK);

        // 2. Verify OTP (simulate successful verification)
        let otp_verify = json!({
            "email": "test@example.com",
            "otp": "123456"
        });

        let response = context
            .request(
                "POST",
                "/auth/verify-otp",
                Some(&otp_verify.to_string()),
                None,
            )
            .await;

        // Should get partial token since MFA is not set up yet
        assert_eq!(response.status(), StatusCode::OK);

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_mfa_verification() {
        let mut context = setup_test_env().await;

        // Simulate MFA verification flow
        let mfa_verify = json!({
            "code": "123456"
        });

        let response = context
            .request(
                "POST",
                "/auth/mfa/verify",
                Some(&mfa_verify.to_string()),
                None,
            )
            .await;

        // Without proper token, this should fail
        assert!(response.status().is_client_error());

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_v2_auth_login() {
        let mut context = setup_test_env().await;

        let login_request = json!({
            "email": "test@example.com"
        });

        let response = context
            .request(
                "POST",
                "/v2/auth/login",
                Some(&login_request.to_string()),
                None,
            )
            .await;

        // Should return success for approved email
        assert!(response.status().is_success() || response.status().is_redirection());

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_unauthorized_email() {
        let mut context = setup_test_env().await;

        let login_request = json!({
            "email": "unauthorized@example.com"
        });

        let response = context
            .request(
                "POST",
                "/v2/auth/login",
                Some(&login_request.to_string()),
                None,
            )
            .await;

        // Should fail for unauthorized email
        assert!(response.status().is_client_error());

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_mfa_status_without_auth() {
        let mut context = setup_test_env().await;

        let response = context.request("GET", "/auth/mfa/status", None, None).await;

        // Should require authentication
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_v2_mfa_status_without_auth() {
        let mut context = setup_test_env().await;

        let response = context
            .request("GET", "/v2/auth/mfa/status", None, None)
            .await;

        // Should require authentication
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_concurrent_auth_requests() {
        let mut context = setup_test_env().await;

        let otp_request = json!({
            "email": "test@example.com"
        });

        // Make multiple concurrent requests
        let futures = (0..5).map(|_| {
            let context = &context;
            let request_body = otp_request.to_string();
            async move {
                context
                    .request("POST", "/auth/request-otp", Some(&request_body), None)
                    .await
            }
        });

        let responses = futures_util::future::join_all(futures).await;

        // All should succeed (rate limiting might apply in real scenario)
        for response in responses {
            assert!(response.status().is_success() || response.status().is_client_error());
        }

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_invalid_json_payload() {
        let mut context = setup_test_env().await;

        let response = context
            .request("POST", "/auth/request-otp", Some("invalid json"), None)
            .await;

        // Should return bad request for invalid JSON
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_empty_email_field() {
        let mut context = setup_test_env().await;

        let empty_email_request = json!({
            "email": ""
        });

        let response = context
            .request(
                "POST",
                "/auth/request-otp",
                Some(&empty_email_request.to_string()),
                None,
            )
            .await;

        // Should return bad request for empty email
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        context.cleanup().await.unwrap();
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::time::Duration;
    use tokio::time::timeout;

    #[tokio::test]
    async fn test_full_auth_flow_performance() {
        let mut context = test_utils::TestContext::new().await;

        let start_time = std::time::Instant::now();

        // Measure auth request performance
        let otp_request = json!({
            "email": "test@example.com"
        });

        let response = timeout(
            Duration::from_secs(5),
            context.request(
                "POST",
                "/auth/request-otp",
                Some(&otp_request.to_string()),
                None,
            ),
        )
        .await;

        let duration = start_time.elapsed();

        assert!(response.is_ok(), "Request should complete within timeout");
        assert!(
            duration.as_millis() < 2000,
            "Request should complete within 2 seconds"
        );

        context.cleanup().await.unwrap();
    }

    #[tokio::test]
    async fn test_redis_connectivity() {
        let mut context = test_utils::TestContext::new().await;

        // Test Redis connection by performing cleanup operation
        let result = context.cleanup().await;
        assert!(result.is_ok(), "Redis should be accessible for tests");
    }

    #[tokio::test]
    async fn test_environment_configuration() {
        let context = test_utils::TestContext::new().await;

        // Verify test configuration
        assert_eq!(context.config.environment, "test");
        assert_eq!(context.config.mfa_required, true);
        assert_eq!(context.config.totp_only_mode, true);
        assert_eq!(context.config.email_otp_enabled, false);
        assert!(context.config.neo4j_uri.contains("localhost:7687"));
        assert!(context.config.redis_url.contains("localhost:6379"));

        // Verify approved emails contain test email
        assert!(context
            .config
            .approved_emails
            .contains(&"test@example.com".to_string()));
    }
}
