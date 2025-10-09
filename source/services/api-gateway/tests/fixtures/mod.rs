use edt_gateway::graph::GraphDb;
use serde_json::json;

pub struct TestFixtures;

impl TestFixtures {
    // NOTE: Disabled until Storage interface is updated to Redis
    /*
    /// Create test users with predefined data
    pub async fn create_test_users(storage: &mut Storage) -> Vec<i64> {
        let users = vec![
            ("alice@example.com", "Alice Smith"),
            ("bob@example.com", "Bob Johnson"),
            ("charlie@example.com", "Charlie Brown"),
            ("dave@example.com", "Dave Wilson"),
        ];

        let mut user_ids = Vec::new();
        for (email, name) in users {
            let user_id = storage.create_user(email, name)
                .await
                .expect("Failed to create test user");
            user_ids.push(user_id);
        }

        user_ids
    }

    /// Create test sessions for users
    pub async fn create_test_sessions(storage: &mut Storage, user_ids: &[i64]) -> Vec<String> {
        let mut tokens = Vec::new();

        for (i, user_id) in user_ids.iter().enumerate() {
            let token = format!("test-token-{}", i);
            storage.create_session(*user_id, &token)
                .await
                .expect("Failed to create test session");
            tokens.push(token);
        }

        tokens
    }

    /// Create test OTP codes
    pub async fn create_test_otps(storage: &mut Storage, emails: &[&str]) {
        for (i, email) in emails.iter().enumerate() {
            let otp = format!("{:06}", 100000 + i);
            storage.store_otp(email, &otp)
                .await
                .expect("Failed to store test OTP");
        }
    }

    */

    // NOTE: Disabled until GraphDb methods are implemented
    /*
    /// Create test graph data
    pub async fn create_test_graph_data(graph: &GraphDb) {
        // Create self node
        let self_node = graph.create_node(
            "Self",
            json!({
                "name": "EDT System",
                "version": "test",
                "environment": "test"
            })
        )
        .await
        .expect("Failed to create self node");

        // Create capability nodes
        let capabilities = vec![
            ("Authentication", "User authentication and session management"),
            ("Self-Awareness", "System introspection and learning"),
            ("API Gateway", "Request routing and middleware"),
        ];

        for (name, description) in capabilities {
            let cap_node = graph.create_node(
                "Capability",
                json!({
                    "name": name,
                    "description": description,
                    "enabled": true
                })
            )
            .await
            .expect("Failed to create capability node");

            graph.create_relationship(
                self_node.id,
                cap_node.id,
                "HAS_CAPABILITY",
                json!({})
            )
            .await
            .expect("Failed to create capability relationship");
        }

        // Create test patterns
        let patterns = vec![
            ("greeting", "User greeting pattern"),
            ("help_request", "Request for assistance"),
            ("technical_query", "Technical question"),
            ("feedback", "User feedback"),
        ];

        for (name, description) in patterns {
            graph.create_node(
                "Pattern",
                json!({
                    "name": name,
                    "description": description,
                    "frequency": 0
                })
            )
            .await
            .expect("Failed to create pattern node");
        }
    }

    /// Generate test interaction data
    pub fn generate_test_interactions(count: usize) -> Vec<serde_json::Value> {
        let contents = vec![
            "Hello, how can you help me?",
            "I need help with authentication",
            "What features do you have?",
            "How do I reset my password?",
            "Thank you for your help!",
            "This doesn't seem to be working",
            "Can you explain how sessions work?",
            "What is JWT authentication?",
        ];

        let patterns = vec![
            vec!["greeting", "help_request"],
            vec!["help_request", "authentication"],
            vec!["query", "capabilities"],
            vec!["help_request", "password_reset"],
            vec!["gratitude", "positive_feedback"],
            vec!["problem_report", "negative_feedback"],
            vec!["explanation_request", "technical_query"],
            vec!["technical_query", "authentication"],
        ];

        (0..count)
            .map(|i| {
                let idx = i % contents.len();
                json!({
                    "id": format!("interaction-{}", i),
                    "content": contents[idx],
                    "patterns": patterns[idx].clone(),
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "user_id": format!("user-{}", i % 4)
                })
            })
            .collect()
    }

    /// Generate test auth events
    pub fn generate_test_auth_events(user_id: i64, count: usize) -> Vec<serde_json::Value> {
        let event_types = vec!["login", "logout", "token_refresh", "failed_login"];
        let ip_addresses = vec!["127.0.0.1", "192.168.1.100", "10.0.0.50"];
        let user_agents = vec![
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/14.1",
            "Mozilla/5.0 (X11; Linux x86_64) Firefox/89.0",
        ];

        (0..count)
            .map(|i| {
                let event_type = &event_types[i % event_types.len()];
                let success = event_type != "failed_login";

                json!({
                    "user_id": user_id,
                    "event_type": event_type,
                    "success": success,
                    "ip_address": ip_addresses[i % ip_addresses.len()],
                    "user_agent": user_agents[i % user_agents.len()],
                    "timestamp": chrono::Utc::now().to_rfc3339()
                })
            })
            .collect()
    }

    */

    /// Clean up test data
    pub async fn cleanup_test_data(redis_conn: &mut redis::Connection, graph: &GraphDb) {
        // Clean up Redis test keys
        let _: Result<(), redis::RedisError> = redis::cmd("EVAL")
            .arg("for i, name in ipairs(redis.call('KEYS', ARGV[1])) do redis.call('DEL', name); end")
            .arg(0)
            .arg("test:*")
            .query(redis_conn);

        // Clean up graph
        let _ = graph
            .graph
            .run(neo4rs::query(
                "MATCH (n) WHERE n.environment = 'test' DETACH DELETE n",
            ))
            .await;
    }
}

/// Mock implementations for testing
pub mod mocks {
    use actix_web::{HttpMessage, HttpRequest};
    use std::collections::HashMap;

    /// Mock HTTP request with custom headers and extensions
    pub fn create_mock_request() -> HttpRequest {
        test::TestRequest::default()
            .insert_header(("X-Request-ID", "test-request-123"))
            .insert_header(("User-Agent", "Test Client 1.0"))
            .to_http_request()
    }

    /// Mock authenticated request
    pub fn create_auth_request(token: &str) -> HttpRequest {
        test::TestRequest::default()
            .insert_header(("Authorization", format!("Bearer {}", token)))
            .insert_header(("X-Request-ID", "test-request-123"))
            .to_http_request()
    }

    /// Mock rate limiter for testing
    pub struct MockRateLimiter {
        limits: std::sync::Arc<tokio::sync::Mutex<HashMap<String, Vec<std::time::Instant>>>>,
        max_requests: usize,
        window: std::time::Duration,
    }

    impl MockRateLimiter {
        pub fn new(max_requests: usize, window: std::time::Duration) -> Self {
            Self {
                limits: std::sync::Arc::new(tokio::sync::Mutex::new(HashMap::new())),
                max_requests,
                window,
            }
        }

        pub async fn check_rate_limit(&self, key: &str) -> bool {
            let mut limits = self.limits.lock().await;
            let now = std::time::Instant::now();

            let requests = limits.entry(key.to_string()).or_insert_with(Vec::new);

            // Remove old requests outside the window
            requests.retain(|&time| now.duration_since(time) < self.window);

            if requests.len() < self.max_requests {
                requests.push(now);
                true
            } else {
                false
            }
        }

        pub async fn reset(&self, key: &str) {
            let mut limits = self.limits.lock().await;
            limits.remove(key);
        }
    }

    /// Mock email service for testing
    pub struct MockEmailService {
        sent_emails: std::sync::Arc<tokio::sync::Mutex<Vec<(String, String, String)>>>,
    }

    impl MockEmailService {
        pub fn new() -> Self {
            Self {
                sent_emails: std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new())),
            }
        }

        pub async fn send_email(&self, to: &str, subject: &str, body: &str) -> Result<(), String> {
            let mut emails = self.sent_emails.lock().await;
            emails.push((to.to_string(), subject.to_string(), body.to_string()));
            Ok(())
        }

        pub async fn get_sent_emails(&self) -> Vec<(String, String, String)> {
            let emails = self.sent_emails.lock().await;
            emails.clone()
        }

        pub async fn clear(&self) {
            let mut emails = self.sent_emails.lock().await;
            emails.clear();
        }
    }

    use actix_web::test;
}
