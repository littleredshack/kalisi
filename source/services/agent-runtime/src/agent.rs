use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use serde_json::Value;

/// Cognitive patterns for agents (from DAA research)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CognitivePattern {
    /// Analytical, evaluative thinking - best for security analysis
    Critical,
    /// Creative, exploratory thinking
    Divergent,
    /// Goal-oriented, focused thinking
    Convergent,
    /// Holistic, interconnected thinking - best for coordination
    Systems,
    /// Associative, creative problem solving
    Lateral,
    /// Dynamic, learning-based thinking
    Adaptive,
}

/// Agent capabilities define what an agent can do
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capability {
    pub protocol: String,
    pub version: String,
    pub description: String,
}

/// Resource limits for agent operations (bounded autonomy)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub max_time_ms: u64,
    pub max_memory_mb: u64,
    pub max_cpu_percent: f32,
    pub max_queries: u32,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_time_ms: 5000,      // 5 seconds max per operation
            max_memory_mb: 100,     // 100MB memory limit
            max_cpu_percent: 25.0,  // 25% CPU max
            max_queries: 100,       // 100 queries max per operation
        }
    }
}

/// Agent metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub cognitive_pattern: CognitivePattern,
    pub capabilities: Vec<Capability>,
    pub resource_limits: ResourceLimits,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub status: AgentStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentStatus {
    Initializing,
    Active,
    Idle,
    Processing,
    Learning,
    Suspended,
    Error(String),
}

/// Agent activity logging - every agent must log its activities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActivity {
    pub agent_id: String,
    pub activity_type: ActivityType,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub details: HashMap<String, Value>,
    pub correlation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActivityType {
    /// Agent lifecycle events
    Initialized,
    Started,
    Stopped,
    StatusChanged,
    
    /// MRAP phase activities
    MrapStarted,
    MonitorPhase,
    ReasonPhase,
    ActPhase,
    ReflectPhase,
    MrapCompleted,
    
    /// Business process activities
    ProcessStarted,
    ProcessStep,
    ProcessCompleted,
    ProcessFailed,
    
    /// Communication activities
    MessageReceived,
    MessageSent,
    ResponseGenerated,
    
    /// Decision activities
    DecisionMade,
    ActionTaken,
    ResultRecorded,
    
    /// Custom activities (agent-specific)
    Custom(String),
}

/// Unified logging structures for agent visibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogCategory {
    Auth,
    Api,
    Chat,
    WebSocket,
    System,
    Security,
    Agent,
    Error,
    Performance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CentralLogEntry {
    pub id: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub level: LogLevel,
    pub category: LogCategory,
    pub message: String,
    pub service: String,
    pub user_id: Option<String>,
    pub ip_address: Option<String>,
    pub data: Option<HashMap<String, serde_json::Value>>,
}

/// Core Agent trait - all agents must implement this
#[async_trait]
pub trait Agent: Send + Sync {
    /// Get agent information
    fn info(&self) -> &AgentInfo;
    
    /// Get the protocols this agent can handle
    fn protocols(&self) -> Vec<String>;
    
    /// Initialize the agent
    async fn initialize(&mut self) -> anyhow::Result<()>;
    
    /// Shutdown the agent gracefully
    async fn shutdown(&mut self) -> anyhow::Result<()>;
    
    /// Check if agent can handle a specific protocol
    fn can_handle(&self, protocol: &str) -> bool {
        self.protocols().contains(&protocol.to_string())
    }
    
    /// Get agent health status
    async fn health_check(&self) -> anyhow::Result<AgentStatus>;
    
    /// Get agent metrics for monitoring
    async fn get_metrics(&self) -> anyhow::Result<HashMap<String, f64>>;
    
    /// MANDATORY: Log agent activity (breadcrumbs everywhere)
    async fn log_activity(&mut self, activity_type: ActivityType, details: &HashMap<String, Value>) -> anyhow::Result<()>;
    
    /// MANDATORY: Log with correlation ID for tracing workflows  
    async fn log_activity_with_correlation(&mut self, activity_type: ActivityType, details: &HashMap<String, Value>, correlation_id: &str) -> anyhow::Result<()>;
    
    /// Helper: Log MRAP phase entry
    async fn log_mrap_phase(&mut self, phase: &str, correlation_id: &str, details: &HashMap<String, Value>) -> anyhow::Result<()> {
        let activity_type = match phase {
            "monitor" => ActivityType::MonitorPhase,
            "reason" => ActivityType::ReasonPhase,
            "act" => ActivityType::ActPhase,
            "reflect" => ActivityType::ReflectPhase,
            _ => ActivityType::Custom(format!("mrap_{}", phase)),
        };
        self.log_activity_with_correlation(activity_type, details, correlation_id).await
    }
    
    /// Helper: Log business process step
    async fn log_process_step(&mut self, process_name: &str, step_name: &str, correlation_id: &str, details: HashMap<String, Value>) -> anyhow::Result<()> {
        let mut step_details = details;
        step_details.insert("process_name".to_string(), Value::String(process_name.to_string()));
        step_details.insert("step_name".to_string(), Value::String(step_name.to_string()));
        self.log_activity_with_correlation(ActivityType::ProcessStep, &step_details, correlation_id).await
    }
}