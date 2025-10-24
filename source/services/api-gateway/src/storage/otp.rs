use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtpData {
    pub email: String,
    pub code: String,
    pub expires_at: DateTime<Utc>,
    pub attempts: u8,
    pub purpose: OtpPurpose,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OtpPurpose {
    Login,
    EmailVerification,
}

pub struct OtpStorage {
    redis: redis::aio::MultiplexedConnection,
}

impl OtpStorage {
    pub fn new(redis: redis::aio::MultiplexedConnection) -> Self {
        Self { redis }
    }

    /// Store OTP with TTL
    pub async fn store_otp(&mut self, email: &str, code: &str, purpose: OtpPurpose) -> Result<()> {
        let otp_data = OtpData {
            email: email.to_string(),
            code: code.to_string(),
            expires_at: Utc::now() + Duration::minutes(10),
            attempts: 0,
            purpose,
        };

        let key = format!("otp:{}", email);
        let value = serde_json::to_string(&otp_data)?;

        // Set with 10 minute TTL
        self.redis.set_ex::<_, _, ()>(&key, value, 600).await?;

        Ok(())
    }

    /// Retrieve and verify OTP
    pub async fn verify_otp(&mut self, email: &str, code: &str) -> Result<bool> {
        let key = format!("otp:{}", email);

        // Get OTP data
        let value: Option<String> = self.redis.get(&key).await?;

        match value {
            Some(json_str) => {
                let mut otp_data: OtpData = serde_json::from_str(&json_str)?;

                // Check if expired
                if otp_data.expires_at < Utc::now() {
                    // Delete expired OTP
                    self.redis.del::<_, ()>(&key).await?;
                    return Ok(false);
                }

                // Check attempts
                if otp_data.attempts >= 3 {
                    // Too many attempts, delete OTP
                    self.redis.del::<_, ()>(&key).await?;
                    return Ok(false);
                }

                // Verify code
                if otp_data.code == code {
                    // Success! Delete OTP
                    self.redis.del::<_, ()>(&key).await?;
                    Ok(true)
                } else {
                    // Wrong code, increment attempts
                    otp_data.attempts += 1;
                    let updated_value = serde_json::to_string(&otp_data)?;

                    // Calculate remaining TTL
                    let ttl: i64 = self.redis.ttl(&key).await?;
                    if ttl > 0 {
                        self.redis
                            .set_ex::<_, _, ()>(&key, updated_value, ttl as u64)
                            .await?;
                    }

                    Ok(false)
                }
            }
            None => Ok(false),
        }
    }

    /// Delete OTP (for logout or manual invalidation)
    #[allow(dead_code)]
    pub async fn delete_otp(&mut self, email: &str) -> Result<()> {
        let key = format!("otp:{}", email);
        self.redis.del::<_, ()>(&key).await?;
        Ok(())
    }
}
