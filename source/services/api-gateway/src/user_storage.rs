use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use anyhow::Result;
use kalisi_core::types::User;

/// User data stored in Redis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisUser {
    pub id: Uuid,
    pub email: String,
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
}

impl From<RedisUser> for User {
    fn from(redis_user: RedisUser) -> Self {
        User {
            id: redis_user.id,
            email: redis_user.email,
            is_verified: redis_user.is_verified,
            created_at: redis_user.created_at,
            last_login: redis_user.last_login,
        }
    }
}

impl From<User> for RedisUser {
    fn from(user: User) -> Self {
        RedisUser {
            id: user.id,
            email: user.email,
            is_verified: user.is_verified,
            created_at: user.created_at,
            last_login: user.last_login,
        }
    }
}

pub struct UserStorage {
    redis: redis::aio::MultiplexedConnection,
}

impl UserStorage {
    pub fn new(redis: redis::aio::MultiplexedConnection) -> Self {
        Self { redis }
    }
    
    /// Get user by email
    pub async fn get_user_by_email(&mut self, email: &str) -> Result<Option<User>> {
        let key = format!("user:{}", email);
        let value: Option<String> = self.redis.get(&key).await?;
        
        match value {
            Some(json_str) => {
                let redis_user: RedisUser = serde_json::from_str(&json_str)?;
                Ok(Some(redis_user.into()))
            }
            None => Ok(None),
        }
    }
    
    /// Get user by ID
    pub async fn get_user_by_id(&mut self, id: Uuid) -> Result<Option<User>> {
        // First, we need to find the email by ID
        let id_key = format!("user_id:{}", id);
        let email: Option<String> = self.redis.get(&id_key).await?;
        
        match email {
            Some(email) => self.get_user_by_email(&email).await,
            None => Ok(None),
        }
    }
    
    /// Create a new user
    pub async fn create_user(&mut self, email: &str) -> Result<User> {
        let new_user = User {
            id: Uuid::new_v4(),
            email: email.to_string(),
            is_verified: true, // OTP verification means they're verified
            created_at: Utc::now(),
            last_login: Some(Utc::now()),
        };
        
        self.save_user(&new_user).await?;
        Ok(new_user)
    }
    
    /// Save or update a user
    pub async fn save_user(&mut self, user: &User) -> Result<()> {
        let redis_user: RedisUser = user.clone().into();
        let json_str = serde_json::to_string(&redis_user)?;
        
        // Save user by email
        let email_key = format!("user:{}", user.email);
        self.redis.set::<_, _, ()>(&email_key, json_str).await?;
        
        // Also save email by ID for reverse lookup
        let id_key = format!("user_id:{}", user.id);
        self.redis.set::<_, _, ()>(&id_key, &user.email).await?;
        
        // Add to user index
        self.redis.sadd("users:all", &user.email).await?;
        
        Ok(())
    }
    
    /// Update last login time
    pub async fn update_last_login(&mut self, email: &str) -> Result<()> {
        if let Some(mut user) = self.get_user_by_email(email).await? {
            user.last_login = Some(Utc::now());
            self.save_user(&user).await?;
        }
        Ok(())
    }
    
    /// Delete a user
    pub async fn delete_user(&mut self, email: &str) -> Result<()> {
        if let Some(user) = self.get_user_by_email(email).await? {
            // Delete user by email
            let email_key = format!("user:{}", email);
            self.redis.del::<_, ()>(&email_key).await?;
            
            // Delete ID mapping
            let id_key = format!("user_id:{}", user.id);
            self.redis.del::<_, ()>(&id_key).await?;
            
            // Remove from index
            self.redis.srem("users:all", email).await?;
        }
        Ok(())
    }
    
    /// Get all users (for admin purposes)
    pub async fn get_all_users(&mut self) -> Result<Vec<User>> {
        let emails: Vec<String> = self.redis.smembers("users:all").await?;
        let mut users = Vec::new();
        
        for email in emails {
            if let Some(user) = self.get_user_by_email(&email).await? {
                users.push(user);
            }
        }
        
        Ok(users)
    }
}

/// Auth event storage for audit logging
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthEvent {
    pub id: Uuid,
    pub email: String,
    pub event_type: String,
    pub success: bool,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub error_message: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
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
        
        // Store event with a TTL of 30 days
        let key = format!("auth_event:{}", event.id);
        self.redis.set_ex::<_, _, ()>(&key, json_str, 2592000).await?;
        
        // Add to sorted set for time-based queries (score is timestamp)
        let timestamp = event.created_at.timestamp();
        let index_key = format!("auth_events:by_email:{}", event.email);
        self.redis.zadd(&index_key, event.id.to_string(), timestamp).await?;
        
        // Expire the index after 30 days
        self.redis.expire(&index_key, 2592000).await?;
        
        Ok(())
    }
    
    /// Get auth events for a user
    pub async fn get_events_by_email(&mut self, email: &str, limit: usize) -> Result<Vec<AuthEvent>> {
        let index_key = format!("auth_events:by_email:{}", email);
        
        // Get event IDs sorted by timestamp (newest first)
        let event_ids: Vec<String> = self.redis
            .zrevrange(&index_key, 0, limit as isize)
            .await?;
        
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
}