use anyhow::Result;
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::time::{sleep, Duration};
use tracing::{info, error, debug};
use agent_runtime::{SecurityAgent, LogAnalysisAgent, ChatAgent, LogDisplayAgent, LogFilters, Agent};

/// Agent request message format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRequest {
    pub request_id: String,
    pub agent_type: String,
    pub message: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Agent response message format  
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentResponse {
    pub request_id: String,
    pub agent_type: String,
    pub response: String,
    pub success: bool,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Agent Runtime Service - manages autonomous agents
pub struct AgentRuntimeService {
    redis: MultiplexedConnection,
    security_agent: Option<SecurityAgent>,
    log_analysis_agent: Option<LogAnalysisAgent>,
    chat_agent: Option<ChatAgent>,
    log_display_agent: Option<LogDisplayAgent>,
}

impl AgentRuntimeService {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = Client::open(redis_url)?;
        let redis = client.get_multiplexed_async_connection().await?;
        
        Ok(Self {
            redis,
            security_agent: None,
            log_analysis_agent: None,
            chat_agent: None,
            log_display_agent: None,
        })
    }
    
    pub async fn start(&mut self) -> Result<()> {
        info!("🤖 Agent Runtime Service starting...");
        
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        
        // Clear old messages on startup if configured
        let clear_old_messages = std::env::var("CLEAR_OLD_MESSAGES_ON_STARTUP")
            .unwrap_or_else(|_| "false".to_string()) == "true";
            
        if clear_old_messages {
            info!("🧹 Clearing old Redis messages on startup...");
            let client = redis::Client::open(redis_url.as_str())?;
            let mut redis = client.get_multiplexed_async_connection().await?;
            
            // Clear old requests and responses to start fresh
            let _: () = redis::cmd("XTRIM")
                .arg("agent:requests")
                .arg("MAXLEN")
                .arg("0")
                .query_async(&mut redis)
                .await?;
                
            let _: () = redis::cmd("XTRIM")
                .arg("agent:responses") 
                .arg("MAXLEN")
                .arg("0")
                .query_async(&mut redis)
                .await?;
                
            info!("✅ Old messages cleared for clean startup");
        }
        
        // Initialize Security Agent
        let mut security_agent = SecurityAgent::new(&redis_url).await?;
        security_agent.initialize().await?;
        self.security_agent = Some(security_agent);
        
        info!("✅ Security Agent initialized");
        
        // Initialize Log Analysis Agent
        let mut log_analysis_agent = LogAnalysisAgent::new(&redis_url).await?;
        log_analysis_agent.initialize().await?;
        self.log_analysis_agent = Some(log_analysis_agent);
        
        info!("✅ Log Analysis Agent initialized");
        
        // Initialize Chat Agent
        let mut chat_agent = ChatAgent::new(&redis_url).await?;
        chat_agent.initialize().await?;
        self.chat_agent = Some(chat_agent);
        
        info!("✅ Chat Agent initialized");
        
        // Initialize Log Display Agent (but don't auto-start streaming)
        let mut log_display_agent = LogDisplayAgent::new(&redis_url).await?;
        log_display_agent.initialize().await?;
        self.log_display_agent = Some(log_display_agent);

        info!("✅ Log Display Agent initialized (not auto-streaming)");

        // Start message bus listener
        self.listen_for_requests().await
    }
    
    async fn listen_for_requests(&mut self) -> Result<()> {
        info!("📡 Listening for agent requests on Redis streams...");
        
        // Use reliable stream reading for financial services
        let mut last_id = "0".to_string(); // Start from beginning to catch any missed messages
        
        loop {
            // Read from agent request stream with reliable delivery
            let result: Result<redis::streams::StreamReadReply, _> = self.redis
                .xread_options(
                    &["agent:requests"],
                    &[&last_id],
                    &redis::streams::StreamReadOptions::default()
                        .count(1)
                        .block(1000), // Block for 1 second
                )
                .await;
                
            match result {
                Ok(reply) => {
                    for stream in reply.keys {
                        for entry in stream.ids {
                            if let Err(e) = self.process_request(&entry.id, &entry.map).await {
                                error!("Failed to process request {}: {:?}", entry.id, e);
                            }
                            // Update last processed ID for reliable sequential processing
                            last_id = entry.id.clone();
                        }
                    }
                }
                Err(redis::RedisError { .. }) => {
                    // Timeout or connection issue, continue
                    debug!("Redis read timeout, continuing...");
                }
            }
            
            sleep(Duration::from_millis(100)).await;
        }
    }
    
    async fn process_request(&mut self, _request_id: &str, data: &HashMap<String, redis::Value>) -> Result<()> {
        // Parse request data
        let request_json = data.get("data")
            .and_then(|v| match v {
                redis::Value::BulkString(bytes) => String::from_utf8(bytes.clone()).ok(),
                _ => None,
            })
            .ok_or_else(|| anyhow::anyhow!("Invalid request data"))?;
            
        let request: AgentRequest = serde_json::from_str(&request_json)?;
        
        info!("📨 Processing request {}: {} -> {}", request.request_id, request.agent_type, request.message);
        
        // Route to appropriate agent
        let response_text = match request.agent_type.as_str() {
            "chat-agent" => {
                if let Some(ref mut agent) = self.chat_agent {
                    match agent.process_query(&request.message).await {
                        Ok(response) => {
                            let mut content = response.summary.clone();
                            
                            if let Some(routed_to) = response.routed_to {
                                content.push_str(&format!("\n**Routed to**: {}", routed_to));
                            }
                            
                            content
                        }
                        Err(e) => format!("Chat Agent error: {}", e),
                    }
                } else {
                    "Chat Agent not initialized".to_string()
                }
            }
            "log-display-agent" => {
                if let Some(ref mut agent) = self.log_display_agent {
                    // Only start streaming for explicit streaming requests
                    let message_lower = request.message.to_lowercase();
                    if message_lower.contains("streaming") || message_lower.contains("stream") {
                        // Start streaming for explicit streaming requests
                        match agent.start_log_stream(
                            LogFilters {
                                level: None,
                                category: None,
                                agent: None,
                                keyword: None,
                            },
                            &request.request_id
                        ).await {
                            Ok(session_id) => {
                                format!("✅ Log streaming started - Session: {}", session_id)
                            }
                            Err(e) => format!("Log Display Agent error: {}", e),
                        }
                    } else {
                        // For non-streaming requests, just return a simple response without starting streams
                        format!("✅ Log Display Agent ready - use 'streaming logs' to start live feed")
                    }
                } else {
                    "Log Display Agent not initialized".to_string()
                }
            }
            "log-analysis-agent" => {
                if let Some(ref mut agent) = self.log_analysis_agent {
                    match agent.process_query(&request.message).await {
                        Ok(response) => {
                            let mut content = response.summary.clone();
                            
                            // Format Log Analysis Agent response
                            if !response.insights.is_empty() {
                                content.push_str("\n\n**Insights:**\n");
                                for insight in &response.insights {
                                    content.push_str(&format!("• {}\n", insight));
                                }
                            }
                            
                            if !response.logs.is_empty() {
                                content.push_str("\n\n**Logs:**\n");
                                for (i, log) in response.logs.iter().take(20).enumerate() {
                                    content.push_str(&format!(
                                        "{:2}. [{}] {} - {}\n",
                                        i + 1,
                                        log.level,
                                        log.service,
                                        log.message
                                    ));
                                }
                            }
                            
                            content
                        }
                        Err(e) => format!("Log Analysis Agent error: {}", e),
                    }
                } else {
                    "Log Analysis Agent not initialized".to_string()
                }
            }
            "security-agent" => {
                if let Some(ref mut agent) = self.security_agent {
                    match agent.process_query(&request.message).await {
                        Ok(response) => {
                            // Format response like the original
                            let mut content = response.summary.clone();
                            
                            if !response.insights.is_empty() {
                                content.push_str("\n\n**Insights:**\n");
                                for insight in &response.insights {
                                    content.push_str(&format!("• {}\n", insight));
                                }
                            }
                            
                            if !response.logs.is_empty() {
                                content.push_str("\n\n**Recent Logs:**\n```\n");
                                for (i, log) in response.logs.iter().take(10).enumerate() {
                                    content.push_str(&format!(
                                        "{:3}. [{:5}] {} - {}\n", 
                                        i + 1,
                                        log.level.replace("String(\"", "").replace("\")", ""),
                                        log.category.replace("String(\"", "").replace("\")", ""),
                                        log.message
                                    ));
                                }
                                content.push_str("```");
                            }
                            
                            content
                        }
                        Err(e) => format!("Security Agent error: {}", e),
                    }
                } else {
                    "Security Agent not initialized".to_string()
                }
            }
            _ => {
                format!("Unknown agent type: {}", request.agent_type)
            }
        };
        
        // Send response back via Redis
        let success = !response_text.contains("error") && !response_text.contains("not initialized");
        let response = AgentResponse {
            request_id: request.request_id.clone(),
            agent_type: request.agent_type.clone(),
            response: response_text.clone(),
            success,
            timestamp: chrono::Utc::now(),
        };
        
        let response_json = serde_json::to_string(&response)?;
        let _: () = self.redis.xadd("agent:responses", "*", &[("data", response_json)]).await?;
        
        info!("📤 Response sent for request {}", request.request_id);
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt::init();
    
    // Load environment
    dotenv::dotenv().ok();
    
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    
    let mut service = AgentRuntimeService::new(&redis_url).await?;
    service.start().await?;
    
    Ok(())
}