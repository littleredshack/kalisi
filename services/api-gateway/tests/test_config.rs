use std::env;
use edt_gateway::graph::GraphDb;

/// Test configuration
pub struct TestConfig {
    pub database_url: String,
    pub neo4j_uri: String,
    pub neo4j_user: String,
    pub neo4j_password: String,
}

impl TestConfig {
    pub fn from_env() -> Self {
        dotenv::dotenv().ok();
        
        Self {
            database_url: env::var("TEST_DATABASE_URL")
                .unwrap_or_else(|_| env::var("REDIS_URL")
                    .expect("Either TEST_DATABASE_URL or REDIS_URL must be set for tests")),
            neo4j_uri: env::var("TEST_NEO4J_URI")
                .unwrap_or_else(|_| env::var("NEO4J_URI")
                    .expect("Either TEST_NEO4J_URI or NEO4J_URI must be set for tests")),
            neo4j_user: env::var("TEST_NEO4J_USER")
                .unwrap_or_else(|_| env::var("NEO4J_USERNAME")
                    .unwrap_or_else(|_| env::var("NEO4J_USER")
                        .unwrap_or_else(|_| "neo4j".to_string()))),
            neo4j_password: env::var("TEST_NEO4J_PASSWORD")
                .unwrap_or_else(|_| env::var("NEO4J_PASSWORD")
                    .expect("Either TEST_NEO4J_PASSWORD or NEO4J_PASSWORD must be set for tests")),
        }
    }
}

/// Initialize test Redis connection (updated for Redis instead of Postgres)
pub async fn init_test_storage() -> anyhow::Result<redis::Connection> {
    let config = TestConfig::from_env();
    
    // Connect to Redis for testing
    let client = redis::Client::open(config.database_url.as_str())
        .expect("Failed to create Redis client");
    
    let mut conn = client.get_connection()
        .expect("Failed to connect to Redis");
    
    // Clear test keys (prefix with test_)
    let _: () = redis::cmd("FLUSHDB")
        .query(&mut conn)
        .unwrap_or_default();
    
    Ok(conn)
}

/// Initialize test Neo4j connection
pub async fn init_test_neo4j() -> Result<GraphDb, Box<dyn std::error::Error>> {
    let config = TestConfig::from_env();
    
    let graph = neo4rs::Graph::new(
        &config.neo4j_uri,
        &config.neo4j_user,
        &config.neo4j_password
    )
    .await?;
    
    // Clear test data
    graph.run(neo4rs::query("MATCH (n) WHERE n.test = true DETACH DELETE n"))
        .await?;
    
    Ok(GraphDb { graph: std::sync::Arc::new(graph) })
}

/// Test utilities
pub mod test_utils {
    use super::*;
    use std::sync::Once;
    
    static INIT: Once = Once::new();
    
    /// Initialize test environment once
    pub fn init_test_env() {
        INIT.call_once(|| {
            env_logger::init();
            dotenv::dotenv().ok();
        });
    }
    
    /// Generate a unique test identifier
    pub fn unique_id(prefix: &str) -> String {
        format!("{}-{}", prefix, uuid::Uuid::new_v4())
    }
    
    /// Clean up test Redis data
    pub async fn cleanup_test_db(redis_conn: &mut redis::Connection) {
        // Delete test-related keys
        let _: Result<(), redis::RedisError> = redis::cmd("EVAL")
            .arg("for i, name in ipairs(redis.call('KEYS', ARGV[1])) do redis.call('DEL', name); end")
            .arg(0)
            .arg("test:*")
            .query(redis_conn);
    }
    
    /// Clean up test graph
    pub async fn cleanup_test_graph(graph: &GraphDb) {
        let _ = graph.graph.run(neo4rs::query("MATCH (n) WHERE n.test = true DETACH DELETE n"))
            .await;
    }
}

/// Test data builders
pub mod builders {
    use serde_json::json;
    
    pub struct UserBuilder {
        email: String,
        name: String,
        is_active: bool,
    }
    
    impl Default for UserBuilder {
        fn default() -> Self {
            Self {
                email: format!("test-{}@example.com", uuid::Uuid::new_v4()),
                name: "Test User".to_string(),
                is_active: true,
            }
        }
    }
    
    impl UserBuilder {
        pub fn with_email(mut self, email: &str) -> Self {
            self.email = email.to_string();
            self
        }
        
        pub fn with_name(mut self, name: &str) -> Self {
            self.name = name.to_string();
            self
        }
        
        pub fn inactive(mut self) -> Self {
            self.is_active = false;
            self
        }
        
        pub fn build(self) -> (String, String, bool) {
            (self.email, self.name, self.is_active)
        }
    }
    
    pub struct InteractionBuilder {
        content: String,
        patterns: Vec<String>,
        user_id: Option<String>,
    }
    
    impl Default for InteractionBuilder {
        fn default() -> Self {
            Self {
                content: "Test interaction content".to_string(),
                patterns: vec!["test_pattern".to_string()],
                user_id: None,
            }
        }
    }
    
    impl InteractionBuilder {
        pub fn with_content(mut self, content: &str) -> Self {
            self.content = content.to_string();
            self
        }
        
        pub fn with_patterns(mut self, patterns: Vec<&str>) -> Self {
            self.patterns = patterns.iter().map(|s| s.to_string()).collect();
            self
        }
        
        pub fn with_user(mut self, user_id: &str) -> Self {
            self.user_id = Some(user_id.to_string());
            self
        }
        
        pub fn build(self) -> serde_json::Value {
            json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "content": self.content,
                "patterns": self.patterns,
                "user_id": self.user_id,
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "test": true
            })
        }
    }
}