use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde_json::Value;
use std::collections::HashMap;
use tracing::info;
use anyhow::Result;

use crate::agent::ActivityType;

/// Shared logging infrastructure for all agents
/// Handles Redis pub/sub publishing for real-time streaming
#[async_trait]
pub trait AgentLogger: Send + Sync {
    async fn log_activity(&mut self, agent_id: String, activity_type: ActivityType, details: &HashMap<String, Value>, correlation_id: Option<String>) -> Result<()>;
    async fn publish_log_event(&mut self, agent_id: String, log_data: &Value) -> Result<()>;
}

/// Redis-based implementation of AgentLogger
pub struct RedisAgentLogger {
    redis_connection: MultiplexedConnection,
    service_name: String,
}

impl RedisAgentLogger {
    pub async fn new(redis_url: &str, service_name: String) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis_connection = client.get_multiplexed_async_connection().await?;
        
        Ok(Self {
            redis_connection,
            service_name,
        })
    }
}

#[async_trait]
impl AgentLogger for RedisAgentLogger {
    async fn log_activity(&mut self, agent_id: String, activity_type: ActivityType, details: &HashMap<String, Value>, correlation_id: Option<String>) -> Result<()> {
        // Create structured agent activity
        let activity = serde_json::json!({
            "agent_id": agent_id,
            "agent_type": self.service_name,
            "activity_type": activity_type,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "details": details,
            "correlation_id": correlation_id
        });
        
        // 1. Store in agent:activities stream (persistence + agent-to-agent communication)
        let activity_json = serde_json::to_string(&activity)?;
        let _: () = self.redis_connection.xadd("agent:activities", "*", &[("data", &activity_json)]).await?;
        
        // 2. Publish to Redis pub/sub for real-time streaming (event-driven)
        self.publish_log_event(agent_id.clone(), &activity).await?;
        
        // 3. Store in traditional logs format for human consumption
        let log_entry = serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "level": "Info",
            "category": "Agent",
            "message": format!("{}: {:?}", agent_id, activity_type),
            "service": self.service_name,
            "data": details,
            "correlation_id": correlation_id
        });
        
        let log_json = serde_json::to_string(&log_entry)?;
        let _: () = self.redis_connection.lpush("logs:all", &log_json).await?;
        
        info!("📝 Agent {} logged activity: {:?}", agent_id, activity_type);
        Ok(())
    }
    
    async fn publish_log_event(&mut self, agent_id: String, log_data: &Value) -> Result<()> {
        // Publish to multiple Redis pub/sub channels for efficient filtering
        let log_json = serde_json::to_string(log_data)?;
        
        // Main log stream
        let _: () = self.redis_connection.publish("logs:stream", &log_json).await?;
        
        // Agent-specific stream
        let _: () = self.redis_connection.publish(&format!("logs:agent:{}", agent_id), &log_json).await?;
        
        // Category-specific stream  
        if let Some(category) = log_data.get("category").and_then(|c| c.as_str()) {
            let _: () = self.redis_connection.publish(&format!("logs:category:{}", category), &log_json).await?;
        }
        
        // Level-specific stream
        if let Some(level) = log_data.get("level").and_then(|l| l.as_str()) {
            let _: () = self.redis_connection.publish(&format!("logs:level:{}", level), &log_json).await?;
        }
        
        Ok(())
    }
}

/// Default logger factory for agents
pub async fn create_agent_logger(redis_url: &str, service_name: &str) -> Result<Box<dyn AgentLogger>> {
    let logger = RedisAgentLogger::new(redis_url, service_name.to_string()).await?;
    Ok(Box::new(logger))
}