use chrono::{DateTime, Utc};
use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

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
    Error,
    Performance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub category: LogCategory,
    pub message: String,
    pub service: String,
    pub user_id: Option<String>,
    pub ip_address: Option<String>,
    pub data: Option<HashMap<String, Value>>,
}

#[derive(Clone)]
pub struct CentralLogger {
    redis: ConnectionManager,
    service_name: String,
}

impl CentralLogger {
    pub fn new(redis: ConnectionManager, service_name: String) -> Self {
        Self {
            redis,
            service_name,
        }
    }

    pub async fn log(&self, level: LogLevel, category: LogCategory, message: &str) {
        self.log_with_context(level, category, message, HashMap::new())
            .await;
    }

    pub async fn log_with_context(
        &self,
        level: LogLevel,
        category: LogCategory,
        message: &str,
        context: HashMap<String, Value>,
    ) {
        let entry = LogEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            level: level.clone(),
            category: category.clone(),
            message: message.to_string(),
            service: self.service_name.clone(),
            user_id: context
                .get("user_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            ip_address: context
                .get("ip_address")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            data: if context.is_empty() {
                None
            } else {
                Some(context)
            },
        };

        // Store in Redis
        if let Ok(json) = serde_json::to_string(&entry) {
            let mut redis = self.redis.clone();

            // Add to main log list
            let _: Result<(), _> = redis.lpush("logs:all", json.clone()).await;

            // Add to category-specific list
            let category_key =
                format!("logs:category:{}", format!("{:?}", category).to_lowercase());
            let _: Result<(), _> = redis.lpush(&category_key, json.clone()).await;

            // Add to level-specific list
            let level_key = format!("logs:level:{}", format!("{:?}", level).to_lowercase());
            let _: Result<(), _> = redis.lpush(&level_key, json.clone()).await;

            // Trim lists to keep only last 10000 entries
            let _: Result<(), _> = redis.ltrim("logs:all", 0, 9999).await;
            let _: Result<(), _> = redis.ltrim(&category_key, 0, 9999).await;
            let _: Result<(), _> = redis.ltrim(&level_key, 0, 9999).await;

            // REAL-TIME STREAMING: Publish to Redis pub/sub for event-driven log streaming
            let notification = serde_json::json!({
                "id": entry.id,
                "timestamp": entry.timestamp.to_rfc3339(),
                "level": format!("{:?}", level),
                "category": format!("{:?}", category),
                "service": self.service_name,
                "message": message,
                "data": entry.data
            });

            let notification_json = serde_json::to_string(&notification).unwrap_or_default();

            // Publish to multiple channels for efficient filtering
            let _: Result<(), _> = redis.publish("logs:stream", &notification_json).await;
            let _: Result<(), _> = redis
                .publish(
                    &format!("logs:category:{}", format!("{:?}", category).to_lowercase()),
                    &notification_json,
                )
                .await;
            let _: Result<(), _> = redis
                .publish(
                    &format!("logs:level:{}", format!("{:?}", level).to_lowercase()),
                    &notification_json,
                )
                .await;

            // Console logging disabled to prevent terminal flooding
        }
    }

    pub async fn get_logs(
        &self,
        limit: usize,
        category: Option<LogCategory>,
        level: Option<LogLevel>,
        search: Option<String>,
    ) -> Vec<LogEntry> {
        let mut redis = self.redis.clone();

        // Determine which list to query
        let key = if let Some(cat) = category {
            format!("logs:category:{}", format!("{:?}", cat).to_lowercase())
        } else if let Some(lvl) = level {
            format!("logs:level:{}", format!("{:?}", lvl).to_lowercase())
        } else {
            "logs:all".to_string()
        };

        // Get logs from Redis
        let entries: Vec<String> = redis
            .lrange(&key, 0, (limit - 1) as isize)
            .await
            .unwrap_or_default();

        let mut logs: Vec<LogEntry> = entries
            .into_iter()
            .filter_map(|json| serde_json::from_str(&json).ok())
            .collect();

        // Apply search filter if provided
        if let Some(query) = search {
            let query_lower = query.to_lowercase();
            logs.retain(|log| log.message.to_lowercase().contains(&query_lower));
        }

        logs
    }

    pub async fn clear_old_logs(&self, _days: i64) {
        // For now, just clear all logs
        let mut redis = self.redis.clone();
        let _: Result<(), _> = redis.del("logs:all").await;

        // Clear category logs
        for category in [
            "auth",
            "api",
            "chat",
            "websocket",
            "system",
            "security",
            "error",
            "performance",
        ] {
            let key = format!("logs:category:{}", category);
            let _: Result<(), _> = redis.del(&key).await;
        }

        // Clear level logs
        for level in ["debug", "info", "warn", "error", "critical"] {
            let key = format!("logs:level:{}", level);
            let _: Result<(), _> = redis.del(&key).await;
        }
    }

    // Compatibility methods for existing code
    pub async fn info(
        &self,
        category: LogCategory,
        message: &str,
        context: HashMap<String, Value>,
    ) {
        self.log_with_context(LogLevel::Info, category, message, context)
            .await;
    }

    pub async fn error(
        &self,
        category: LogCategory,
        message: &str,
        context: HashMap<String, Value>,
    ) {
        self.log_with_context(LogLevel::Error, category, message, context)
            .await;
    }

    // Backward compatibility without context
    #[allow(dead_code)]
    pub async fn info_simple(&self, category: LogCategory, message: &str) {
        self.log_with_context(LogLevel::Info, category, message, HashMap::new())
            .await;
    }

    #[allow(dead_code)]
    pub async fn error_simple(&self, category: LogCategory, message: &str) {
        self.log_with_context(LogLevel::Error, category, message, HashMap::new())
            .await;
    }

    pub async fn log_security_event(&self, event: impl std::any::Any) {
        // Try to downcast to SecurityEvent
        if let Some(sec_event) =
            (&event as &dyn std::any::Any).downcast_ref::<security_events::SecurityEvent>()
        {
            let mut context = HashMap::new();
            context.insert(
                "event_type".to_string(),
                serde_json::json!(format!("{:?}", sec_event.event_type)),
            );
            context.insert(
                "severity".to_string(),
                serde_json::json!(format!("{:?}", sec_event.severity)),
            );
            if let Some(user_id) = &sec_event.user_id {
                context.insert("user_id".to_string(), serde_json::json!(user_id));
            }
            if let Some(ip) = &sec_event.ip_address {
                context.insert("ip_address".to_string(), serde_json::json!(ip));
            }

            self.log_with_context(
                LogLevel::Info,
                LogCategory::Security,
                &sec_event.details,
                context,
            )
            .await;
        } else {
            // Fallback for other types
            self.log(LogLevel::Info, LogCategory::Security, "Security event")
                .await;
        }
    }

    // Convenience methods for backward compatibility
    pub async fn log_login_attempt(&self, email: &str, ip: Option<String>, success: bool) {
        let mut context = HashMap::new();
        context.insert("email".to_string(), serde_json::json!(email));
        if let Some(ip) = ip {
            context.insert("ip_address".to_string(), serde_json::json!(ip));
        }
        context.insert("success".to_string(), serde_json::json!(success));

        let level = if success {
            LogLevel::Info
        } else {
            LogLevel::Warn
        };
        let message = if success {
            format!("Login attempt succeeded for {}", email)
        } else {
            format!("Login attempt failed for {}", email)
        };

        self.log_with_context(level, LogCategory::Auth, &message, context)
            .await;
    }

    pub async fn log_mfa_attempt(&self, user_id: &str, email: &str, success: bool) {
        let mut context = HashMap::new();
        context.insert("user_id".to_string(), serde_json::json!(user_id));
        context.insert("email".to_string(), serde_json::json!(email));
        context.insert("success".to_string(), serde_json::json!(success));

        let level = if success {
            LogLevel::Info
        } else {
            LogLevel::Warn
        };
        let message = if success {
            format!("MFA verification succeeded for {}", email)
        } else {
            format!("MFA verification failed for {}", email)
        };

        self.log_with_context(level, LogCategory::Auth, &message, context)
            .await;
    }
}

// Re-export security types for compatibility
pub mod security_events {
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub enum SecuritySeverity {
        Low,
        Medium,
        High,
        Critical,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub enum SecurityEventType {
        LoginAttempt,
        LoginSuccess,
        LoginFailed,
        LoginFailure, // Alias for LoginFailed
        TokenIssued,
        TokenRevoked,
        LogoutSuccess,
        MfaRequired,
        MfaSuccess,
        MfaFailed,
        PasswordChanged,
        AccountDeleted,
        OtpRequest,
        OtpFailed,
        OtpVerified,
        ConfigurationChange,
    }

    #[derive(Debug, Clone)]
    pub struct SecurityEvent {
        pub event_type: SecurityEventType,
        pub user_id: Option<String>,
        pub ip_address: Option<String>,
        pub severity: SecuritySeverity,
        pub details: String,
    }

    impl SecurityEvent {
        pub fn new(event_type: SecurityEventType, user_id: Option<String>) -> Self {
            Self {
                event_type,
                user_id,
                ip_address: None,
                severity: SecuritySeverity::Low,
                details: String::new(),
            }
        }

        #[allow(dead_code)]
        pub fn with_ip(mut self, ip: String) -> Self {
            self.ip_address = Some(ip);
            self
        }

        pub fn with_details(mut self, details: String) -> Self {
            self.details = details;
            self
        }

        pub fn with_severity(mut self, severity: SecuritySeverity) -> Self {
            self.severity = severity;
            self
        }

        pub fn with_user(mut self, user_id: String, email: Option<String>) -> Self {
            self.user_id = Some(user_id);
            if let Some(email) = email {
                self.details = format!("{} ({})", self.details, email);
            }
            self
        }
    }
}
