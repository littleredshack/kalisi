//! Shared test utilities and helpers for all test suites

use axum::{http::StatusCode, Router};
use serde_json::{json, Value};
use std::collections::HashMap;
use tower::ServiceExt;
use redis::aio::MultiplexedConnection;

use edt_gateway::{state::AppState, config::Config};

pub struct TestContext {
    pub app: Router,
    pub config: Config,
    pub redis_conn: MultiplexedConnection,
}

impl TestContext {
    pub async fn new() -> Self {
        // Use test Redis database (different from production)
        let redis_url = std::env::var("TEST_REDIS_URL")
            .unwrap_or_else(|_| "redis://localhost:6379/15".to_string());
        
        let client = redis::Client::open(redis_url.clone()).expect("Failed to create Redis client");
        let redis_conn = client.get_multiplexed_async_connection()
            .await
            .expect("Failed to connect to Redis");
        
        let config = Config {
            environment: "test".to_string(),
            jwt_secret: "test-jwt-secret-key-for-testing-must-be-long-enough".to_string(),
            redis_url,
            approved_emails: vec![
                "test@example.com".to_string(), 
                "admin@test.com".to_string(),
                "user1@example.com".to_string(),
                "user2@example.com".to_string(),
            ],
            resend_api_key: Some("test-key".to_string()),
            email_otp_enabled: false,
            totp_only_mode: true,
            neo4j_uri: std::env::var("TEST_NEO4J_URI").unwrap_or_else(|_| "bolt://localhost:7687".to_string()),
            neo4j_username: std::env::var("TEST_NEO4J_USER").unwrap_or_else(|_| "neo4j".to_string()),
            neo4j_password: std::env::var("TEST_NEO4J_PASSWORD").unwrap_or_else(|_| "password".to_string()),
            neo4j_database: std::env::var("TEST_NEO4J_DATABASE").unwrap_or_else(|_| "neo4j".to_string()),
            mfa_required: true,
            mfa_issuer: "EDT Test System".to_string(),
            auth_v2_enabled: false,
            csp_report_endpoint: "/csp-report".to_string(),
        };
        
        let app_state = AppState::new(config.clone()).await.expect("Failed to create AppState");
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
        let mut request_builder = axum::http::Request::builder()
            .method(method)
            .uri(path);
        
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
    
    /// Extract JWT token from response headers
    pub fn extract_token(response: &axum::response::Response<axum::body::Body>) -> Option<String> {
        response
            .headers()
            .get("authorization")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.replace("Bearer ", ""))
    }
    
    /// Create authorization header with JWT token
    pub fn auth_header(token: &str) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("authorization".to_string(), format!("Bearer {}", token));
        headers
    }
    
    /// Generate test OTP code
    pub fn generate_test_otp() -> String {
        "123456".to_string()
    }
    
    /// Clean test data from Redis
    pub async fn cleanup(&mut self) -> Result<(), redis::RedisError> {
        use redis::AsyncCommands;
        let _: () = redis::cmd("FLUSHDB").query_async(&mut self.redis_conn).await?;
        Ok(())
    }
}

/// Create a test app with minimal middleware
pub fn create_test_app(state: AppState) -> Router {
    use axum::routing::{get, post};
    use edt_gateway::{handlers, middleware};
    
    Router::new()
        // Health check
        .route("/health", get(handlers::health::health_check))
        
        // Auth routes
        .route("/auth/request-otp", post(handlers::auth::request_otp))
        .route("/auth/verify-otp", post(handlers::auth::verify_otp))
        .route("/auth/direct-login", post(handlers::auth::direct_login))
        .route("/auth/complete-mfa", post(handlers::mfa_simple::complete_mfa_login))
        .route("/auth/logout", post(handlers::auth::logout))
        .route("/auth/profile", get(handlers::auth::get_profile))
        
        // MFA routes
        .route("/auth/mfa/setup", post(handlers::mfa_simple_partial::setup_mfa_partial))
        .route("/auth/mfa/enable", post(handlers::mfa_simple_partial::enable_mfa_partial))
        .route("/auth/mfa/verify", post(handlers::mfa_simple::verify_mfa))
        .route("/auth/mfa/status", get(handlers::mfa_simple::get_mfa_status))
        
        // V2 Auth routes
        .route("/v2/auth/login", post(handlers::auth_v2::login))
        .route("/v2/auth/register", post(handlers::auth_v2::register))
        .route("/v2/auth/mfa/setup/init", post(handlers::auth_v2::mfa_setup_init))
        .route("/v2/auth/mfa/setup/complete", post(handlers::auth_v2::mfa_setup_complete))
        .route("/v2/auth/mfa/verify", post(handlers::auth_v2::mfa_verify))
        .route("/v2/auth/mfa/status", get(handlers::auth_v2::mfa_status))
        
        // Dashboard routes
        .route("/dashboard/main", get(handlers::dashboard::get_dashboard))
        .route("/api/dashboard/stats", get(handlers::dashboard::get_stats))
        .route("/api/dashboard/activity", get(handlers::dashboard::get_activity))
        .route("/api/dashboard/health", get(handlers::dashboard::get_health))
        
        // Security routes
        .route("/api/security/dashboard", get(handlers::security::get_security_dashboard))
        .route("/api/security/events", get(handlers::security::get_security_events))
        
        .with_state(state)
}

/// Test data factories
pub mod factories {
    use super::*;
    
    pub fn test_user_payload() -> Value {
        json!({
            "email": "test@example.com",
            "name": "Test User"
        })
    }
    
    pub fn test_otp_request() -> Value {
        json!({
            "email": "test@example.com"
        })
    }
    
    pub fn test_otp_verify(otp: &str) -> Value {
        json!({
            "email": "test@example.com",
            "otp": otp
        })
    }
    
    pub fn test_mfa_setup() -> Value {
        json!({
            "secret": "JBSWY3DPEHPK3PXP",
            "code": "123456"
        })
    }
}

/// JWT token utilities for testing
pub mod jwt_utils {
    use super::*;
    use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
    use serde::{Serialize, Deserialize};
    use std::time::{SystemTime, UNIX_EPOCH};
    
    #[derive(Debug, Serialize, Deserialize)]
    pub struct Claims {
        pub sub: String, // user email
        pub exp: usize,  // expiration time
        pub iat: usize,  // issued at
        pub email: String,
        pub mfa_verified: Option<bool>,
    }
    
    pub fn create_test_token(email: &str, secret: &str, mfa_verified: bool) -> Result<String, Box<dyn std::error::Error>> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as usize;
        let exp = now + 3600; // 1 hour
        
        let claims = Claims {
            sub: email.to_string(),
            exp,
            iat: now,
            email: email.to_string(),
            mfa_verified: Some(mfa_verified),
        };
        
        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_ref()),
        )?;
        
        Ok(token)
    }
    
    pub fn decode_test_token(token: &str, secret: &str) -> Result<Claims, Box<dyn std::error::Error>> {
        use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() != 3 {
            return Err("Invalid token format".into());
        }
        
        let payload = parts[1];
        let decoded = URL_SAFE_NO_PAD.decode(payload)?;
        let payload_str = String::from_utf8(decoded)?;
        let claims: Claims = serde_json::from_str(&payload_str)?;
        
        Ok(claims)
    }
}

/// Load testing utilities
pub struct LoadTester {
    pub concurrency: usize,
    pub requests_per_worker: usize,
}

impl LoadTester {
    pub fn new(concurrency: usize, requests_per_worker: usize) -> Self {
        Self {
            concurrency,
            requests_per_worker,
        }
    }
    
    pub async fn run_concurrent<F, Fut, R>(&self, count: usize, operation: F) -> Vec<R>
    where
        F: Fn(usize) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = R> + Send + 'static,
        R: Send + 'static,
    {
        let mut handles = Vec::new();
        
        for i in 0..count {
            let op = operation(i);
            handles.push(tokio::spawn(op));
        }
        
        let mut results = Vec::new();
        for handle in handles {
            results.push(handle.await.unwrap());
        }
        
        results
    }
}

/// Performance test utilities
pub mod perf {
    use std::time::{Duration, Instant};
    
    pub struct PerfMetrics {
        pub duration: Duration,
        pub requests_per_second: f64,
        pub avg_response_time: Duration,
        pub min_response_time: Duration,
        pub max_response_time: Duration,
    }
    
    pub fn measure_performance<F, Fut>(
        operation: F,
        iterations: usize,
    ) -> impl std::future::Future<Output = PerfMetrics>
    where
        F: Fn() -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = ()> + Send + 'static,
    {
        async move {
            let start_time = Instant::now();
            let mut response_times = Vec::new();
            
            for _ in 0..iterations {
                let req_start = Instant::now();
                operation().await;
                let req_duration = req_start.elapsed();
                response_times.push(req_duration);
            }
            
            let total_duration = start_time.elapsed();
            let avg_response_time = response_times.iter().sum::<Duration>() / iterations as u32;
            let min_response_time = *response_times.iter().min().unwrap();
            let max_response_time = *response_times.iter().max().unwrap();
            let requests_per_second = iterations as f64 / total_duration.as_secs_f64();
            
            PerfMetrics {
                duration: total_duration,
                requests_per_second,
                avg_response_time,
                min_response_time,
                max_response_time,
            }
        }
    }
}

/// Environment variable utilities for tests
pub mod test_env {
    use std::env;
    
    pub fn setup_test_env() {
        env::set_var("ENVIRONMENT", "test");
        env::set_var("RUST_LOG", "debug");
        env::set_var("JWT_SECRET", "test-jwt-secret-key-for-testing-must-be-long-enough");
        env::set_var("REDIS_URL", "redis://localhost:6379/15");
        env::set_var("NEO4J_URI", "bolt://localhost:7687");
        env::set_var("NEO4J_USERNAME", "neo4j");
        env::set_var("NEO4J_PASSWORD", "password");
        env::set_var("NEO4J_DATABASE", "neo4j");
        env::set_var("MFA_REQUIRED", "true");
        env::set_var("MFA_ISSUER", "EDT Test System");
        env::set_var("TOTP_ONLY_MODE", "true");
        env::set_var("EMAIL_OTP_ENABLED", "false");
        env::set_var("APPROVED_EMAILS", "test@example.com,admin@test.com");
    }
    
    pub fn cleanup_test_env() {
        env::remove_var("ENVIRONMENT");
        env::remove_var("RUST_LOG");
        env::remove_var("JWT_SECRET");
        env::remove_var("REDIS_URL");
        env::remove_var("NEO4J_URI");
        env::remove_var("NEO4J_USERNAME");
        env::remove_var("NEO4J_PASSWORD");
        env::remove_var("NEO4J_DATABASE");
        env::remove_var("MFA_REQUIRED");
        env::remove_var("MFA_ISSUER");
        env::remove_var("TOTP_ONLY_MODE");
        env::remove_var("EMAIL_OTP_ENABLED");
        env::remove_var("APPROVED_EMAILS");
    }
}