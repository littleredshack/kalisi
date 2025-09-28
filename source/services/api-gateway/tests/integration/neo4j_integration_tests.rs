use edt_gateway::{
    graph::GraphClient,
    handlers::self_awareness::{AnalyzeRequest, LearningRecord},
    state::AppState,
    storage::Storage,
};
use actix_web::{test, App, web};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::Timelike;

async fn setup_test_environment() -> (web::Data<AppState>, GraphClient) {
    // Use environment variables for test configuration
    let config = edt_gateway::config::Config::from_env().expect("Failed to load test config");
    let storage = Storage::new_test().await.expect("Failed to create test storage");
    let graph_client = GraphClient::new(&config.neo4j_uri, &config.neo4j_username, &config.neo4j_password)
        .await
        .expect("Failed to create test graph client");
    
    let state = web::Data::new(AppState {
        storage: Arc::new(RwLock::new(storage)),
        neo4j_client: Some(graph_client.clone()),
    });
    
    (state, graph_client)
}

#[tokio::test]
async fn test_self_awareness_graph_creation() {
    // Load test configuration from environment
    dotenv::dotenv().ok();
    let (_state, graph_client) = setup_test_environment().await;
    
    // Create self node
    let self_node = graph_client.create_node(
        "Self",
        json!({
            "version": "1.0.0",
            "created_at": chrono::Utc::now().to_rfc3339(),
            "capabilities": ["auth", "self_awareness", "learning"]
        })
    )
    .await
    .expect("Failed to create self node");
    
    // Create capability nodes
    let auth_capability = graph_client.create_node(
        "Capability",
        json!({
            "name": "authentication",
            "type": "security",
            "description": "User authentication and session management"
        })
    )
    .await
    .expect("Failed to create capability node");
    
    // Create relationship
    let relationship = graph_client.create_relationship(
        self_node.id,
        auth_capability.id,
        "HAS_CAPABILITY",
        json!({
            "since": chrono::Utc::now().to_rfc3339(),
            "confidence": 1.0
        })
    )
    .await
    .expect("Failed to create relationship");
    
    assert_eq!(relationship.rel_type, "HAS_CAPABILITY");
    
    // Query capabilities
    let query = r#"
        MATCH (s:Self)-[:HAS_CAPABILITY]->(c:Capability)
        RETURN c.name as name, c.type as type
    "#;
    
    let mut result = graph_client.client.execute(neo4rs::query(query))
        .await
        .expect("Failed to query capabilities");
    
    let mut capabilities = Vec::new();
    while let Ok(Some(row)) = result.next().await {
        let name: String = row.get("name").unwrap();
        let cap_type: String = row.get("type").unwrap();
        capabilities.push((name, cap_type));
    }
    
    assert!(!capabilities.is_empty());
    assert!(capabilities.iter().any(|(n, t)| n == "authentication" && t == "security"));
}

#[tokio::test]
async fn test_interaction_pattern_tracking() {
    // Load test configuration from environment
    dotenv::dotenv().ok();
    let (_state, graph_client) = setup_test_environment().await;
    
    // Create user node
    let user_node = graph_client.create_node(
        "User",
        json!({
            "id": "test-user-123",
            "email": "pattern@example.com",
            "created_at": chrono::Utc::now().to_rfc3339()
        })
    )
    .await
    .expect("Failed to create user node");
    
    // Create interaction nodes
    let interactions = vec![
        ("greeting", "Hello, how can you help me?"),
        ("help_request", "I need help with authentication"),
        ("technical_query", "How does JWT work?"),
        ("gratitude", "Thank you for the explanation"),
    ];
    
    for (pattern, content) in interactions {
        let interaction_node = graph_client.create_node(
            "Interaction",
            json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "content": content,
                "pattern": pattern,
                "timestamp": chrono::Utc::now().to_rfc3339()
            })
        )
        .await
        .expect("Failed to create interaction node");
        
        // Link to user
        graph_client.create_relationship(
            user_node.id,
            interaction_node.id,
            "INITIATED",
            json!({})
        )
        .await
        .expect("Failed to create user-interaction relationship");
        
        // Create pattern node if not exists
        let pattern_query = r#"
            MERGE (p:Pattern {name: $pattern})
            ON CREATE SET p.created_at = datetime()
            RETURN p
        "#;
        
        graph_client.client.execute(
            neo4rs::query(pattern_query)
                .param("pattern", pattern)
        )
        .await
        .expect("Failed to create pattern node");
        
        // Link interaction to pattern
        let link_query = r#"
            MATCH (i:Interaction {id: $interaction_id})
            MATCH (p:Pattern {name: $pattern})
            MERGE (i)-[:EXHIBITS]->(p)
        "#;
        
        graph_client.client.execute(
            neo4rs::query(link_query)
                .param("interaction_id", interaction_node.properties["id"].as_str().unwrap())
                .param("pattern", pattern)
        )
        .await
        .expect("Failed to link interaction to pattern");
    }
    
    // Query user's interaction patterns
    let pattern_query = r#"
        MATCH (u:User {id: $user_id})-[:INITIATED]->(i:Interaction)-[:EXHIBITS]->(p:Pattern)
        RETURN p.name as pattern, count(i) as count
        ORDER BY count DESC
    "#;
    
    let mut result = graph_client.client.execute(
        neo4rs::query(pattern_query)
            .param("user_id", "test-user-123")
    )
    .await
    .expect("Failed to query patterns");
    
    let mut patterns = Vec::new();
    while let Ok(Some(row)) = result.next().await {
        let pattern: String = row.get("pattern").unwrap();
        let count: i64 = row.get("count").unwrap();
        patterns.push((pattern, count));
    }
    
    assert_eq!(patterns.len(), 4);
}

#[tokio::test]
async fn test_learning_graph_updates() {
    // Load test configuration from environment
    dotenv::dotenv().ok();
    let (_state, graph_client) = setup_test_environment().await;
    
    // Create initial learning state
    let learning_node = graph_client.create_node(
        "LearningState",
        json!({
            "version": "1.0",
            "total_interactions": 0,
            "success_rate": 0.0,
            "last_updated": chrono::Utc::now().to_rfc3339()
        })
    )
    .await
    .expect("Failed to create learning node");
    
    // Simulate learning from multiple interactions
    for i in 1..=5 {
        let feedback_node = graph_client.create_node(
            "Feedback",
            json!({
                "interaction_id": format!("interaction-{}", i),
                "rating": if i % 2 == 0 { 5 } else { 4 },
                "helpful": true,
                "timestamp": chrono::Utc::now().to_rfc3339()
            })
        )
        .await
        .expect("Failed to create feedback node");
        
        // Link to learning state
        graph_client.create_relationship(
            learning_node.id,
            feedback_node.id,
            "LEARNED_FROM",
            json!({
                "weight": if i % 2 == 0 { 1.0 } else { 0.8 }
            })
        )
        .await
        .expect("Failed to create learning relationship");
    }
    
    // Update learning state
    let update_query = r#"
        MATCH (l:LearningState)
        MATCH (l)-[:LEARNED_FROM]->(f:Feedback)
        WITH l, count(f) as feedback_count, avg(f.rating) as avg_rating
        SET l.total_interactions = feedback_count,
            l.success_rate = avg_rating / 5.0,
            l.last_updated = datetime()
        RETURN l
    "#;
    
    let mut result = graph_client.client.execute(neo4rs::query(update_query))
        .await
        .expect("Failed to update learning state");
    
    if let Ok(Some(row)) = result.next().await {
        let node: neo4rs::Node = row.get("l").unwrap();
        let total: i64 = node.get("total_interactions").unwrap();
        let success_rate: f64 = node.get("success_rate").unwrap();
        
        assert_eq!(total, 5);
        assert!(success_rate > 0.8); // Average of 4 and 5 ratings
    }
}

#[tokio::test]
async fn test_knowledge_graph_connections() {
    // Load test configuration from environment
    dotenv::dotenv().ok();
    let (_state, graph_client) = setup_test_environment().await;
    
    // Create knowledge graph
    let concepts = vec![
        ("Authentication", "security"),
        ("JWT", "technology"),
        ("Session", "concept"),
        ("OTP", "technology"),
    ];
    
    let mut concept_nodes = Vec::new();
    for (name, concept_type) in concepts {
        let node = graph_client.create_node(
            "Concept",
            json!({
                "name": name,
                "type": concept_type,
                "confidence": 0.9
            })
        )
        .await
        .expect("Failed to create concept node");
        concept_nodes.push((name, node.id));
    }
    
    // Create relationships between concepts
    let relationships = vec![
        (0, 1, "USES"), // Authentication USES JWT
        (0, 2, "MANAGES"), // Authentication MANAGES Session
        (0, 3, "USES"), // Authentication USES OTP
        (1, 2, "CONTAINS"), // JWT CONTAINS Session
    ];
    
    for (from_idx, to_idx, rel_type) in relationships {
        graph_client.create_relationship(
            concept_nodes[from_idx].1,
            concept_nodes[to_idx].1,
            rel_type,
            json!({
                "strength": 0.8,
                "discovered_at": chrono::Utc::now().to_rfc3339()
            })
        )
        .await
        .expect("Failed to create concept relationship");
    }
    
    // Query related concepts
    let query = r#"
        MATCH (c1:Concept {name: $concept})-[r]->(c2:Concept)
        RETURN c2.name as related_concept, type(r) as relationship, r.strength as strength
        ORDER BY r.strength DESC
    "#;
    
    let mut result = graph_client.client.execute(
        neo4rs::query(query)
            .param("concept", "Authentication")
    )
    .await
    .expect("Failed to query related concepts");
    
    let mut related = Vec::new();
    while let Ok(Some(row)) = result.next().await {
        let concept: String = row.get("related_concept").unwrap();
        let rel: String = row.get("relationship").unwrap();
        let strength: f64 = row.get("strength").unwrap();
        related.push((concept, rel, strength));
    }
    
    assert_eq!(related.len(), 3);
    assert!(related.iter().any(|(c, _, _)| c == "JWT"));
    assert!(related.iter().any(|(c, _, _)| c == "Session"));
    assert!(related.iter().any(|(c, _, _)| c == "OTP"));
}

#[tokio::test]
async fn test_temporal_pattern_analysis() {
    // Load test configuration from environment
    dotenv::dotenv().ok();
    let (_state, graph_client) = setup_test_environment().await;
    
    // Create time-based interaction patterns
    let base_time = chrono::Utc::now();
    let time_slots = vec![
        ("morning", 8),
        ("afternoon", 14),
        ("evening", 19),
        ("night", 22),
    ];
    
    for (period, hour) in time_slots {
        for i in 0..3 {
            let timestamp = base_time
                .with_hour(hour).unwrap()
                .with_minute(i * 20).unwrap();
            
            let interaction = graph_client.create_node(
                "TimedInteraction",
                json!({
                    "id": format!("interaction-{}-{}", period, i),
                    "period": period,
                    "timestamp": timestamp.to_rfc3339(),
                    "type": if i % 2 == 0 { "query" } else { "command" }
                })
            )
            .await
            .expect("Failed to create timed interaction");
            
            // Create time period node
            let period_query = r#"
                MERGE (tp:TimePeriod {name: $period, hour: $hour})
                RETURN tp
            "#;
            
            graph_client.client.execute(
                neo4rs::query(period_query)
                    .param("period", period)
                    .param("hour", hour as i64)
            )
            .await
            .expect("Failed to create time period");
            
            // Link interaction to time period
            let link_query = r#"
                MATCH (i:TimedInteraction {id: $interaction_id})
                MATCH (tp:TimePeriod {name: $period})
                MERGE (i)-[:OCCURRED_DURING]->(tp)
            "#;
            
            graph_client.client.execute(
                neo4rs::query(link_query)
                    .param("interaction_id", interaction.properties["id"].as_str().unwrap())
                    .param("period", period)
            )
            .await
            .expect("Failed to link interaction to time period");
        }
    }
    
    // Analyze temporal patterns
    let analysis_query = r#"
        MATCH (i:TimedInteraction)-[:OCCURRED_DURING]->(tp:TimePeriod)
        RETURN tp.name as period, count(i) as interaction_count, 
               collect(distinct i.type) as interaction_types
        ORDER BY tp.hour
    "#;
    
    let mut result = graph_client.client.execute(neo4rs::query(analysis_query))
        .await
        .expect("Failed to analyze temporal patterns");
    
    let mut patterns = Vec::new();
    while let Ok(Some(row)) = result.next().await {
        let period: String = row.get("period").unwrap();
        let count: i64 = row.get("interaction_count").unwrap();
        let types: Vec<String> = row.get("interaction_types").unwrap();
        patterns.push((period, count, types));
    }
    
    assert_eq!(patterns.len(), 4);
    assert!(patterns.iter().all(|(_, count, _)| *count == 3));
    assert!(patterns.iter().all(|(_, _, types)| types.contains(&"query".to_string())));
}

#[tokio::test]
async fn test_graph_performance_metrics() {
    // Load test configuration from environment
    dotenv::dotenv().ok();
    let (_state, graph_client) = setup_test_environment().await;
    
    // Create a larger dataset for performance testing
    let start_time = std::time::Instant::now();
    
    // Create 100 nodes
    for i in 0..100 {
        graph_client.create_node(
            "PerformanceTest",
            json!({
                "id": i,
                "data": format!("test-data-{}", i),
                "timestamp": chrono::Utc::now().to_rfc3339()
            })
        )
        .await
        .expect("Failed to create performance test node");
    }
    
    let creation_time = start_time.elapsed();
    
    // Query performance
    let query_start = std::time::Instant::now();
    
    let query = r#"
        MATCH (n:PerformanceTest)
        WHERE n.id >= $min_id AND n.id <= $max_id
        RETURN count(n) as count
    "#;
    
    let mut result = graph_client.client.execute(
        neo4rs::query(query)
            .param("min_id", 25i64)
            .param("max_id", 75i64)
    )
    .await
    .expect("Failed to query performance test nodes");
    
    let query_time = query_start.elapsed();
    
    if let Ok(Some(row)) = result.next().await {
        let count: i64 = row.get("count").unwrap();
        assert_eq!(count, 51); // 25 to 75 inclusive
    }
    
    // Assert reasonable performance
    assert!(creation_time.as_millis() < 5000, "Node creation took too long");
    assert!(query_time.as_millis() < 100, "Query took too long");
    
    // Cleanup
    graph_client.execute_query("MATCH (n:PerformanceTest) DELETE n")
        .await
        .expect("Failed to cleanup performance test nodes");
}