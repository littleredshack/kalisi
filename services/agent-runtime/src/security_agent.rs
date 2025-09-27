use async_trait::async_trait;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, debug};
use anyhow::Result;

use crate::{
    agent::{Agent, AgentInfo, AgentStatus, Capability, CognitivePattern, ResourceLimits, ActivityType, AgentActivity},
    mrap::{MrapLoop, MrapState, ReasoningResult, ActionRecord, RiskLevel},
};


/// Security Agent query request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogQueryRequest {
    pub query: String,
    pub limit: Option<usize>,
    pub category: Option<String>,
    pub level: Option<String>,
    pub time_range: Option<String>,
}

/// Security Agent query response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogQueryResponse {
    pub summary: String,
    pub logs: Vec<SimpleLogEntry>,
    pub total_count: usize,
    pub insights: Vec<String>,
}

/// Simple log entry for parsing responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleLogEntry {
    pub timestamp: String,
    pub level: String,
    pub category: String,
    pub message: String,
    pub service: String,
}

/// Security Agent - handles log queries and security monitoring
pub struct SecurityAgent {
    info: AgentInfo,
    redis: MultiplexedConnection,
    query_history: Vec<String>,
    learned_patterns: HashMap<String, f32>,
}

impl SecurityAgent {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis = client.get_multiplexed_async_connection().await?;
        
        let info = AgentInfo {
            id: "security-agent-001".to_string(),
            name: "Security Monitor".to_string(),
            cognitive_pattern: CognitivePattern::Critical,  // Analytical for security
            capabilities: vec![
                Capability {
                    protocol: "security.logs.query.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Query and analyze security logs".to_string(),
                },
                Capability {
                    protocol: "security.monitor.v1".to_string(),
                    version: "1.0.0".to_string(),
                    description: "Monitor security events".to_string(),
                },
            ],
            resource_limits: ResourceLimits::default(),
            created_at: chrono::Utc::now(),
            status: AgentStatus::Initializing,
        };
        
        Ok(Self {
            info,
            redis,
            query_history: Vec::new(),
            learned_patterns: HashMap::new(),
        })
    }
    
    /// Process a natural language query like "show me the logs"
    pub async fn process_query(&mut self, query: &str) -> Result<LogQueryResponse> {
        // Generate correlation ID for this entire workflow
        let correlation_id = uuid::Uuid::new_v4().to_string();
        
        // Log process start
        let mut details = HashMap::new();
        details.insert("process_name".to_string(), serde_json::Value::String("log_query".to_string()));
        details.insert("query".to_string(), serde_json::Value::String(query.to_string()));
        self.log_activity_with_correlation(ActivityType::ProcessStarted, &details, &correlation_id).await?;
        
        // Execute MRAP loop for this query
        let mrap_state = self.execute_mrap_for_query(query, &correlation_id).await?;
        
        // Log process completion
        let mut completion_details = HashMap::new();
        completion_details.insert("process_name".to_string(), serde_json::Value::String("log_query".to_string()));
        completion_details.insert("success".to_string(), serde_json::Value::Bool(mrap_state.action_taken.as_ref().map(|a| a.success).unwrap_or(false)));
        self.log_activity_with_correlation(ActivityType::ProcessCompleted, &completion_details, &correlation_id).await?;
        
        // Extract results from MRAP state
        if let Some(action) = mrap_state.action_taken {
            if let Some(result) = action.result {
                if let Ok(response) = serde_json::from_value::<LogQueryResponse>(result) {
                    return Ok(response);
                }
            }
        }
        
        // Fallback response
        Ok(LogQueryResponse {
            summary: "No logs found matching your query.".to_string(),
            logs: Vec::new(),
            total_count: 0,
            insights: mrap_state.reflection_insights,
        })
    }
    
    async fn execute_mrap_for_query(&mut self, query: &str, correlation_id: &str) -> Result<MrapState> {
        // Store query for learning
        self.query_history.push(query.to_string());
        
        // Log MRAP start
        let mut mrap_details = HashMap::new();
        mrap_details.insert("query".to_string(), serde_json::Value::String(query.to_string()));
        mrap_details.insert("cognitive_pattern".to_string(), serde_json::Value::String(format!("{:?}", self.info.cognitive_pattern)));
        self.log_activity_with_correlation(ActivityType::MrapStarted, &mrap_details, &correlation_id).await?;
        
        // Create a temporary MRAP executor for this query
        let mut mrap = SecurityMrapExecutor {
            agent: self,
            query: query.to_string(),
            correlation_id: correlation_id.to_string(),
        };
        
        let state = mrap.execute_mrap().await?;
        
        // Log MRAP completion
        let mut completion_details = HashMap::new();
        completion_details.insert("success".to_string(), serde_json::Value::Bool(state.action_taken.as_ref().map(|a| a.success).unwrap_or(false)));
        completion_details.insert("duration_ms".to_string(), serde_json::Value::Number(serde_json::Number::from((chrono::Utc::now() - state.started_at).num_milliseconds())));
        self.log_activity_with_correlation(ActivityType::MrapCompleted, &completion_details, &correlation_id).await?;
        
        Ok(state)
    }
    
    /// Parse natural language query to determine parameters
    fn parse_query(&self, query: &str) -> LogQueryRequest {
        let lower = query.to_lowercase();
        
        // Determine limit
        let limit = if lower.contains("all") {
            Some(1000)
        } else if lower.contains("last") {
            if let Some(num) = self.extract_number(&lower) {
                Some(num)
            } else {
                Some(100)
            }
        } else {
            Some(100)
        };
        
        // Determine category
        let category = if lower.contains("auth") {
            Some("AUTH".to_string())
        } else if lower.contains("error") {
            Some("ERROR".to_string())
        } else if lower.contains("security") {
            Some("SECURITY".to_string())
        } else if lower.contains("chat") {
            Some("CHAT".to_string())
        } else {
            None
        };
        
        // Determine level
        let level = if lower.contains("error") || lower.contains("critical") {
            Some("error".to_string())
        } else if lower.contains("warn") {
            Some("warn".to_string())
        } else if lower.contains("info") {
            Some("info".to_string())
        } else {
            None
        };
        
        // Determine time range
        let time_range = if lower.contains("today") {
            Some("today".to_string())
        } else if lower.contains("hour") {
            Some("1h".to_string())
        } else if lower.contains("minute") {
            Some("5m".to_string())
        } else {
            None
        };
        
        LogQueryRequest {
            query: query.to_string(),
            limit,
            category,
            level,
            time_range,
        }
    }
    
    fn extract_number(&self, text: &str) -> Option<usize> {
        let words: Vec<&str> = text.split_whitespace().collect();
        for (i, word) in words.iter().enumerate() {
            if word == &"last" && i + 1 < words.len() {
                if let Ok(num) = words[i + 1].parse::<usize>() {
                    return Some(num);
                }
            }
        }
        None
    }
    
    /// Fetch logs from Redis (using existing CentralLogger structure)
    async fn fetch_logs(&mut self, request: &LogQueryRequest) -> Result<Vec<SimpleLogEntry>> {
        // Determine which Redis list to query
        let key = if let Some(cat) = &request.category {
            format!("logs:category:{}", cat.to_lowercase())
        } else if let Some(lvl) = &request.level {
            format!("logs:level:{}", lvl)
        } else {
            "logs:all".to_string()
        };
        
        let limit = request.limit.unwrap_or(100) as isize;
        
        // Get logs from Redis
        let entries: Vec<String> = self.redis.lrange(&key, 0, limit - 1).await?;
        
        let mut logs = Vec::new();
        for json_str in entries {
            if let Ok(entry) = serde_json::from_str::<serde_json::Value>(&json_str) {
                logs.push(SimpleLogEntry {
                    timestamp: entry["timestamp"].as_str().unwrap_or("").to_string(),
                    level: format!("{:?}", entry["level"]),
                    category: format!("{:?}", entry["category"]),
                    message: entry["message"].as_str().unwrap_or("").to_string(),
                    service: entry["service"].as_str().unwrap_or("api-gateway").to_string(),
                });
            }
        }
        
        Ok(logs)
    }
}

#[async_trait]
impl Agent for SecurityAgent {
    fn info(&self) -> &AgentInfo {
        &self.info
    }
    
    fn protocols(&self) -> Vec<String> {
        self.info.capabilities.iter()
            .map(|c| c.protocol.clone())
            .collect()
    }
    
    async fn initialize(&mut self) -> Result<()> {
        self.info.status = AgentStatus::Active;
        info!("Security Agent initialized with cognitive pattern: {:?}", self.info.cognitive_pattern);
        
        // Test Redis connection and log initialization
        let mut init_details = HashMap::new();
        init_details.insert("cognitive_pattern".to_string(), serde_json::Value::String(format!("{:?}", self.info.cognitive_pattern)));
        init_details.insert("capabilities_count".to_string(), serde_json::Value::Number(serde_json::Number::from(self.info.capabilities.len())));
        
        if let Err(e) = self.log_activity(ActivityType::Initialized, &init_details).await {
            tracing::error!("Failed to log Security Agent initialization: {:?}", e);
        } else {
            info!("Security Agent initialization logged successfully");
        }
        
        Ok(())
    }
    
    async fn shutdown(&mut self) -> Result<()> {
        self.info.status = AgentStatus::Suspended;
        info!("Security Agent shutting down");
        Ok(())
    }
    
    async fn health_check(&self) -> Result<AgentStatus> {
        Ok(self.info.status.clone())
    }
    
    async fn get_metrics(&self) -> Result<HashMap<String, f64>> {
        let mut metrics = HashMap::new();
        metrics.insert("queries_processed".to_string(), self.query_history.len() as f64);
        metrics.insert("patterns_learned".to_string(), self.learned_patterns.len() as f64);
        Ok(metrics)
    }
    
    /// MANDATORY: Log agent activity to Redis for Graph Agent consumption
    async fn log_activity(&mut self, activity_type: ActivityType, details: &HashMap<String, serde_json::Value>) -> anyhow::Result<()> {
        let activity = AgentActivity {
            agent_id: self.info.id.clone(),
            activity_type: activity_type.clone(),
            timestamp: chrono::Utc::now(),
            details: details.clone(),
            correlation_id: None,
        };
        
        // Log to Redis stream for Graph Agent
        let activity_json = serde_json::to_string(&activity)?;
        info!("SecurityAgent logging activity: {:?} to Redis stream agent:activities", activity_type);
        debug!("Activity JSON: {}", activity_json);
        
        match self.redis.xadd::<&str, &str, &str, String, ()>("agent:activities", "*", &[("data", activity_json)]).await {
            Ok(_) => {
                info!("Successfully logged activity to Redis stream");
                
                // Also log to main logs for human visibility
                let log_entry = crate::agent::CentralLogEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    timestamp: chrono::Utc::now(),
                    level: crate::agent::LogLevel::Info,
                    category: crate::agent::LogCategory::Agent,
                    message: format!("🤖 Security Agent: {:?}", activity_type),
                    service: "security-agent".to_string(),
                    user_id: None,
                    ip_address: None,
                    data: Some(details.clone()),
                };
                
                if let Ok(log_json) = serde_json::to_string(&log_entry) {
                    let _: Result<(), _> = self.redis.lpush("logs:all", log_json.clone()).await;
                    let category_key = format!("logs:category:agent");
                    let _: Result<(), _> = self.redis.lpush(&category_key, log_json).await;
                }
                
                Ok(())
            }
            Err(e) => {
                tracing::error!("Failed to log activity to Redis: {:?}", e);
                Err(anyhow::anyhow!("Redis logging failed: {}", e))
            }
        }
    }
    
    /// MANDATORY: Log with correlation ID for workflow tracing
    async fn log_activity_with_correlation(&mut self, activity_type: ActivityType, details: &HashMap<String, serde_json::Value>, correlation_id: &str) -> anyhow::Result<()> {
        let activity = AgentActivity {
            agent_id: self.info.id.clone(),
            activity_type: activity_type.clone(),
            timestamp: chrono::Utc::now(),
            details: details.clone(),
            correlation_id: Some(correlation_id.to_string()),
        };
        
        // Log to Redis stream for Graph Agent
        let activity_json = serde_json::to_string(&activity)?;
        debug!("SecurityAgent logging correlated activity: {:?} [{}] to Redis stream agent:activities", activity_type, correlation_id);
        debug!("Activity JSON: {}", activity_json);
        
        match self.redis.xadd::<&str, &str, &str, String, ()>("agent:activities", "*", &[("data", activity_json)]).await {
            Ok(_) => {
                debug!("Successfully logged correlated activity to Redis stream");
                
                // Also log to main logs for human visibility
                let log_entry = crate::agent::CentralLogEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    timestamp: chrono::Utc::now(),
                    level: crate::agent::LogLevel::Info,
                    category: crate::agent::LogCategory::Agent,
                    message: format!("🤖 Security Agent: {:?} [{}]", activity_type, correlation_id),
                    service: "security-agent".to_string(),
                    user_id: None,
                    ip_address: None,
                    data: Some(details.clone()),
                };
                
                if let Ok(log_json) = serde_json::to_string(&log_entry) {
                    let _: Result<(), _> = self.redis.lpush("logs:all", log_json.clone()).await;
                    let category_key = format!("logs:category:agent");
                    let _: Result<(), _> = self.redis.lpush(&category_key, log_json).await;
                }
                
                Ok(())
            }
            Err(e) => {
                tracing::error!("Failed to log correlated activity to Redis: {:?}", e);
                Err(anyhow::anyhow!("Redis logging failed: {}", e))
            }
        }
    }
}

/// MRAP executor for Security Agent queries
struct SecurityMrapExecutor<'a> {
    agent: &'a mut SecurityAgent,
    query: String,
    correlation_id: String,
}

#[async_trait]
impl<'a> MrapLoop for SecurityMrapExecutor<'a> {
    async fn monitor(&mut self) -> Result<HashMap<String, serde_json::Value>> {
        // Log MRAP Monitor phase entry
        let mut phase_details = HashMap::new();
        phase_details.insert("phase".to_string(), serde_json::Value::String("monitor".to_string()));
        phase_details.insert("query".to_string(), serde_json::Value::String(self.query.clone()));
        self.agent.log_activity_with_correlation(ActivityType::MonitorPhase, &&phase_details, &self.correlation_id).await?;
        
        let mut data = HashMap::new();
        
        // Monitor current log state
        let total_logs: usize = self.agent.redis.llen("logs:all").await.unwrap_or(0);
        let error_count: usize = self.agent.redis.llen("logs:level:error").await.unwrap_or(0);
        let auth_count: usize = self.agent.redis.llen("logs:category:auth").await.unwrap_or(0);
        
        data.insert("total_logs".to_string(), serde_json::json!(total_logs));
        data.insert("error_count".to_string(), serde_json::json!(error_count));
        data.insert("auth_count".to_string(), serde_json::json!(auth_count));
        data.insert("query".to_string(), serde_json::json!(self.query));
        
        debug!("Monitor phase: Found {} total logs", total_logs);
        
        Ok(data)
    }
    
    async fn reason(&mut self, monitor_data: &HashMap<String, serde_json::Value>) -> Result<ReasoningResult> {
        // Log MRAP Reason phase entry
        let mut phase_details = HashMap::new();
        phase_details.insert("phase".to_string(), serde_json::Value::String("reason".to_string()));
        phase_details.insert("monitor_data".to_string(), serde_json::json!(monitor_data));
        self.agent.log_activity_with_correlation(ActivityType::ReasonPhase, &phase_details, &self.correlation_id).await?;
        
        // Parse the query to determine what to fetch
        let request = self.agent.parse_query(&self.query);
        
        // Assess risk (log queries are always low risk)
        let risk = RiskLevel::Low;
        
        // Build decision
        let decision = format!(
            "Fetch {} logs with category={:?}, level={:?}, time={:?}",
            request.limit.unwrap_or(100),
            request.category,
            request.level,
            request.time_range
        );
        
        let reasoning = ReasoningResult {
            decision: decision.clone(),
            confidence: 0.95,
            alternatives: vec!["Show all logs".to_string(), "Show only errors".to_string()],
            risk_assessment: risk,
        };
        
        // Log the reasoning decision
        let mut decision_details = HashMap::new();
        decision_details.insert("decision".to_string(), serde_json::Value::String(decision));
        decision_details.insert("confidence".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(reasoning.confidence.into()).unwrap()));
        decision_details.insert("risk_level".to_string(), serde_json::Value::String(format!("{:?}", reasoning.risk_assessment)));
        self.agent.log_activity_with_correlation(ActivityType::DecisionMade, &decision_details, &self.correlation_id).await?;
        
        Ok(reasoning)
    }
    
    async fn act(&mut self, _reasoning: &ReasoningResult) -> Result<ActionRecord> {
        // Log MRAP Act phase entry
        let mut phase_details = HashMap::new();
        phase_details.insert("phase".to_string(), serde_json::Value::String("act".to_string()));
        phase_details.insert("action".to_string(), serde_json::Value::String("fetch_logs".to_string()));
        self.agent.log_activity_with_correlation(ActivityType::ActPhase, &phase_details, &self.correlation_id).await?;
        
        let start = std::time::Instant::now();
        
        // Parse query and fetch logs
        let request = self.agent.parse_query(&self.query);
        
        // Log the specific action being taken
        let mut action_details = HashMap::new();
        action_details.insert("action_type".to_string(), serde_json::Value::String("fetch_logs".to_string()));
        action_details.insert("query_params".to_string(), serde_json::json!({
            "limit": request.limit,
            "category": request.category,
            "level": request.level,
            "time_range": request.time_range
        }));
        self.agent.log_activity_with_correlation(ActivityType::ActionTaken, &action_details, &self.correlation_id).await?;
        
        let logs = self.agent.fetch_logs(&request).await?;
        
        // Generate summary
        let summary = if logs.is_empty() {
            "No logs found matching your query.".to_string()
        } else {
            format!("Found {} log entries matching your query.", logs.len())
        };
        
        // Create response
        let response = LogQueryResponse {
            summary: summary.clone(),
            total_count: logs.len(),
            logs: logs.into_iter().take(50).collect(),  // Limit to 50 for display
            insights: Vec::new(),  // Will be filled in reflect phase
        };
        
        let action_record = ActionRecord {
            action: "fetch_logs".to_string(),
            parameters: serde_json::json!({
                "query": self.query,
                "limit": request.limit,
                "category": request.category,
                "level": request.level,
            }).as_object().unwrap().clone().into_iter().collect(),
            result: Some(serde_json::to_value(&response)?),
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
        };
        
        // Log action result
        let mut result_details = HashMap::new();
        result_details.insert("success".to_string(), serde_json::Value::Bool(action_record.success));
        result_details.insert("duration_ms".to_string(), serde_json::Value::Number(serde_json::Number::from(action_record.duration_ms)));
        result_details.insert("logs_found".to_string(), serde_json::Value::Number(serde_json::Number::from(response.total_count)));
        self.agent.log_activity_with_correlation(ActivityType::ResultRecorded, &result_details, &self.correlation_id).await?;
        
        Ok(action_record)
    }
    
    async fn reflect(&mut self, state: &MrapState) -> Result<Vec<String>> {
        // Log MRAP Reflect phase entry
        let mut phase_details = HashMap::new();
        phase_details.insert("phase".to_string(), serde_json::Value::String("reflect".to_string()));
        phase_details.insert("mrap_success".to_string(), serde_json::Value::Bool(state.action_taken.as_ref().map(|a| a.success).unwrap_or(false)));
        self.agent.log_activity_with_correlation(ActivityType::ReflectPhase, &phase_details, &self.correlation_id).await?;
        
        let mut insights = Vec::new();
        
        // Learn from this query
        if let Some(action) = &state.action_taken {
            if action.success {
                // Track successful query patterns
                let pattern_key = format!("query_type_{}", 
                    if self.query.contains("error") { "error" }
                    else if self.query.contains("auth") { "auth" }
                    else { "general" }
                );
                
                *self.agent.learned_patterns.entry(pattern_key.clone()).or_insert(0.0) += 1.0;
                
                // Generate insights based on results
                if let Some(result) = &action.result {
                    if let Ok(response) = serde_json::from_value::<LogQueryResponse>(result.clone()) {
                        if response.total_count > 100 {
                            insights.push("High log volume detected - consider filtering by category or time range.".to_string());
                        }
                        
                        // Check for error patterns
                        let error_count = response.logs.iter()
                            .filter(|l| l.level.to_lowercase().contains("error"))
                            .count();
                        
                        if error_count > 10 {
                            insights.push(format!("Found {} errors - investigation may be needed.", error_count));
                        }
                    }
                }
                
                insights.push(format!("Query processed in {}ms", action.duration_ms));
                
                // Log learning and insights
                let mut learning_details = HashMap::new();
                learning_details.insert("pattern_learned".to_string(), serde_json::Value::String(pattern_key));
                learning_details.insert("insights_generated".to_string(), serde_json::Value::Number(serde_json::Number::from(insights.len())));
                learning_details.insert("insights".to_string(), serde_json::json!(insights));
                self.agent.log_activity_with_correlation(ActivityType::Custom("learning".to_string()), &learning_details, &self.correlation_id).await?;
            }
        }
        
        Ok(insights)
    }
}