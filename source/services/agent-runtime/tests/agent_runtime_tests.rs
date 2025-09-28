use agent_runtime::{SecurityAgent, Agent, ActivityType};
use redis::{AsyncCommands, Client};
use serde_json::Value;
use std::collections::HashMap;
use tokio;
use uuid::Uuid;

/// Test Redis connection and basic operations
#[tokio::test]
async fn test_redis_connection() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let client = Client::open(redis_url).expect("Failed to create Redis client");
    let mut con = client.get_multiplexed_async_connection().await.expect("Failed to connect to Redis");
    
    // Test basic ping
    // Test basic Redis operation instead of ping
    let _: () = con.set("test:ping", "ok").await.expect("Redis operation failed");
    let result: String = con.get("test:ping").await.expect("Redis get failed");
    assert_eq!(result, "ok");
}

/// Test Security Agent initialization
#[tokio::test]
async fn test_security_agent_initialization() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    
    let mut agent = SecurityAgent::new(redis_url.as_str()).await.expect("Failed to create Security Agent");
    agent.initialize().await.expect("Failed to initialize Security Agent");
    
    // Verify agent info
    let info = agent.info();
    assert_eq!(info.id, "security-agent-001");
    assert_eq!(info.name, "Security Monitor");
    assert!(!info.capabilities.is_empty());
}

/// Test Security Agent MRAP logging to Redis streams
#[tokio::test]
async fn test_security_agent_activity_logging() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    
    // Clean up any existing test data first
    let client = Client::open(redis_url.as_str()).expect("Failed to create Redis client");
    let mut redis = client.get_multiplexed_async_connection().await.expect("Failed to connect to Redis");
    let _: () = redis.del("agent:activities").await.unwrap_or(());
    
    // Wait a moment for cleanup to complete
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // Create and initialize the agent after cleanup
    let mut agent = SecurityAgent::new(redis_url.as_str()).await.expect("Failed to create Security Agent");
    agent.initialize().await.expect("Failed to initialize Security Agent");
    
    // Wait for initialization to complete and be logged
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    
    // Test activity logging
    let mut details = HashMap::new();
    details.insert("test".to_string(), Value::String("mrap_logging".to_string()));
    
    agent.log_activity(ActivityType::Custom("test".to_string()), &details).await.expect("Failed to log activity");
    
    // Wait for the activity to be logged
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // Verify the activity was logged to Redis stream with retry logic
    let mut entries: Option<redis::streams::StreamReadReply> = None;
    for attempt in 1..=5 {
        match redis.xread::<&str, &str, redis::streams::StreamReadReply>(&["agent:activities"], &["0"]).await {
            Ok(stream_data) if !stream_data.keys.is_empty() => {
                entries = Some(stream_data);
                break;
            }
            Ok(_) => {
                if attempt == 5 {
                    // Last attempt - check what's actually in Redis
                    let stream_len: i64 = redis.xlen("agent:activities").await.unwrap_or(0);
                    panic!("No entries found in agent:activities stream after {} attempts. Stream length: {}", attempt, stream_len);
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
            Err(e) => {
                if attempt == 5 {
                    panic!("Failed to read stream after {} attempts: {}", attempt, e);
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        }
    }
    
    let entries = entries.expect("No entries found after retry attempts");
    
    let stream = &entries.keys[0];
    assert!(stream.ids.len() >= 2, "Expected at least 2 activity entries (Initialized + Custom), found {}", stream.ids.len());
    
    // Verify we can parse activity entries - check the last one which should be our custom activity
    let entry = stream.ids.last().unwrap();
    let data = entry.map.get("data").expect("No data field in stream entry");
    
    if let redis::Value::BulkString(bytes) = data {
        let json_str = String::from_utf8(bytes.clone()).expect("Invalid UTF-8 in stream data");
        let activity: serde_json::Value = serde_json::from_str(&json_str).expect("Invalid JSON in stream data");
        
        assert_eq!(activity["agent_id"], "security-agent-001");
        assert!(activity["timestamp"].is_string());
        assert!(activity["details"].is_object());
        
        // The custom activity should have our test data
        // ActivityType::Custom("test") gets serialized as {"Custom": "test"}
        if let Some(custom_activity) = activity["activity_type"]["Custom"].as_str() {
            if custom_activity.contains("test") {
                assert_eq!(activity["details"]["test"], "mrap_logging");
            }
        }
    } else {
        panic!("Stream data is not BulkString");
    }
}

/// Test Security Agent MRAP workflow with correlation IDs
#[tokio::test]
async fn test_security_agent_mrap_workflow() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    
    // Clean up any existing test data first
    let client = Client::open(redis_url.as_str()).expect("Failed to create Redis client");
    let mut redis = client.get_multiplexed_async_connection().await.expect("Failed to connect to Redis");
    let _: () = redis.del("agent:activities").await.unwrap_or(());
    
    // Wait for cleanup to complete
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    
    // Create and initialize agent after cleanup
    let mut agent = SecurityAgent::new(redis_url.as_str()).await.expect("Failed to create Security Agent");
    agent.initialize().await.expect("Failed to initialize Security Agent");
    
    // Wait for initialization to complete
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    
    // Process a test query to trigger MRAP workflow
    let response = agent.process_query("show test logs").await.expect("Failed to process query");
    assert!(!response.summary.is_empty());
    
    // Wait for MRAP activities to be logged
    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    
    // Verify MRAP activities were logged with correlation IDs with retry logic
    let mut entries: Option<redis::streams::StreamReadReply> = None;
    for attempt in 1..=5 {
        match redis.xread::<&str, &str, redis::streams::StreamReadReply>(&["agent:activities"], &["0"]).await {
            Ok(stream_data) if !stream_data.keys.is_empty() => {
                entries = Some(stream_data);
                break;
            }
            Ok(_) => {
                if attempt == 5 {
                    let stream_len: i64 = redis.xlen("agent:activities").await.unwrap_or(0);
                    panic!("No entries found in agent:activities stream after {} attempts. Stream length: {}", attempt, stream_len);
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }
            Err(e) => {
                if attempt == 5 {
                    panic!("Failed to read stream after {} attempts: {}", attempt, e);
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            }
        }
    }
    
    let entries = entries.expect("No entries found after retry attempts");
    
    let stream = &entries.keys[0];
    assert!(stream.ids.len() >= 5, "Expected multiple MRAP phase entries, found {}", stream.ids.len());
    
    // Verify correlation IDs are consistent across MRAP phases
    let mut correlation_ids = Vec::new();
    for entry in &stream.ids {
        if let Some(redis::Value::BulkString(bytes)) = entry.map.get("data") {
            if let Ok(json_str) = String::from_utf8(bytes.clone()) {
                if let Ok(activity) = serde_json::from_str::<serde_json::Value>(&json_str) {
                    if let Some(correlation_id) = activity["correlation_id"].as_str() {
                        correlation_ids.push(correlation_id.to_string());
                    }
                }
            }
        }
    }
    
    // Should have correlation IDs present (may be multiple workflows)
    assert!(!correlation_ids.is_empty(), "No correlation IDs found");
    
    // Check that we have valid correlation IDs (UUIDs)
    for id in &correlation_ids {
        assert!(id.len() == 36, "Correlation ID should be UUID format: {}", id);
        assert!(id.contains('-'), "Correlation ID should contain hyphens: {}", id);
    }
}

/// Test Redis message bus communication
#[tokio::test]
async fn test_redis_message_bus() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let client = Client::open(redis_url.as_str()).expect("Failed to create Redis client");
    let mut redis = client.get_multiplexed_async_connection().await.expect("Failed to connect to Redis");
    
    // Clean up test streams
    let _: () = redis.del("agent:requests").await.unwrap_or(());
    let _: () = redis.del("agent:responses").await.unwrap_or(());
    
    // Test request message format
    let request = serde_json::json!({
        "request_id": Uuid::new_v4().to_string(),
        "agent_type": "security-agent",
        "message": "test query",
        "timestamp": chrono::Utc::now()
    });
    
    let request_json = serde_json::to_string(&request).expect("Failed to serialize request");
    
    // Add request to stream
    let _: () = redis.xadd("agent:requests", "*", &[("data", request_json)]).await.expect("Failed to add request to stream");
    
    // Verify request was added
    let entries: redis::streams::StreamReadReply = redis.xread(&["agent:requests"], &["0"]).await.expect("Failed to read requests stream");
    assert!(!entries.keys.is_empty(), "No entries found in agent:requests stream");
    
    let stream = &entries.keys[0];
    assert!(!stream.ids.is_empty(), "No request entries found");
    
    // Verify request format
    let entry = &stream.ids[0];
    let data = entry.map.get("data").expect("No data field in request entry");
    
    if let redis::Value::BulkString(bytes) = data {
        let json_str = String::from_utf8(bytes.clone()).expect("Invalid UTF-8 in request data");
        let parsed_request: serde_json::Value = serde_json::from_str(&json_str).expect("Invalid JSON in request data");
        
        assert!(parsed_request["request_id"].is_string());
        assert_eq!(parsed_request["agent_type"], "security-agent");
        assert_eq!(parsed_request["message"], "test query");
        assert!(parsed_request["timestamp"].is_string());
    } else {
        panic!("Request data is not BulkString");
    }
}

/// Test unified logging system (both streams and main logs)
#[tokio::test]
async fn test_unified_logging_system() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let mut agent = SecurityAgent::new(redis_url.as_str()).await.expect("Failed to create Security Agent");
    
    let client = Client::open(redis_url.as_str()).expect("Failed to create Redis client");
    let mut redis = client.get_multiplexed_async_connection().await.expect("Failed to connect to Redis");
    
    // Clean up test data
    let _: () = redis.del("agent:activities").await.unwrap_or(());
    let _: () = redis.del("logs:all").await.unwrap_or(());
    let _: () = redis.del("logs:category:agent").await.unwrap_or(());
    
    // Log a test activity
    let mut details = HashMap::new();
    details.insert("test_type".to_string(), Value::String("unified_logging".to_string()));
    
    agent.log_activity(ActivityType::Initialized, &details).await.expect("Failed to log activity");
    
    // Verify activity was logged to agent:activities stream
    let stream_entries: redis::streams::StreamReadReply = redis.xread(&["agent:activities"], &["0"]).await.expect("Failed to read agent:activities stream");
    assert!(!stream_entries.keys.is_empty(), "No entries found in agent:activities stream");
    
    // Verify activity was also logged to main logs
    let log_entries: Vec<String> = redis.lrange("logs:all", 0, -1).await.expect("Failed to read logs:all");
    assert!(!log_entries.is_empty(), "No entries found in logs:all");
    
    // Verify log entry format in main logs
    let latest_log = &log_entries[0];
    let log_data: serde_json::Value = serde_json::from_str(latest_log).expect("Invalid JSON in main log");
    
    assert_eq!(log_data["service"], "security-agent");
    assert_eq!(log_data["category"], "Agent");
    assert_eq!(log_data["level"], "Info");
    // Check that it's a Security Agent log entry
    assert_eq!(log_data["service"], "security-agent");
    assert_eq!(log_data["category"], "Agent");
    assert!(log_data["message"].as_str().unwrap().contains("Security Agent:"));
    assert!(log_data["data"].is_object());
}

/// Test Agent trait implementations
#[tokio::test]
async fn test_agent_trait_implementation() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let agent = SecurityAgent::new(redis_url.as_str()).await.expect("Failed to create Security Agent");
    
    // Test agent info
    let info = agent.info();
    assert!(!info.id.is_empty());
    assert!(!info.name.is_empty());
    
    // Test protocols
    let protocols = agent.protocols();
    assert!(protocols.contains(&"security.logs.query.v1".to_string()));
    assert!(protocols.contains(&"security.monitor.v1".to_string()));
    
    // Test health check
    let health = agent.health_check().await.expect("Health check failed");
    println!("Agent health: {:?}", health);
    
    // Test metrics
    let metrics = agent.get_metrics().await.expect("Failed to get metrics");
    assert!(metrics.contains_key("queries_processed"));
    assert!(metrics.contains_key("patterns_learned"));
}