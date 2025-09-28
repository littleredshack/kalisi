use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::RwLock;

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("Vault connection failed: {0}")]
    ConnectionError(String),
    
    #[error("Secret not found: {0}")]
    SecretNotFound(String),
    
    #[error("Authentication failed")]
    AuthenticationFailed,
    
    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
    
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),
}

/// Trait for secret providers
#[async_trait]
pub trait SecretProvider: Send + Sync {
    async fn get_secret(&self, path: &str) -> Result<String, VaultError>;
    async fn get_secret_map(&self, path: &str) -> Result<HashMap<String, String>, VaultError>;
    async fn set_secret(&self, path: &str, value: &str) -> Result<(), VaultError>;
    async fn delete_secret(&self, path: &str) -> Result<(), VaultError>;
    async fn list_secrets(&self, path: &str) -> Result<Vec<String>, VaultError>;
}

/// HashiCorp Vault client
pub struct VaultClient {
    base_url: String,
    token: String,
    client: reqwest::Client,
    cache: Arc<RwLock<HashMap<String, CachedSecret>>>,
}

#[derive(Clone)]
struct CachedSecret {
    value: String,
    expires_at: chrono::DateTime<chrono::Utc>,
}

impl VaultClient {
    pub fn new(base_url: String, token: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
            
        Self {
            base_url,
            token,
            client,
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    async fn is_cached(&self, path: &str) -> Option<String> {
        let cache = self.cache.read().await;
        if let Some(cached) = cache.get(path) {
            if cached.expires_at > chrono::Utc::now() {
                return Some(cached.value.clone());
            }
        }
        None
    }
    
    async fn cache_secret(&self, path: &str, value: String, ttl: i64) {
        let expires_at = chrono::Utc::now() + chrono::Duration::seconds(ttl);
        let mut cache = self.cache.write().await;
        cache.insert(
            path.to_string(),
            CachedSecret { value, expires_at },
        );
    }
}

#[async_trait]
impl SecretProvider for VaultClient {
    async fn get_secret(&self, path: &str) -> Result<String, VaultError> {
        // Check cache first
        if let Some(cached) = self.is_cached(path).await {
            return Ok(cached);
        }
        
        let url = format!("{}/v1/{}", self.base_url, path);
        let response = self.client
            .get(&url)
            .header("X-Vault-Token", &self.token)
            .send()
            .await?;
            
        if response.status() == 404 {
            return Err(VaultError::SecretNotFound(path.to_string()));
        }
        
        if response.status() == 403 {
            return Err(VaultError::AuthenticationFailed);
        }
        
        let vault_response: VaultResponse = response.json().await?;
        
        if let Some(data) = vault_response.data.get("value") {
            // Cache for 5 minutes by default
            self.cache_secret(path, data.clone(), 300).await;
            Ok(data.clone())
        } else {
            Err(VaultError::SecretNotFound(path.to_string()))
        }
    }
    
    async fn get_secret_map(&self, path: &str) -> Result<HashMap<String, String>, VaultError> {
        let url = format!("{}/v1/{}", self.base_url, path);
        let response = self.client
            .get(&url)
            .header("X-Vault-Token", &self.token)
            .send()
            .await?;
            
        if response.status() == 404 {
            return Err(VaultError::SecretNotFound(path.to_string()));
        }
        
        if response.status() == 403 {
            return Err(VaultError::AuthenticationFailed);
        }
        
        let vault_response: VaultResponse = response.json().await?;
        Ok(vault_response.data)
    }
    
    async fn set_secret(&self, path: &str, value: &str) -> Result<(), VaultError> {
        let url = format!("{}/v1/{}", self.base_url, path);
        let mut data = HashMap::new();
        data.insert("value", value);
        
        let response = self.client
            .post(&url)
            .header("X-Vault-Token", &self.token)
            .json(&serde_json::json!({ "data": data }))
            .send()
            .await?;
            
        if response.status() == 403 {
            return Err(VaultError::AuthenticationFailed);
        }
        
        // Invalidate cache
        let mut cache = self.cache.write().await;
        cache.remove(path);
        
        Ok(())
    }
    
    async fn delete_secret(&self, path: &str) -> Result<(), VaultError> {
        let url = format!("{}/v1/{}", self.base_url, path);
        let response = self.client
            .delete(&url)
            .header("X-Vault-Token", &self.token)
            .send()
            .await?;
            
        if response.status() == 403 {
            return Err(VaultError::AuthenticationFailed);
        }
        
        // Invalidate cache
        let mut cache = self.cache.write().await;
        cache.remove(path);
        
        Ok(())
    }
    
    async fn list_secrets(&self, path: &str) -> Result<Vec<String>, VaultError> {
        let url = format!("{}/v1/{}?list=true", self.base_url, path);
        let response = self.client
            .get(&url)
            .header("X-Vault-Token", &self.token)
            .send()
            .await?;
            
        if response.status() == 404 {
            return Ok(Vec::new());
        }
        
        if response.status() == 403 {
            return Err(VaultError::AuthenticationFailed);
        }
        
        let list_response: VaultListResponse = response.json().await?;
        Ok(list_response.data.keys)
    }
}

#[derive(Deserialize)]
struct VaultResponse {
    data: HashMap<String, String>,
}

#[derive(Deserialize)]
struct VaultListResponse {
    data: VaultListData,
}

#[derive(Deserialize)]
struct VaultListData {
    keys: Vec<String>,
}

/// Environment-based secret provider for development
pub struct EnvSecretProvider {
    prefix: String,
}

impl EnvSecretProvider {
    pub fn new(prefix: &str) -> Self {
        Self {
            prefix: prefix.to_string(),
        }
    }
}

#[async_trait]
impl SecretProvider for EnvSecretProvider {
    async fn get_secret(&self, path: &str) -> Result<String, VaultError> {
        let env_key = format!("{}_{}", self.prefix, path.to_uppercase().replace('/', "_"));
        std::env::var(&env_key)
            .map_err(|_| VaultError::SecretNotFound(path.to_string()))
    }
    
    async fn get_secret_map(&self, path: &str) -> Result<HashMap<String, String>, VaultError> {
        let prefix = format!("{}_{}_", self.prefix, path.to_uppercase().replace('/', "_"));
        let mut map = HashMap::new();
        
        for (key, value) in std::env::vars() {
            if key.starts_with(&prefix) {
                let secret_key = key.strip_prefix(&prefix).unwrap().to_lowercase();
                map.insert(secret_key, value);
            }
        }
        
        if map.is_empty() {
            Err(VaultError::SecretNotFound(path.to_string()))
        } else {
            Ok(map)
        }
    }
    
    async fn set_secret(&self, _path: &str, _value: &str) -> Result<(), VaultError> {
        // Not supported in env provider
        Ok(())
    }
    
    async fn delete_secret(&self, _path: &str) -> Result<(), VaultError> {
        // Not supported in env provider
        Ok(())
    }
    
    async fn list_secrets(&self, _path: &str) -> Result<Vec<String>, VaultError> {
        // Not supported in env provider
        Ok(Vec::new())
    }
}

/// Factory for creating secret providers
pub struct SecretProviderFactory;

impl SecretProviderFactory {
    pub fn create() -> Box<dyn SecretProvider> {
        if let (Ok(url), Ok(token)) = (
            std::env::var("VAULT_ADDR"),
            std::env::var("VAULT_TOKEN"),
        ) {
            Box::new(VaultClient::new(url, token))
        } else {
            Box::new(EnvSecretProvider::new("EDT"))
        }
    }
}

/// Secure configuration that loads from vault
#[derive(Debug, Clone)]
pub struct SecureConfig {
    provider: Arc<Box<dyn SecretProvider>>,
}

impl SecureConfig {
    pub fn new(provider: Box<dyn SecretProvider>) -> Self {
        Self {
            provider: Arc::new(provider),
        }
    }
    
    pub async fn get_database_url(&self) -> Result<String, VaultError> {
        self.provider.get_secret("database/url").await
    }
    
    pub async fn get_redis_url(&self) -> Result<String, VaultError> {
        self.provider.get_secret("redis/url").await
    }
    
    pub async fn get_jwt_secret(&self) -> Result<String, VaultError> {
        self.provider.get_secret("auth/jwt_secret").await
    }
    
    pub async fn get_smtp_config(&self) -> Result<HashMap<String, String>, VaultError> {
        self.provider.get_secret_map("smtp").await
    }
    
    pub async fn get_encryption_key(&self) -> Result<String, VaultError> {
        self.provider.get_secret("encryption/field_key").await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_env_secret_provider() {
        std::env::set_var("EDT_AUTH_JWT_SECRET", "test-secret");
        
        let provider = EnvSecretProvider::new("EDT");
        let secret = provider.get_secret("auth/jwt_secret").await.unwrap();
        
        assert_eq!(secret, "test-secret");
    }
    
    #[tokio::test]
    async fn test_env_secret_map() {
        std::env::set_var("EDT_SMTP_HOST", "smtp.example.com");
        std::env::set_var("EDT_SMTP_PORT", "587");
        
        let provider = EnvSecretProvider::new("EDT");
        let map = provider.get_secret_map("smtp").await.unwrap();
        
        assert_eq!(map.get("host").unwrap(), "smtp.example.com");
        assert_eq!(map.get("port").unwrap(), "587");
    }
}