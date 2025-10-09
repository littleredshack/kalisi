use anyhow::Result;
use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::info;

use crate::agent::{
    ActivityType, Agent, AgentInfo, AgentStatus, Capability, CognitivePattern, ResourceLimits,
};

/// Chat Agent response for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub summary: String,
    pub message_type: String, // "confirmation", "streaming", "error", "routing"
    pub routed_to: Option<String>, // Which agent the request was routed to
    pub correlation_id: Option<String>,
    pub streaming_enabled: bool, // Indicates if this triggers streaming mode
}

/// Chat Agent - Routes user commands to appropriate specialized agents
/// Follows same MRAP pattern as other agents
pub struct ChatAgent {
    info: AgentInfo,
    redis_connection: MultiplexedConnection,
    command_history: Vec<String>,
}

impl ChatAgent {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis_connection = client.get_multiplexed_async_connection().await?;

        let info = AgentInfo {
            id: "chat-agent-001".to_string(),
            name: "Chat Command Router Agent".to_string(),
            cognitive_pattern: CognitivePattern::Systems, // Holistic routing and coordination
            capabilities: vec![
                Capability {
                    protocol: "chat.command_routing.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Routes user commands to appropriate specialized agents"
                        .to_string(),
                },
                Capability {
                    protocol: "chat.coordination.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Coordinates multi-agent interactions for user requests"
                        .to_string(),
                },
                Capability {
                    protocol: "chat.filtering.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Parses and routes filtering commands".to_string(),
                },
            ],
            resource_limits: ResourceLimits::default(),
            created_at: chrono::Utc::now(),
            status: AgentStatus::Initializing,
        };

        Ok(ChatAgent {
            info,
            redis_connection,
            command_history: Vec::new(),
        })
    }

    /// Process user chat commands using MRAP workflow
    pub async fn process_query(&mut self, query: &str) -> Result<ChatResponse> {
        let correlation_id = uuid::Uuid::new_v4().to_string();

        // Log MRAP start
        self.log_activity_with_correlation(
            ActivityType::MrapStarted,
            &HashMap::from([(
                "query".to_string(),
                serde_json::Value::String(query.to_string()),
            )]),
            &correlation_id,
        )
        .await?;

        // EXPLICIT: Log the chat message for logs panel display
        self.log_activity_with_correlation(
            ActivityType::Custom("ChatMessageReceived".to_string()),
            &HashMap::from([
                (
                    "message".to_string(),
                    serde_json::Value::String(query.to_string()),
                ),
                (
                    "user_message".to_string(),
                    serde_json::Value::String(format!("User: {}", query)),
                ),
            ]),
            &correlation_id,
        )
        .await?;

        // DIRECT: Add user message to logs:all for immediate display
        let user_log = serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "level": "Info",
            "category": "Chat",
            "message": format!("💬 User: {}", query),
            "service": "chat-agent",
            "user_id": null,
            "ip_address": null,
            "data": {"user_message": query, "type": "user_input"},
            "correlation_id": correlation_id
        });

        let user_log_json = serde_json::to_string(&user_log)?;
        let _: () = self
            .redis_connection
            .lpush("logs:all", &user_log_json)
            .await?;

        // Store command in history
        self.command_history.push(query.to_string());
        if self.command_history.len() > 100 {
            self.command_history.remove(0);
        }

        // Route command to appropriate agent
        let response = self.route_command(query, &correlation_id).await?;

        // Log completion
        self.log_activity_with_correlation(
            ActivityType::ActionTaken,
            &HashMap::from([
                (
                    "routed_to".to_string(),
                    serde_json::Value::String(
                        response.routed_to.clone().unwrap_or("none".to_string()),
                    ),
                ),
                (
                    "message_type".to_string(),
                    serde_json::Value::String(response.message_type.clone()),
                ),
            ]),
            &correlation_id,
        )
        .await?;

        Ok(response)
    }

    /// Route user commands to appropriate specialized agents
    async fn route_command(&mut self, query: &str, correlation_id: &str) -> Result<ChatResponse> {
        let lower = query.to_lowercase();

        // Log routing analysis
        self.log_activity_with_correlation(
            ActivityType::ReasonPhase,
            &HashMap::from([(
                "analyzing_command".to_string(),
                serde_json::Value::String(query.to_string()),
            )]),
            correlation_id,
        )
        .await?;

        // Determine routing target and response mode
        let (target_agent, command_type, is_streaming) =
            if self.is_streaming_command(&lower) || self.is_filter_command(&lower) {
                ("log-display-agent", "log_streaming", true) // Route to Log Display Agent for streaming
            } else if self.is_log_query(&lower) {
                ("security-agent", "log_query", false)
            } else {
                ("security-agent", "general_query", false) // Default fallback
            };

        // Send request to target agent
        let agent_request = serde_json::json!({
            "request_id": correlation_id,
            "agent_type": target_agent,
            "message": query,
            "timestamp": chrono::Utc::now(),
            "routed_by": "chat-agent"
        });

        let mut redis = self.redis_connection.clone();
        let request_json = serde_json::to_string(&agent_request)?;
        let _: () = redis
            .xadd("agent:requests", "*", &[("data", &request_json)])
            .await?;

        // Log the routing action
        self.log_activity_with_correlation(
            ActivityType::ActPhase,
            &HashMap::from([
                (
                    "routed_to".to_string(),
                    serde_json::Value::String(target_agent.to_string()),
                ),
                (
                    "command_type".to_string(),
                    serde_json::Value::String(command_type.to_string()),
                ),
            ]),
            correlation_id,
        )
        .await?;

        // Wait for response from target agent
        let _agent_response = self.wait_for_agent_response(correlation_id).await?;

        // Return chat confirmation with streaming indicator
        Ok(ChatResponse {
            summary: self.generate_confirmation(&lower, target_agent),
            message_type: if is_streaming {
                "streaming".to_string()
            } else {
                "confirmation".to_string()
            },
            routed_to: Some(target_agent.to_string()),
            correlation_id: Some(correlation_id.to_string()),
            streaming_enabled: is_streaming,
        })
    }

    /// Generate user-friendly confirmation message
    fn generate_confirmation(&self, query: &str, target_agent: &str) -> String {
        if query.contains("streaming") {
            "✅ Log streaming command sent to Log Analysis Agent".to_string()
        } else if query.contains("filter") {
            "✅ Log filter command sent to Log Analysis Agent".to_string()
        } else if query.contains("log") {
            "✅ Log query sent to Security Agent".to_string()
        } else {
            format!("✅ Command routed to {}", target_agent)
        }
    }

    /// Wait for response from target agent
    async fn wait_for_agent_response(&mut self, request_id: &str) -> Result<serde_json::Value> {
        let mut redis = self.redis_connection.clone();

        // Poll for response with timeout (5 seconds) with less aggressive polling
        for _attempt in 0..25 {
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

            match redis
                .xread::<&str, &str, redis::streams::StreamReadReply>(&["agent:responses"], &["0"])
                .await
            {
                Ok(streams) => {
                    for stream in streams.keys {
                        for entry in stream.ids {
                            if let Some(redis::Value::BulkString(data)) = entry.map.get("data") {
                                if let Ok(json_str) = String::from_utf8(data.clone()) {
                                    if let Ok(response) =
                                        serde_json::from_str::<serde_json::Value>(&json_str)
                                    {
                                        if response["request_id"] == request_id {
                                            return Ok(response);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Err(_) => continue,
            }
        }

        Ok(serde_json::json!({"response": "Agent response timeout"}))
    }

    /// Check if command is streaming-related
    fn is_streaming_command(&self, query: &str) -> bool {
        (query.contains("streaming") && query.contains("logs"))
            || (query.contains("stream") && query.contains("logs"))
            || query.contains("real-time logs")
            || query.contains("live logs")
            || (query.contains("show") && query.contains("streaming"))
    }

    /// Check if command is filter-related
    fn is_filter_command(&self, query: &str) -> bool {
        query.contains("filter")
            || query.contains("only show")
            || query.contains("only")
            || (query.contains("logs") && (query.contains("by") || query.contains("from")))
    }

    /// Check if command is general log query
    fn is_log_query(&self, query: &str) -> bool {
        query.contains("log")
            || query.contains("error")
            || query.contains("show me")
            || query.contains("what happened")
            || query.contains("auth")
            || query.contains("security")
            || query.contains("login")
    }
}

#[async_trait]
impl Agent for ChatAgent {
    async fn initialize(&mut self) -> Result<()> {
        info!("🗣️ Initializing Chat Agent: {}", self.info.id);

        self.info.status = AgentStatus::Active;

        // Log initialization
        let correlation_id = uuid::Uuid::new_v4().to_string();
        self.log_activity_with_correlation(
            ActivityType::Initialized,
            &HashMap::from([
                (
                    "agent_id".to_string(),
                    serde_json::Value::String(self.info.id.clone()),
                ),
                (
                    "capabilities_count".to_string(),
                    serde_json::Value::Number(self.info.capabilities.len().into()),
                ),
            ]),
            &correlation_id,
        )
        .await?;

        info!("✅ Chat Agent initialized successfully");
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
            "commands_processed".to_string(),
            self.command_history.len() as f64,
        );
        metrics.insert(
            "capabilities_count".to_string(),
            self.info.capabilities.len() as f64,
        );

        Ok(metrics)
    }

    async fn shutdown(&mut self) -> Result<()> {
        info!("🗣️ Shutting down Chat Agent: {}", self.info.id);
        self.info.status = AgentStatus::Suspended;
        Ok(())
    }

    async fn log_activity(
        &mut self,
        activity_type: ActivityType,
        details: &HashMap<String, serde_json::Value>,
    ) -> Result<()> {
        let activity = serde_json::json!({
            "agent_id": self.info.id,
            "agent_type": "chat-agent",
            "activity_type": activity_type,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "details": details
        });

        let activity_json = serde_json::to_string(&activity)?;

        let mut redis = self.redis_connection.clone();
        let _: () = redis
            .xadd("agent:activities", "*", &[("data", &activity_json)])
            .await?;

        Ok(())
    }

    async fn log_activity_with_correlation(
        &mut self,
        activity_type: ActivityType,
        details: &HashMap<String, serde_json::Value>,
        correlation_id: &str,
    ) -> Result<()> {
        let activity = serde_json::json!({
            "agent_id": self.info.id,
            "agent_type": "chat-agent",
            "activity_type": activity_type,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "details": details,
            "correlation_id": correlation_id
        });

        let activity_json = serde_json::to_string(&activity)?;

        let mut redis = self.redis_connection.clone();
        let _: () = redis
            .xadd("agent:activities", "*", &[("data", &activity_json)])
            .await?;

        Ok(())
    }
}
