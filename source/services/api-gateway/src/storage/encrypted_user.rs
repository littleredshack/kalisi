use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use anyhow::Result;
use kalisi_core::types::User;
use crate::crypto::{KeyManager, EncryptedEnvelope};

pub struct EncryptedUserStorage {
    redis: redis::aio::MultiplexedConnection,
    key_manager: KeyManager,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserData {
    pub id: Uuid,
    pub email: String,  // This will be encrypted
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedUserData {
    pub id: Uuid,
    pub email_encrypted: EncryptedEnvelope,  // Encrypted email
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
}

impl From<UserData> for User {
    fn from(data: UserData) -> Self {
        User {
            id: data.id,
            email: data.email,
            is_verified: data.is_verified,
            created_at: data.created_at,
            last_login: data.last_login,
        }
    }
}

impl From<User> for UserData {
    fn from(user: User) -> Self {
        UserData {
            id: user.id,
            email: user.email,
            is_verified: user.is_verified,
            created_at: user.created_at,
            last_login: user.last_login,
        }
    }
}

impl EncryptedUserStorage {
    pub fn new(redis: redis::aio::MultiplexedConnection) -> Self {
        Self { 
            redis,
            key_manager: KeyManager::new(),
        }
    }
    
    /// Store or update user in Redis with encryption
    pub async fn set_user(&mut self, user: &User) -> Result<()> {
        let user_data = UserData::from(user.clone());
        
        // Encrypt sensitive fields
        let email_encrypted = self.key_manager.encrypt(&user_data.email)?;
        
        let encrypted_data = EncryptedUserData {
            id: user_data.id,
            email_encrypted,
            is_verified: user_data.is_verified,
            created_at: user_data.created_at,
            last_login: user_data.last_login,
        };
        
        let key = format!("user:{}", user.id);
        let value = serde_json::to_string(&encrypted_data)?;
        
        // Store in Redis with 30-day expiration
        self.redis.set_ex::<_, _, ()>(&key, value, 2592000).await?;
        
        // Also store email-to-id mapping (encrypted)
        let email_key = format!("email:{}", user.email.to_lowercase());
        let email_encrypted_key = self.key_manager.encrypt(&email_key)?;
        self.redis.set_ex::<_, _, ()>(
            &format!("email_lookup:{}", email_encrypted_key.data),
            user.id.to_string(),
            2592000
        ).await?;
        
        Ok(())
    }
    
    /// Get user by ID with decryption
    pub async fn get_user(&mut self, id: Uuid) -> Result<Option<User>> {
        let key = format!("user:{}", id);
        let value: Option<String> = self.redis.get(&key).await?;
        
        match value {
            Some(json) => {
                let encrypted_data: EncryptedUserData = serde_json::from_str(&json)?;
                
                // Decrypt sensitive fields
                let email = self.key_manager.decrypt(&encrypted_data.email_encrypted)?;
                
                let user_data = UserData {
                    id: encrypted_data.id,
                    email,
                    is_verified: encrypted_data.is_verified,
                    created_at: encrypted_data.created_at,
                    last_login: encrypted_data.last_login,
                };
                
                Ok(Some(user_data.into()))
            }
            None => Ok(None),
        }
    }
    
    /// Find user by email with encryption
    pub async fn find_by_email(&mut self, email: &str) -> Result<Option<User>> {
        // Create encrypted email key for lookup
        let email_key = format!("email:{}", email.to_lowercase());
        let email_encrypted_key = self.key_manager.encrypt(&email_key)?;
        
        let user_id: Option<String> = self.redis
            .get(&format!("email_lookup:{}", email_encrypted_key.data))
            .await?;
            
        match user_id {
            Some(id) => {
                let uuid = Uuid::parse_str(&id)?;
                self.get_user(uuid).await
            }
            None => Ok(None),
        }
    }
    
    /// Update last login time
    pub async fn update_last_login(&mut self, id: Uuid) -> Result<()> {
        if let Some(mut user) = self.get_user(id).await? {
            user.last_login = Some(Utc::now());
            self.set_user(&user).await?;
        }
        Ok(())
    }
    
    /// Delete user and associated data
    pub async fn delete_user(&mut self, id: Uuid) -> Result<()> {
        if let Some(user) = self.get_user(id).await? {
            // Delete user data
            let key = format!("user:{}", id);
            self.redis.del::<_, ()>(&key).await?;
            
            // Delete email mapping
            let email_key = format!("email:{}", user.email.to_lowercase());
            let email_encrypted_key = self.key_manager.encrypt(&email_key)?;
            self.redis.del::<_, ()>(&format!("email_lookup:{}", email_encrypted_key.data)).await?;
            
            // Delete associated sessions
            let pattern = format!("session:*:{}", id);
            let keys: Vec<String> = self.redis.keys(&pattern).await?;
            for key in keys {
                self.redis.del::<_, ()>(&key).await?;
            }
            
            // Delete OTPs
            let otp_key = format!("otp:{}", user.email);
            self.redis.del::<_, ()>(&otp_key).await?;
        }
        
        Ok(())
    }
    
    /// List all users (admin function - use with caution)
    pub async fn list_users(&mut self, limit: usize) -> Result<Vec<User>> {
        let pattern = "user:*";
        let keys: Vec<String> = self.redis.keys(pattern).await?;
        
        let mut users = Vec::new();
        for key in keys.iter().take(limit) {
            if let Some(id_str) = key.strip_prefix("user:") {
                if let Ok(id) = Uuid::parse_str(id_str) {
                    if let Some(user) = self.get_user(id).await? {
                        users.push(user);
                    }
                }
            }
        }
        
        Ok(users)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_user_encryption() {
        // This would require a test Redis instance
        // Implementation left as an exercise
    }
}