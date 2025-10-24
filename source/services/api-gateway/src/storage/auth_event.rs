#![allow(dead_code)]
use anyhow::Result;
use chrono::{DateTime, Utc};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Auth event for audit logging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthEvent {
    pub id: Uuid,
    pub email: String,
    pub event_type: AuthEventType,
    pub success: bool,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub error_message: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthEventType {
    Login,
    Logout,
    OtpRequest,
    OtpVerify,
    TokenRefresh,
    PasswordReset,
}

pub struct AuthEventStorage {
    redis: redis::aio::MultiplexedConnection,
}

impl AuthEventStorage {
    pub fn new(redis: redis::aio::MultiplexedConnection) -> Self {
        Self { redis }
    }

    /// Log an auth event
    pub async fn log_event(&mut self, event: AuthEvent) -> Result<()> {
        let json_str = serde_json::to_string(&event)?;

        // Store event with a TTL of 30 days (audit retention period)
        let key = format!("auth_event:{}", event.id);
        self.redis
            .set_ex::<_, _, ()>(&key, json_str, 2592000)
            .await?;

        // Add to sorted set for time-based queries (score is timestamp)
        let timestamp = event.created_at.timestamp();
        let index_key = format!("auth_events:by_email:{}", event.email);
        self.redis
            .zadd::<_, _, _, ()>(&index_key, event.id.to_string(), timestamp)
            .await?;

        // Also add to global event log
        let global_key = "auth_events:all";
        self.redis
            .zadd::<_, _, _, ()>(&global_key, event.id.to_string(), timestamp)
            .await?;

        // Expire the indices after 30 days
        self.redis.expire::<_, ()>(&index_key, 2592000).await?;
        self.redis.expire::<_, ()>(&global_key, 2592000).await?;

        Ok(())
    }

    /// Get auth events for a user
    pub async fn get_events_by_email(
        &mut self,
        email: &str,
        limit: usize,
    ) -> Result<Vec<AuthEvent>> {
        let index_key = format!("auth_events:by_email:{}", email);

        // Get event IDs sorted by timestamp (newest first)
        let event_ids: Vec<String> = self.redis.zrevrange(&index_key, 0, limit as isize).await?;

        let mut events = Vec::new();
        for event_id in event_ids {
            let key = format!("auth_event:{}", event_id);
            if let Ok(Some(json_str)) = self.redis.get::<_, Option<String>>(&key).await {
                if let Ok(event) = serde_json::from_str::<AuthEvent>(&json_str) {
                    events.push(event);
                }
            }
        }

        Ok(events)
    }

    /// Get recent auth events (for monitoring)
    pub async fn get_recent_events(&mut self, limit: usize) -> Result<Vec<AuthEvent>> {
        let global_key = "auth_events:all";

        // Get event IDs sorted by timestamp (newest first)
        let event_ids: Vec<String> = self.redis.zrevrange(global_key, 0, limit as isize).await?;

        let mut events = Vec::new();
        for event_id in event_ids {
            let key = format!("auth_event:{}", event_id);
            if let Ok(Some(json_str)) = self.redis.get::<_, Option<String>>(&key).await {
                if let Ok(event) = serde_json::from_str::<AuthEvent>(&json_str) {
                    events.push(event);
                }
            }
        }

        Ok(events)
    }

    /// Count failed login attempts for rate limiting
    pub async fn count_failed_attempts(
        &mut self,
        email: &str,
        window_minutes: u64,
    ) -> Result<usize> {
        let index_key = format!("auth_events:by_email:{}", email);
        let now = Utc::now().timestamp();
        let window_start = now - (window_minutes as i64 * 60);

        // Get event IDs within the time window
        let event_ids: Vec<String> = self
            .redis
            .zrangebyscore(&index_key, window_start, now)
            .await?;

        let mut failed_count = 0;
        for event_id in event_ids {
            let key = format!("auth_event:{}", event_id);
            if let Ok(Some(json_str)) = self.redis.get::<_, Option<String>>(&key).await {
                if let Ok(event) = serde_json::from_str::<AuthEvent>(&json_str) {
                    if !event.success
                        && matches!(
                            event.event_type,
                            AuthEventType::OtpVerify | AuthEventType::Login
                        )
                    {
                        failed_count += 1;
                    }
                }
            }
        }

        Ok(failed_count)
    }
}
