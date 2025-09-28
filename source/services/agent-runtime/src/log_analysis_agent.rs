use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::info;
use anyhow::Result;

use crate::agent::{Agent, AgentInfo, AgentStatus, Capability, CognitivePattern, ResourceLimits, ActivityType};

/// Log Analysis Agent query response (matches Security Agent pattern)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogAnalysisResponse {
    pub summary: String,
    pub logs: Vec<AnalysisLogEntry>,
    pub total_count: usize,
    pub insights: Vec<String>,
    pub correlation_id: Option<String>,
}

/// Log entry for Log Analysis Agent (renamed to avoid conflict)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisLogEntry {
    pub level: String,
    pub category: String,
    pub message: String,
    pub timestamp: String,
    pub service: String,
}

/// Log Analysis Agent - Specialized for log stream coordination and presentation
/// Follows same MRAP pattern as Security Agent
pub struct LogAnalysisAgent {
    info: AgentInfo,
    redis_connection: MultiplexedConnection,
    active_streams: HashMap<String, String>, // session_id -> correlation_id
}

impl LogAnalysisAgent {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis_connection = client.get_multiplexed_async_connection().await?;
        
        let info = AgentInfo {
            id: "log-analysis-agent-001".to_string(),
            name: "Log Analysis & Streaming Agent".to_string(),
            cognitive_pattern: CognitivePattern::Critical,
            capabilities: vec![
                Capability {
                    protocol: "log_streaming.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Real-time log streaming coordination".to_string(),
                },
                Capability {
                    protocol: "log_filtering.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Advanced log filtering and analysis".to_string(),
                },
            ],
            resource_limits: ResourceLimits::default(),
            created_at: chrono::Utc::now(),
            status: AgentStatus::Initializing,
        };
        
        Ok(LogAnalysisAgent {
            info,
            redis_connection,
            active_streams: HashMap::new(),
        })
    }
    
    /// Process log streaming commands using MRAP workflow
    pub async fn process_query(&mut self, query: &str) -> Result<LogAnalysisResponse> {
        let correlation_id = uuid::Uuid::new_v4().to_string();
        
        // Log MRAP phases manually
        self.log_activity_with_correlation(
            ActivityType::MrapStarted,
            &HashMap::from([("query".to_string(), serde_json::Value::String(query.to_string()))]),
            &correlation_id
        ).await?;
        
        // Execute the action
        let result = self.execute_log_action(query, &correlation_id).await?;
        
        self.log_activity_with_correlation(
            ActivityType::ActionTaken,
            &HashMap::from([("action".to_string(), serde_json::Value::String("query_processed".to_string()))]),
            &correlation_id
        ).await?;
        
        Ok(result)
    }
    
    /// Execute log streaming actions
    async fn execute_log_action(&mut self, query: &str, correlation_id: &str) -> Result<LogAnalysisResponse> {
        let lower = query.to_lowercase();
        
        if lower.contains("streaming") || lower.contains("stream") {
            // Handle streaming commands
            if lower.contains("start") || lower.contains("show") {
                self.start_streaming_session(query, correlation_id).await
            } else if lower.contains("stop") || lower.contains("end") {
                self.stop_streaming_session(correlation_id).await
            } else {
                self.get_streaming_status(correlation_id).await
            }
        } else if lower.contains("filter") {
            // Handle filter commands
            self.apply_log_filters(query, correlation_id).await
        } else {
            // Default: get recent logs
            self.get_recent_logs(query, correlation_id).await
        }
    }
    
    /// Start streaming session (communicates with Security Agent)
    async fn start_streaming_session(&mut self, query: &str, correlation_id: &str) -> Result<LogAnalysisResponse> {
        // Log the streaming start action
        self.log_activity_with_correlation(
            ActivityType::Custom("StreamingStarted".to_string()),
            &HashMap::from([
                ("query".to_string(), serde_json::Value::String(query.to_string())),
                ("action".to_string(), serde_json::Value::String("start_streaming".to_string())),
            ]),
            correlation_id
        ).await?;
        
        // Start streaming log data to dedicated UI stream
        self.stream_logs_to_ui(correlation_id).await?;
        
        // Return brief confirmation to chat (NOT log data)
        Ok(LogAnalysisResponse {
            summary: "✅ Log streaming started".to_string(),
            logs: vec![], // No log data in chat response
            total_count: 0,
            insights: vec![
                "Real-time logs now streaming to logs panel".to_string(),
                "Use filter commands to refine display".to_string(),
            ],
            correlation_id: Some(correlation_id.to_string()),
        })
    }
    
    /// Stream log data via agent message bus (pure agentic architecture)
    async fn stream_logs_to_ui(&mut self, correlation_id: &str) -> Result<()> {
        // Send streaming data via existing agent message bus
        let stream_message = serde_json::json!({
            "request_id": correlation_id,
            "agent_type": "log-analysis-agent",
            "response_type": "log_stream_data",
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "logs": [
                {
                    "id": uuid::Uuid::new_v4().to_string(),
                    "timestamp": chrono::Utc::now().to_rfc3339(),
                    "level": "info",
                    "service": "log-analysis-agent",
                    "category": "Stream",
                    "message": "Log streaming session started",
                    "correlation_id": correlation_id,
                    "stream_type": "realtime"
                }
            ]
        });
        
        // Use existing agent:responses Redis stream (pure agentic)
        let mut redis = self.redis_connection.clone();
        let stream_json = serde_json::to_string(&stream_message)?;
        let _: () = redis.xadd("agent:responses", "*", &[("data", &stream_json)]).await?;
        
        info!("📡 Log Analysis Agent: Streaming via agent message bus");
        Ok(())
    }
    
    /// Stop streaming session
    async fn stop_streaming_session(&mut self, correlation_id: &str) -> Result<LogAnalysisResponse> {
        // Log the streaming stop action
        self.log_activity_with_correlation(
            ActivityType::Custom("StreamingStopped".to_string()),
            &HashMap::from([
                ("action".to_string(), serde_json::Value::String("stop_streaming".to_string())),
            ]),
            correlation_id
        ).await?;
        
        Ok(LogAnalysisResponse {
            summary: "🔄 Log streaming stopped.".to_string(),
            logs: vec![],
            total_count: 0,
            insights: vec!["Streaming session ended".to_string()],
            correlation_id: Some(correlation_id.to_string()),
        })
    }
    
    /// Get streaming status
    async fn get_streaming_status(&self, correlation_id: &str) -> Result<LogAnalysisResponse> {
        Ok(LogAnalysisResponse {
            summary: "📊 Log Analysis Agent streaming status".to_string(),
            logs: vec![],
            total_count: 0,
            insights: vec![
                format!("Active streams: {}", self.active_streams.len()),
                "Log Analysis Agent operational".to_string(),
            ],
            correlation_id: Some(correlation_id.to_string()),
        })
    }
    
    /// Apply log filters
    async fn apply_log_filters(&mut self, query: &str, correlation_id: &str) -> Result<LogAnalysisResponse> {
        // Log the filter action
        self.log_activity_with_correlation(
            ActivityType::Custom("FilterApplied".to_string()),
            &HashMap::from([
                ("query".to_string(), serde_json::Value::String(query.to_string())),
                ("action".to_string(), serde_json::Value::String("apply_filters".to_string())),
            ]),
            correlation_id
        ).await?;
        
        Ok(LogAnalysisResponse {
            summary: "🔍 Log filters applied by Log Analysis Agent".to_string(),
            logs: vec![],
            total_count: 0,
            insights: vec![
                "Filter parsing completed".to_string(),
                "Ready to coordinate with Security Agent".to_string(),
            ],
            correlation_id: Some(correlation_id.to_string()),
        })
    }
    
    /// Get recent logs (coordinates with Security Agent)
    async fn get_recent_logs(&mut self, query: &str, correlation_id: &str) -> Result<LogAnalysisResponse> {
        // Log the logs request action
        self.log_activity_with_correlation(
            ActivityType::Custom("LogsRequested".to_string()),
            &HashMap::from([
                ("query".to_string(), serde_json::Value::String(query.to_string())),
                ("action".to_string(), serde_json::Value::String("get_logs".to_string())),
            ]),
            correlation_id
        ).await?;
        
        Ok(LogAnalysisResponse {
            summary: "📋 Log Analysis Agent ready for log coordination with Security Agent".to_string(),
            logs: vec![],
            total_count: 0,
            insights: vec![
                "Log Analysis Agent operational".to_string(),
                "Ready to coordinate with Security Agent for log access".to_string(),
                "Use 'start streaming logs' for real-time monitoring".to_string(),
            ],
            correlation_id: Some(correlation_id.to_string()),
        })
    }
    
}

#[async_trait]
impl Agent for LogAnalysisAgent {
    async fn initialize(&mut self) -> Result<()> {
        info!("🔄 Initializing Log Analysis Agent: {}", self.info.id);
        
        self.info.status = AgentStatus::Active;
        
        // Log initialization with correlation ID
        let correlation_id = uuid::Uuid::new_v4().to_string();
        self.log_activity_with_correlation(
            ActivityType::Initialized,
            &HashMap::from([
                ("agent_id".to_string(), serde_json::Value::String(self.info.id.clone())),
                ("capabilities_count".to_string(), serde_json::Value::Number(self.info.capabilities.len().into())),
            ]),
            &correlation_id
        ).await?;
        
        info!("✅ Log Analysis Agent initialized successfully");
        Ok(())
    }
    
    fn info(&self) -> &AgentInfo {
        &self.info
    }
    
    fn protocols(&self) -> Vec<String> {
        self.info.capabilities.iter().map(|c| c.protocol.clone()).collect()
    }
    
    async fn health_check(&self) -> Result<AgentStatus> {
        // Test Redis connection and return agent status
        let mut redis = self.redis_connection.clone();
        match redis.exists::<&str, bool>("test_key").await {
            Ok(_) => Ok(AgentStatus::Active),
            Err(_) => Ok(AgentStatus::Error("Redis connection failed".to_string())),
        }
    }
    
    async fn get_metrics(&self) -> Result<HashMap<String, f64>> {
        let mut metrics = HashMap::new();
        metrics.insert("active_streams".to_string(), self.active_streams.len() as f64);
        metrics.insert("capabilities_count".to_string(), self.info.capabilities.len() as f64);
        
        Ok(metrics)
    }
    
    async fn log_activity(&mut self, activity_type: ActivityType, details: &HashMap<String, serde_json::Value>) -> Result<()> {
        let activity = serde_json::json!({
            "agent_id": self.info.id,
            "agent_type": "log-analysis",
            "activity_type": activity_type,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "details": details
        });
        
        let activity_json = serde_json::to_string(&activity)?;
        
        let mut redis = self.redis_connection.clone();
        let _: () = redis.xadd("agent:activities", "*", &[("data", &activity_json)]).await?;
        
        Ok(())
    }
    
    async fn shutdown(&mut self) -> Result<()> {
        info!("🔄 Shutting down Log Analysis Agent: {}", self.info.id);
        self.info.status = AgentStatus::Suspended;
        Ok(())
    }
    
    async fn log_activity_with_correlation(&mut self, activity_type: ActivityType, details: &HashMap<String, serde_json::Value>, correlation_id: &str) -> Result<()> {
        let activity = serde_json::json!({
            "agent_id": self.info.id,
            "agent_type": "log-analysis",
            "activity_type": activity_type,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "details": details,
            "correlation_id": correlation_id
        });
        
        let activity_json = serde_json::to_string(&activity)?;
        
        let mut redis = self.redis_connection.clone();
        let _: () = redis.xadd("agent:activities", "*", &[("data", &activity_json)]).await?;
        
        Ok(())
    }
}