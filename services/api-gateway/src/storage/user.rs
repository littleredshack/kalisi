use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use anyhow::Result;
use kalisi_core::types::User;

pub struct UserStorage {
    redis: redis::aio::MultiplexedConnection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserData {
    pub id: Uuid,
    pub email: String,
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

impl UserStorage {
    pub fn new(redis: redis::aio::MultiplexedConnection) -> Self {
        Self { redis }
    }
    
    /// Store or update user in Redis
    pub async fn store_user(&mut self, user: &User) -> Result<()> {
        let user_data = UserData::from(user.clone());
        
        // Store by email for easy lookup
        let email_key = format!("user:{}", &user.email);
        let user_json = serde_json::to_string(&user_data)?;
        
        // Store user data with no expiry (permanent storage)
        self.redis.set::<_, _, ()>(&email_key, &user_json).await?;
        
        // Also store a mapping from user ID to email for reverse lookups
        let id_key = format!("user:id:{}", user.id);
        self.redis.set::<_, _, ()>(&id_key, &user.email).await?;
        
        Ok(())
    }
    
    /// Get user by email
    pub async fn get_user_by_email(&mut self, email: &str) -> Result<Option<User>> {
        let key = format!("user:{}", email);
        let value: Option<String> = self.redis.get(&key).await?;
        
        match value {
            Some(json_str) => {
                let user_data: UserData = serde_json::from_str(&json_str)?;
                Ok(Some(user_data.into()))
            }
            None => Ok(None),
        }
    }
    
    /// Get user by ID
    pub async fn get_user_by_id(&mut self, user_id: Uuid) -> Result<Option<User>> {
        // First get the email from the ID mapping
        let id_key = format!("user:id:{}", user_id);
        let email: Option<String> = self.redis.get(&id_key).await?;
        
        match email {
            Some(email) => self.get_user_by_email(&email).await,
            None => Ok(None),
        }
    }
    
    /// Update user's last login time
    #[allow(dead_code)]
    pub async fn update_last_login(&mut self, email: &str) -> Result<()> {
        if let Some(mut user) = self.get_user_by_email(email).await? {
            user.last_login = Some(Utc::now());
            self.store_user(&user).await?;
        }
        Ok(())
    }
    
    /// Check if user exists
    #[allow(dead_code)]
    pub async fn user_exists(&mut self, email: &str) -> Result<bool> {
        let key = format!("user:{}", email);
        let exists: bool = self.redis.exists(&key).await?;
        Ok(exists)
    }
    
    /// Delete user by email (complete removal)
    pub async fn delete_user_by_email(&mut self, email: &str) -> Result<()> {
        // Get user to find ID for complete cleanup
        if let Some(user) = self.get_user_by_email(email).await? {
            // Delete email key
            let email_key = format!("user:{}", email);
            self.redis.del::<_, ()>(&email_key).await?;
            
            // Delete ID mapping
            let id_key = format!("user:id:{}", user.id);
            self.redis.del::<_, ()>(&id_key).await?;
            
            tracing::info!("Deleted user data for email: {}", email);
        }
        Ok(())
    }
    
    /// Delete user by ID
    pub async fn delete_user_by_id(&mut self, user_id: Uuid) -> Result<()> {
        // Get email first
        if let Some(user) = self.get_user_by_id(user_id).await? {
            self.delete_user_by_email(&user.email).await?;
        }
        Ok(())
    }
    
    /// Get all user keys (for cleanup operations)
    #[allow(dead_code)]
    pub async fn get_all_user_keys(&mut self, user_id: Uuid) -> Result<Vec<String>> {
        let mut keys = Vec::new();
        
        // Get user email first
        if let Some(user) = self.get_user_by_id(user_id).await? {
            keys.push(format!("user:{}", user.email));
            keys.push(format!("user:id:{}", user_id));
        }
        
        Ok(keys)
    }
}