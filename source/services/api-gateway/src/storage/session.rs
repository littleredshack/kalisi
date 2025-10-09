use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub struct SessionStorage {
    redis: redis::aio::MultiplexedConnection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionData {
    pub user_id: Uuid,
    pub email: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl SessionStorage {
    pub fn new(redis: redis::aio::MultiplexedConnection) -> Self {
        Self { redis }
    }

    /// Store session with TTL
    pub async fn store_session(
        &mut self,
        session_id: &str,
        user_id: Uuid,
        email: &str,
    ) -> Result<()> {
        let session_data = SessionData {
            user_id,
            email: email.to_string(),
            created_at: Utc::now(),
            expires_at: Utc::now() + Duration::hours(24),
        };

        let key = format!("session:{}", session_id);
        let value = serde_json::to_string(&session_data)?;

        // Set with 24 hour TTL
        self.redis.set_ex::<_, _, ()>(&key, value, 86400).await?;

        Ok(())
    }

    /// Get session data
    pub async fn get_session(&mut self, session_id: &str) -> Result<Option<SessionData>> {
        let key = format!("session:{}", session_id);
        let value: Option<String> = self.redis.get(&key).await?;

        match value {
            Some(json_str) => {
                let session_data: SessionData = serde_json::from_str(&json_str)?;

                // Check if expired
                if session_data.expires_at < Utc::now() {
                    // Delete expired session
                    self.redis.del::<_, ()>(&key).await?;
                    return Ok(None);
                }

                Ok(Some(session_data))
            }
            None => Ok(None),
        }
    }

    /// Delete session (for logout)
    pub async fn delete_session(&mut self, session_id: &str) -> Result<()> {
        let key = format!("session:{}", session_id);
        self.redis.del::<_, ()>(&key).await?;
        Ok(())
    }
}
