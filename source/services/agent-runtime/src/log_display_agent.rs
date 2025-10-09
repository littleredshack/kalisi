use anyhow::Result;
use async_trait::async_trait;
use futures_util::stream::StreamExt;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::info;

use crate::agent::{
    ActivityType, Agent, AgentInfo, AgentStatus, Capability, CognitivePattern, ResourceLimits,
};
use crate::shared_logger::{create_agent_logger, AgentLogger};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamConfig {
    pub active: bool,
    pub filters: LogFilters,
    pub session_id: String,
    pub correlation_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogFilters {
    pub level: Option<String>,
    pub category: Option<String>,
    pub agent: Option<String>,
    pub keyword: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayLogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: String,
    pub category: String,
    pub agent_id: String,
    pub message: String,
    pub data: Option<serde_json::Value>,
    pub correlation_id: Option<String>,
}

/// Log Display Agent - Subscribes to Redis pub/sub and provides streaming logs to frontend
/// Pure event-driven (no polling) log visualization
pub struct LogDisplayAgent {
    info: AgentInfo,
    redis_connection: MultiplexedConnection,
    logger: Box<dyn AgentLogger>,
    active_streams: HashMap<String, StreamConfig>,
    log_buffer: Vec<DisplayLogEntry>,
    pubsub_handle: Option<tokio::task::JoinHandle<()>>,
}

impl LogDisplayAgent {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis_connection = client.get_multiplexed_async_connection().await?;

        let logger = create_agent_logger(redis_url, "log-display-agent").await?;

        let info = AgentInfo {
            id: "log-display-agent-001".to_string(),
            name: "Log Display & Visualization Agent".to_string(),
            cognitive_pattern: CognitivePattern::Systems, // Holistic log visualization
            capabilities: vec![
                Capability {
                    protocol: "log_display.streaming.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Real-time log streaming via Redis pub/sub".to_string(),
                },
                Capability {
                    protocol: "log_display.filtering.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Advanced log filtering and search".to_string(),
                },
                Capability {
                    protocol: "log_display.visualization.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Log visualization and presentation".to_string(),
                },
            ],
            resource_limits: ResourceLimits::default(),
            created_at: chrono::Utc::now(),
            status: AgentStatus::Initializing,
        };

        Ok(LogDisplayAgent {
            info,
            redis_connection,
            logger,
            active_streams: HashMap::new(),
            log_buffer: Vec::new(),
            pubsub_handle: None,
        })
    }

    /// Start streaming logs to frontend via HTTP endpoint
    pub async fn start_log_stream(
        &mut self,
        filters: LogFilters,
        correlation_id: &str,
    ) -> Result<String> {
        let session_id = uuid::Uuid::new_v4().to_string();

        // Log the streaming start
        let mut details = HashMap::new();
        details.insert(
            "session_id".to_string(),
            serde_json::Value::String(session_id.clone()),
        );
        details.insert("filters".to_string(), serde_json::to_value(&filters)?);

        self.logger
            .log_activity(
                self.info.id.clone(),
                ActivityType::Custom("LogStreamStarted".to_string()),
                &details,
                Some(correlation_id.to_string()),
            )
            .await?;

        // Store stream configuration
        let config = StreamConfig {
            active: true,
            filters: filters.clone(),
            session_id: session_id.clone(),
            correlation_id: correlation_id.to_string(),
        };

        self.active_streams.insert(session_id.clone(), config);

        // Start Redis pub/sub subscription for real-time logs IMMEDIATELY
        let handle = self.start_redis_subscription(filters, &session_id).await?;
        self.pubsub_handle = Some(handle);

        info!(
            "🔄 Log Display Agent: Started streaming session {}",
            session_id
        );
        Ok(session_id)
    }

    /// Subscribe to Redis pub/sub channels based on filters
    async fn start_redis_subscription(
        &mut self,
        filters: LogFilters,
        session_id: &str,
    ) -> Result<tokio::task::JoinHandle<()>> {
        // Create new Redis client for pub/sub (MultiplexedConnection doesn't support pub/sub)
        let redis_url =
            std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        let client = redis::Client::open(redis_url.as_str())?;
        let mut pubsub = client.get_async_pubsub().await?;

        // Subscribe to ALL log channels for default "show all" approach
        pubsub.subscribe("logs:stream").await?; // Main application logs
        pubsub.subscribe("logs:category:chat").await?; // Chat activities
        pubsub.subscribe("logs:category:agent").await?; // Agent activities
        pubsub.subscribe("logs:category:api").await?; // API requests
        pubsub.subscribe("logs:category:auth").await?; // Authentication

        // Apply additional filters if specified
        if let Some(level) = &filters.level {
            pubsub.subscribe(&format!("logs:level:{}", level)).await?;
        }
        if let Some(category) = &filters.category {
            pubsub
                .subscribe(&format!("logs:category:{}", category))
                .await?;
        }
        if let Some(agent) = &filters.agent {
            pubsub.subscribe(&format!("logs:agent:{}", agent)).await?;
        }

        // Start background task for real-time log processing and UI state publishing
        let redis_for_publishing = self.redis_connection.clone();
        let session_id_clone = session_id.to_string();

        let handle = tokio::spawn(async move {
            let mut publishing_redis = redis_for_publishing;
            let mut stream = pubsub.on_message();
            let mut log_buffer: Vec<DisplayLogEntry> = Vec::new();

            // Read existing logs from logs:all list first
            let existing_logs: Vec<String> = publishing_redis
                .lrange("logs:all", 0, 100)
                .await
                .unwrap_or_default();
            for existing_log in existing_logs.into_iter().rev() {
                if let Ok(log_data) = serde_json::from_str::<serde_json::Value>(&existing_log) {
                    let agent_id = log_data["service"].as_str().unwrap_or("unknown");
                    let message = log_data["message"].as_str().unwrap_or("");

                    if !agent_id.contains("log-display-agent") {
                        let display_entry = DisplayLogEntry {
                            id: log_data["id"].as_str().unwrap_or("unknown").to_string(),
                            timestamp: log_data["timestamp"].as_str().unwrap_or("").to_string(),
                            level: log_data["level"].as_str().unwrap_or("info").to_string(),
                            category: log_data["category"]
                                .as_str()
                                .unwrap_or("general")
                                .to_string(),
                            agent_id: agent_id.to_string(),
                            message: message.to_string(),
                            data: Some(log_data["data"].clone()),
                            correlation_id: log_data["correlation_id"]
                                .as_str()
                                .map(|s| s.to_string()),
                        };
                        log_buffer.push(display_entry);
                    }
                }
            }

            // Publish initial UI state with existing logs
            let ui_state = serde_json::json!({
                "type": "logs_panel_update",
                "session_id": session_id_clone,
                "mode": "streaming",
                "logs": log_buffer.clone(),
                "count": log_buffer.len(),
                "last_update": chrono::Utc::now().to_rfc3339()
            });
            let ui_json = serde_json::to_string(&ui_state).unwrap();
            let _: Result<(), _> = publishing_redis.publish("ui:logs_panel", &ui_json).await;

            while let Some(msg) = stream.next().await {
                if let Ok(payload) = msg.get_payload::<String>() {
                    // Parse incoming log entry
                    if let Ok(log_data) = serde_json::from_str::<serde_json::Value>(&payload) {
                        // Skip logs from log display agent itself to prevent infinite loops
                        let agent_id = log_data["service"].as_str().unwrap_or("unknown");
                        let message = log_data["message"].as_str().unwrap_or("");

                        // Filter out log display agent's own logs and UI publishing logs
                        if agent_id.contains("log-display-agent")
                            || message.contains("Log Display Agent published")
                            || message.contains("📡 Log Display Agent")
                            || message.contains("ui:logs_panel")
                        {
                            continue; // Skip this log to prevent infinite loops
                        }

                        let display_entry = DisplayLogEntry {
                            id: log_data["id"].as_str().unwrap_or("unknown").to_string(),
                            timestamp: log_data["timestamp"].as_str().unwrap_or("").to_string(),
                            level: log_data["level"].as_str().unwrap_or("info").to_string(),
                            category: log_data["category"]
                                .as_str()
                                .unwrap_or("general")
                                .to_string(),
                            agent_id: agent_id.to_string(),
                            message: message.to_string(),
                            data: Some(log_data["data"].clone()),
                            correlation_id: log_data["correlation_id"]
                                .as_str()
                                .map(|s| s.to_string()),
                        };

                        // Add to buffer (newest first)
                        log_buffer.insert(0, display_entry);

                        // Limit buffer size
                        if log_buffer.len() > 1000 {
                            log_buffer.truncate(1000);
                        }

                        // Publish UI updates for streaming mode (frontend no longer logs these to console)
                        let ui_state = serde_json::json!({
                            "type": "logs_panel_update",
                            "session_id": session_id_clone,
                            "mode": "streaming",
                            "logs": log_buffer.clone(),
                            "count": log_buffer.len(),
                            "last_update": chrono::Utc::now().to_rfc3339()
                        });

                        let ui_json = serde_json::to_string(&ui_state).unwrap();
                        let _: Result<(), _> =
                            publishing_redis.publish("ui:logs_panel", &ui_json).await;
                    }
                }
            }
        });

        info!(
            "📡 Log Display Agent: Redis pub/sub subscription started for session {}",
            session_id
        );

        Ok(handle)
    }

    /// Get current logs for HTTP endpoint
    pub async fn get_streaming_logs(&self, session_id: &str) -> Result<Vec<DisplayLogEntry>> {
        // Validate session
        if !self.active_streams.contains_key(session_id) {
            return Err(anyhow::anyhow!("Invalid session ID"));
        }

        // Return buffered logs
        Ok(self.log_buffer.clone())
    }

    /// Stop streaming session
    pub async fn stop_log_stream(&mut self, session_id: &str, correlation_id: &str) -> Result<()> {
        if let Some(_config) = self.active_streams.remove(session_id) {
            // Log the stop action
            let mut details = HashMap::new();
            details.insert(
                "session_id".to_string(),
                serde_json::Value::String(session_id.to_string()),
            );

            self.logger
                .log_activity(
                    self.info.id.clone(),
                    ActivityType::Custom("LogStreamStopped".to_string()),
                    &details,
                    Some(correlation_id.to_string()),
                )
                .await?;

            info!(
                "🔄 Log Display Agent: Stopped streaming session {}",
                session_id
            );
        }

        Ok(())
    }
}

#[async_trait]
impl Agent for LogDisplayAgent {
    async fn initialize(&mut self) -> Result<()> {
        info!("📺 Initializing Log Display Agent: {}", self.info.id);

        self.info.status = AgentStatus::Active;

        // Log initialization using shared logger
        let correlation_id = uuid::Uuid::new_v4().to_string();
        let mut details = HashMap::new();
        details.insert(
            "agent_id".to_string(),
            serde_json::Value::String(self.info.id.clone()),
        );

        self.logger
            .log_activity(
                self.info.id.clone(),
                ActivityType::Initialized,
                &details,
                Some(correlation_id),
            )
            .await?;

        info!("✅ Log Display Agent initialized successfully");
        Ok(())
    }

    fn info(&self) -> &AgentInfo {
        &self.info
    }

    fn protocols(&self) -> Vec<String> {
        self.info
            .capabilities
            .iter()
            .map(|c| c.protocol.clone())
            .collect()
    }

    async fn health_check(&self) -> Result<AgentStatus> {
        let mut redis = self.redis_connection.clone();
        match redis.exists::<&str, bool>("test_key").await {
            Ok(_) => Ok(AgentStatus::Active),
            Err(_) => Ok(AgentStatus::Error("Redis connection failed".to_string())),
        }
    }

    async fn get_metrics(&self) -> Result<HashMap<String, f64>> {
        let mut metrics = HashMap::new();
        metrics.insert(
            "active_streams".to_string(),
            self.active_streams.len() as f64,
        );
        metrics.insert("log_buffer_size".to_string(), self.log_buffer.len() as f64);

        Ok(metrics)
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("📺 Shutting down Log Display Agent: {}", self.info.id);
        self.info.status = AgentStatus::Suspended;
        Ok(())
    }

    async fn log_activity(
        &mut self,
        activity_type: ActivityType,
        details: &HashMap<String, serde_json::Value>,
    ) -> Result<()> {
        self.logger
            .log_activity(self.info.id.clone(), activity_type, details, None)
            .await
    }

    async fn log_activity_with_correlation(
        &mut self,
        activity_type: ActivityType,
        details: &HashMap<String, serde_json::Value>,
        correlation_id: &str,
    ) -> Result<()> {
        self.logger
            .log_activity(
                self.info.id.clone(),
                activity_type,
                details,
                Some(correlation_id.to_string()),
            )
            .await
    }
}
