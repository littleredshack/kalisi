use redis::{AsyncCommands, Client};
use serde_json;
use tokio;
use uuid::Uuid;

/// Test Redis message bus request/response cycle
#[tokio::test]
async fn test_redis_message_bus_communication() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let client = Client::open(&redis_url).expect("Failed to create Redis client");
    let mut redis = client.get_multiplexed_async_connection().await.expect("Failed to connect to Redis");
    
    // Clean up test streams
    let _: () = redis.del("agent:requests").await.unwrap_or(());
    let _: () = redis.del("agent:responses").await.unwrap_or(());
    
    // Create test request
    let request_id = Uuid::new_v4().to_string();
    let request = serde_json::json!({
        "request_id": request_id,
        "agent_type": "security-agent", 
        "message": "test message",
        "timestamp": chrono::Utc::now()
    });
    
    let request_json = serde_json::to_string(&request).expect("Failed to serialize request");
    
    // Send request to agent:requests stream
    let _: () = redis.xadd("agent:requests", "*", &[("data", request_json)]).await.expect("Failed to add request to stream");
    
    // Verify request was added
    let entries: redis::streams::StreamReadReply = redis.xread(&["agent:requests"], &["0"]).await.expect("Failed to read requests stream");
    assert!(!entries.keys.is_empty(), "No entries found in agent:requests stream");
    
    let stream = &entries.keys[0];
    assert!(!stream.ids.is_empty(), "No request entries found");
    
    // Verify request data
    let entry = &stream.ids[0];
    let data = entry.map.get("data").expect("No data field in request entry");
    
    if let redis::Value::BulkString(bytes) = data {
        let json_str = String::from_utf8(bytes.clone()).expect("Invalid UTF-8 in request data");
        let parsed_request: serde_json::Value = serde_json::from_str(&json_str).expect("Invalid JSON in request data");
        
        assert_eq!(parsed_request["request_id"], request_id);
        assert_eq!(parsed_request["agent_type"], "security-agent");
        assert_eq!(parsed_request["message"], "test message");
    } else {
        panic!("Request data is not BulkString");
    }
}

/// Test API Gateway agent message bus integration
#[tokio::test]
async fn test_api_gateway_agent_communication() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    
    // Test the agent_message_bus module (would need to be public for testing)
    // This tests the integration between API Gateway and Agent Runtime Service
    
    // For now, test that the Redis streams are properly structured
    let client = Client::open(&redis_url).expect("Failed to create Redis client");
    let mut redis = client.get_multiplexed_async_connection().await.expect("Failed to connect to Redis");
    
    // Test creating the required streams
    let _: () = redis.del("agent:requests").await.unwrap_or(());
    let _: () = redis.del("agent:responses").await.unwrap_or(());
    
    // Verify streams can be created and used
    let test_data = r#"{"test": "message_bus"}"#;
    let _: () = redis.xadd("agent:requests", "*", &[("data", test_data)]).await.expect("Failed to create agent:requests stream");
    let _: () = redis.xadd("agent:responses", "*", &[("data", test_data)]).await.expect("Failed to create agent:responses stream");
    
    // Verify streams exist and have data
    let requests: redis::streams::StreamReadReply = redis.xread(&["agent:requests"], &["0"]).await.expect("Failed to read requests");
    let responses: redis::streams::StreamReadReply = redis.xread(&["agent:responses"], &["0"]).await.expect("Failed to read responses");
    
    assert!(!requests.keys.is_empty(), "agent:requests stream not created");
    assert!(!responses.keys.is_empty(), "agent:responses stream not created");
}

/// Test log query processing end-to-end
#[tokio::test]  
async fn test_log_query_processing() {
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let mut agent = SecurityAgent::new(&redis_url).await.expect("Failed to create Security Agent");
    agent.initialize().await.expect("Failed to initialize Security Agent");
    
    let client = Client::open(&redis_url).expect("Failed to create Redis client");
    let mut redis = client.get_multiplexed_async_connection().await.expect("Failed to connect to Redis");
    
    // Clean up test data
    let _: () = redis.del("agent:activities").await.unwrap_or(());
    let _: () = redis.del("logs:all").await.unwrap_or(());
    
    // Add some test log entries
    let test_log = serde_json::json!({
        "id": Uuid::new_v4().to_string(),
        "timestamp": chrono::Utc::now(),
        "level": "Info",
        "category": "Test",
        "message": "Test log entry",
        "service": "test-service"
    });
    
    let log_json = serde_json::to_string(&test_log).expect("Failed to serialize test log");
    let _: () = redis.lpush("logs:all", log_json).await.expect("Failed to add test log");
    
    // Process log query
    let response = agent.process_query("show me the logs").await.expect("Failed to process log query");
    
    // Verify response contains logs
    assert!(!response.summary.is_empty());
    assert!(!response.logs.is_empty());
    assert!(response.total_count > 0);
    
    // Verify MRAP workflow was logged for this query
    let entries: redis::streams::StreamReadReply = redis.xread(&["agent:activities"], &["0"]).await.expect("Failed to read agent activities");
    assert!(!entries.keys.is_empty(), "No MRAP activities logged");
    
    // Should have logged multiple MRAP phases
    let stream = &entries.keys[0];
    assert!(stream.ids.len() >= 5, "Expected multiple MRAP phases, found {}", stream.ids.len());
    
    // Verify activities were also logged to main logs for visibility
    let main_logs: Vec<String> = redis.lrange("logs:all", 0, -1).await.expect("Failed to read main logs");
    let agent_logs: Vec<_> = main_logs.iter()
        .filter(|log| log.contains("Security Agent:"))
        .collect();
    
    assert!(!agent_logs.is_empty(), "Security Agent activities not found in main logs");
}

/// Test autonomous agent error handling
#[tokio::test]
async fn test_agent_error_handling() {
    // Test with invalid Redis URL
    let result = SecurityAgent::new("redis://invalid:1234").await;
    assert!(result.is_err(), "Should fail with invalid Redis URL");
    
    // Test with valid agent but invalid operations
    let redis_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let mut agent = SecurityAgent::new(&redis_url).await.expect("Failed to create Security Agent");
    agent.initialize().await.expect("Failed to initialize Security Agent");
    
    // Test query processing with edge cases
    let response1 = agent.process_query("").await.expect("Failed to process empty query");
    assert!(!response1.summary.is_empty());
    
    let response2 = agent.process_query("nonexistent category logs").await.expect("Failed to process nonexistent category");
    assert!(!response2.summary.is_empty());
}