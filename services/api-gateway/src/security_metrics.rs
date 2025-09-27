use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Lightweight security metrics for self-awareness
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityMetrics {
    // Authentication metrics
    pub total_login_attempts: u64,
    pub successful_logins: u64,
    pub failed_logins: u64,
    pub active_sessions: u32,
    
    // Real-time activity
    pub recent_events: VecDeque<SecurityEvent>,
    
    // System health
    pub mfa_enabled: bool,
    pub security_score: f32,
    pub last_security_check: DateTime<Utc>,
    
    // Threat indicators
    pub suspicious_activities: u32,
    pub blocked_requests: u64,
    
    // Geographic data (lightweight)
    pub access_locations: HashMap<String, u32>, // country -> count
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityEvent {
    pub timestamp: DateTime<Utc>,
    pub event_type: SecurityEventType,
    pub user: Option<String>,
    pub ip_address: Option<String>,
    pub success: bool,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecurityEventType {
    Login,
    Logout,
    OtpRequest,
    OtpVerify,
    MfaSetup,
    UnauthorizedAccess,
    RateLimitExceeded,
    PasswordReset,
    SessionExpired,
}

/// Lightweight security monitor
pub struct SecurityMonitor {
    metrics: Arc<RwLock<SecurityMetrics>>,
    max_events: usize,
}

impl SecurityMonitor {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(SecurityMetrics {
                total_login_attempts: 0,
                successful_logins: 0,
                failed_logins: 0,
                active_sessions: 0,
                recent_events: VecDeque::with_capacity(100),
                mfa_enabled: std::env::var("MFA_REQUIRED")
                    .unwrap_or_else(|_| "false".to_string())
                    .parse()
                    .unwrap_or(false),
                security_score: 7.5, // From our security audit
                last_security_check: Utc::now(),
                suspicious_activities: 0,
                blocked_requests: 0,
                access_locations: HashMap::new(),
            })),
            max_events: 100, // Keep last 100 events for lightweight operation
        }
    }
    
    /// Record a security event
    pub async fn record_event(&self, event: SecurityEvent) {
        let mut metrics = self.metrics.write().await;
        
        // Update counters based on event type
        match &event.event_type {
            SecurityEventType::Login => {
                metrics.total_login_attempts += 1;
                if event.success {
                    metrics.successful_logins += 1;
                    metrics.active_sessions += 1;
                } else {
                    metrics.failed_logins += 1;
                }
            }
            SecurityEventType::Logout | SecurityEventType::SessionExpired => {
                if metrics.active_sessions > 0 {
                    metrics.active_sessions -= 1;
                }
            }
            SecurityEventType::UnauthorizedAccess | SecurityEventType::RateLimitExceeded => {
                metrics.suspicious_activities += 1;
                metrics.blocked_requests += 1;
            }
            _ => {}
        }
        
        // Add to recent events (FIFO)
        metrics.recent_events.push_back(event);
        if metrics.recent_events.len() > self.max_events {
            metrics.recent_events.pop_front();
        }
    }
    
    /// Get current metrics snapshot
    pub async fn get_metrics(&self) -> SecurityMetrics {
        self.metrics.read().await.clone()
    }
    
    /// Update security score based on current configuration
    #[allow(dead_code)]
    pub async fn update_security_score(&self) {
        let mut metrics = self.metrics.write().await;
        
        // Simple scoring based on security features
        let mut score = 5.0f32; // Base score
        
        // MFA adds 2 points
        if metrics.mfa_enabled {
            score += 2.0;
        }
        
        // Low failed login ratio adds 1 point
        if metrics.total_login_attempts > 0 {
            let failure_rate = metrics.failed_logins as f32 / metrics.total_login_attempts as f32;
            if failure_rate < 0.1 {
                score += 1.0;
            }
        }
        
        // No suspicious activities adds 1 point
        if metrics.suspicious_activities == 0 {
            score += 1.0;
        }
        
        // Recent security check adds 0.5 points
        if Utc::now().signed_duration_since(metrics.last_security_check).num_hours() < 24 {
            score += 0.5;
        }
        
        metrics.security_score = score.min(10.0);
        metrics.last_security_check = Utc::now();
    }
    
    /// Get real-time dashboard data
    pub async fn get_dashboard_data(&self) -> serde_json::Value {
        let metrics = self.get_metrics().await;
        
        // Calculate additional real-time stats
        let login_success_rate = if metrics.total_login_attempts > 0 {
            (metrics.successful_logins as f32 / metrics.total_login_attempts as f32 * 100.0) as u32
        } else {
            100
        };
        
        // Get last 10 events for the activity feed
        let recent_events: Vec<_> = metrics.recent_events
            .iter()
            .rev()
            .take(10)
            .collect();
        
        serde_json::json!({
            "overview": {
                "security_score": metrics.security_score,
                "mfa_enabled": metrics.mfa_enabled,
                "active_sessions": metrics.active_sessions,
                "last_check": metrics.last_security_check,
            },
            "authentication": {
                "total_attempts": metrics.total_login_attempts,
                "successful": metrics.successful_logins,
                "failed": metrics.failed_logins,
                "success_rate": login_success_rate,
            },
            "threats": {
                "suspicious_activities": metrics.suspicious_activities,
                "blocked_requests": metrics.blocked_requests,
            },
            "recent_activity": recent_events,
            "system_health": {
                "status": if metrics.security_score >= 7.0 { "healthy" } else if metrics.security_score >= 5.0 { "warning" } else { "critical" },
                "uptime": "100%", // Placeholder - can be calculated from start time
                "last_incident": "None", // Placeholder - can track actual incidents
            }
        })
    }
}

impl Default for SecurityMonitor {
    fn default() -> Self {
        Self::new()
    }
}