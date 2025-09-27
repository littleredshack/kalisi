use axum::{
    extract::{Query, State},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::logging::{LogCategory, LogLevel, LogEntry};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct LogQuery {
    pub category: Option<String>,
    pub level: Option<String>,
    pub limit: Option<i64>,
    #[allow(dead_code)]
    pub start_date: Option<DateTime<Utc>>,
    #[allow(dead_code)]
    pub end_date: Option<DateTime<Utc>>,
    #[allow(dead_code)]
    pub user_id: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct LogResponse {
    pub logs: Vec<LogEntry>,
    pub total: usize,
    pub metrics: HashMap<String, i64>,
}

/// Get logs with filtering
pub async fn get_logs(
    State(state): State<AppState>,
    Query(query): Query<LogQuery>,
) -> impl IntoResponse {
    // Parse category if provided
    let category = query.category.as_ref().and_then(|c| {
        match c.to_uppercase().as_str() {
            "AUTH" => Some(LogCategory::Auth),
            "API" => Some(LogCategory::Api),
            "CHAT" => Some(LogCategory::Chat),
            "WEBSOCKET" => Some(LogCategory::WebSocket),
            "SYSTEM" => Some(LogCategory::System),
            "SECURITY" => Some(LogCategory::Security),
            "ERROR" => Some(LogCategory::Error),
            _ => None,
        }
    });
    
    // Parse level if provided
    let level = query.level.as_ref().and_then(|l| {
        match l.to_lowercase().as_str() {
            "debug" => Some(LogLevel::Debug),
            "info" => Some(LogLevel::Info),
            "warn" | "warning" => Some(LogLevel::Warn),
            "error" => Some(LogLevel::Error),
            "critical" => Some(LogLevel::Critical),
            _ => None,
        }
    });
    
    let limit = query.limit.unwrap_or(50) as usize;
    
    // Get logs from CentralLogger
    let logs = state.logger.get_logs(limit, category, level, query.search).await;
    
    // Calculate metrics
    let mut metrics = HashMap::new();
    for log in &logs {
        let level_key = format!("{:?}", log.level);
        *metrics.entry(level_key).or_insert(0) += 1;
    }
    
    let result = LogResponse {
        total: logs.len(),
        logs,
        metrics,
    };
    
    Json(result)
}

/// Get log statistics
pub async fn get_log_stats(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let logs = state.logger.get_logs(1000, None, None, None).await;
    
    let mut stats = HashMap::new();
    for log in &logs {
        let level_key = format!("{:?}", log.level);
        *stats.entry(level_key).or_insert(0) += 1;
    }
    
    Json(stats)
}

/// Clear old logs (admin only)
pub async fn clear_old_logs(
    State(state): State<AppState>,
) -> impl IntoResponse {
    // Clear logs older than 30 days
    state.logger.clear_old_logs(30).await;
    
    Json(serde_json::json!({
        "status": "success",
        "message": "Cleared old logs"
    }))
}