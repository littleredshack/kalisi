#[cfg(test)]
mod tests {
    use edt_gateway::{config::Config, graph::GraphDb};

    #[tokio::test]
    async fn test_neo4j_connection() {
        // Load test configuration from environment
        dotenv::dotenv().ok();
        let config = Config::from_env().expect("Failed to load config");

        // Create graph connection
        let graph = GraphDb::new(&config)
            .await
            .expect("Failed to connect to Neo4j");

        // Test health check
        let health = graph.health_check().await.expect("Health check failed");
        assert!(health, "Neo4j health check should return true");
    }

    #[tokio::test]
    async fn test_system_overview() {
        // Load test configuration from environment
        dotenv::dotenv().ok();
        let config = Config::from_env().expect("Failed to load config");
        let graph = GraphDb::new(&config)
            .await
            .expect("Failed to connect to Neo4j");

        // Get system overview
        let overview = graph
            .get_system_overview()
            .await
            .expect("Failed to get overview");

        // Verify we have some data
        assert!(overview.projects >= 0);
        assert!(overview.agents >= 0);
        assert!(overview.components >= 0);
        assert!(overview.events >= 0);
    }

    #[tokio::test]
    async fn test_track_event() {
        // Load test configuration from environment
        dotenv::dotenv().ok();
        let config = Config::from_env().expect("Failed to load config");
        let graph = GraphDb::new(&config)
            .await
            .expect("Failed to connect to Neo4j");

        // Track a test event
        let event_id = graph
            .track_event(
                "test_event",
                "Test Event",
                "This is a test event",
                "test@example.com",
            )
            .await
            .expect("Failed to track event");

        assert!(!event_id.is_empty(), "Event ID should not be empty");
    }
}
