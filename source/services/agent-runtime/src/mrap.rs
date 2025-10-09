use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn};

/// MRAP Loop State - Monitor, Reason, Act, Reflect
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MrapState {
    pub current_phase: MrapPhase,
    pub monitor_data: HashMap<String, serde_json::Value>,
    pub reasoning_result: Option<ReasoningResult>,
    pub action_taken: Option<ActionRecord>,
    pub reflection_insights: Vec<String>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MrapPhase {
    Monitoring,
    Reasoning,
    Acting,
    Reflecting,
    Complete,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReasoningResult {
    pub decision: String,
    pub confidence: f32,
    pub alternatives: Vec<String>,
    pub risk_assessment: RiskLevel,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionRecord {
    pub action: String,
    pub parameters: HashMap<String, serde_json::Value>,
    pub result: Option<serde_json::Value>,
    pub success: bool,
    pub duration_ms: u64,
}

/// MRAP Loop trait - implements the Monitor-Reason-Act-Reflect pattern
#[async_trait]
pub trait MrapLoop: Send + Sync {
    /// Monitor phase - gather relevant data
    async fn monitor(&mut self) -> anyhow::Result<HashMap<String, serde_json::Value>>;

    /// Reason phase - analyze data and make decisions
    async fn reason(
        &mut self,
        monitor_data: &HashMap<String, serde_json::Value>,
    ) -> anyhow::Result<ReasoningResult>;

    /// Act phase - execute the decision
    async fn act(&mut self, reasoning: &ReasoningResult) -> anyhow::Result<ActionRecord>;

    /// Reflect phase - learn from the action and results
    async fn reflect(&mut self, state: &MrapState) -> anyhow::Result<Vec<String>>;

    /// Execute the complete MRAP loop
    async fn execute_mrap(&mut self) -> anyhow::Result<MrapState> {
        let started_at = Utc::now();
        let mut state = MrapState {
            current_phase: MrapPhase::Monitoring,
            monitor_data: HashMap::new(),
            reasoning_result: None,
            action_taken: None,
            reflection_insights: Vec::new(),
            started_at,
            completed_at: None,
        };

        // Monitor Phase
        info!("MRAP: Starting Monitor phase");
        state.monitor_data = self.monitor().await?;

        // Reason Phase
        info!("MRAP: Starting Reason phase");
        state.current_phase = MrapPhase::Reasoning;
        let reasoning = self.reason(&state.monitor_data).await?;
        state.reasoning_result = Some(reasoning.clone());

        // Check risk level before acting
        if reasoning.risk_assessment == RiskLevel::Critical {
            warn!("MRAP: Critical risk detected, requiring human approval");
            // In production, this would pause for human approval
        }

        // Act Phase
        info!("MRAP: Starting Act phase");
        state.current_phase = MrapPhase::Acting;
        let action = self.act(&reasoning).await?;
        state.action_taken = Some(action);

        // Reflect Phase
        info!("MRAP: Starting Reflect phase");
        state.current_phase = MrapPhase::Reflecting;
        state.reflection_insights = self.reflect(&state).await?;

        // Complete
        state.current_phase = MrapPhase::Complete;
        state.completed_at = Some(Utc::now());

        info!(
            "MRAP: Loop complete with {} insights",
            state.reflection_insights.len()
        );

        Ok(state)
    }

    /// Validate that an action is within bounds
    fn validate_bounds(&self, _action: &str) -> bool {
        // Override this to implement specific boundary checks
        true
    }

    /// Record audit trail
    async fn audit_log(&self, phase: &str, details: serde_json::Value) -> anyhow::Result<()> {
        // Override this to implement specific audit logging
        info!("MRAP Audit: {} - {}", phase, details);
        Ok(())
    }
}
