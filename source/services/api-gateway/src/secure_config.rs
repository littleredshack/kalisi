use anyhow::Result;
use std::sync::Arc;
use crate::vault::{SecureConfig as VaultConfig, SecretProviderFactory};
use crate::crypto::FieldEncryption;

/// Enhanced configuration with secure secret management
#[derive(Clone)]
pub struct SecureConfiguration {
    vault_config: Arc<VaultConfig>,
    field_encryption: Arc<FieldEncryption>,
}

impl SecureConfiguration {
    pub async fn new() -> Result<Self> {
        let provider = SecretProviderFactory::create();
        let vault_config = VaultConfig::new(provider);
        
        // Get encryption key from vault or environment
        let encryption_key = vault_config.get_encryption_key().await
            .unwrap_or_else(|_| {
                // Fallback to environment variable or generate for dev
                std::env::var("FIELD_ENCRYPTION_KEY")
                    .unwrap_or_else(|_| FieldEncryption::generate_key())
            });
        
        let field_encryption = FieldEncryption::new(&encryption_key)?;
        
        Ok(Self {
            vault_config: Arc::new(vault_config),
            field_encryption: Arc::new(field_encryption),
        })
    }
    
    /// Get database configuration with decrypted credentials
    pub async fn get_database_config(&self) -> Result<DatabaseConfig> {
        let url = self.vault_config.get_database_url().await
            .unwrap_or_else(|_| std::env::var("DATABASE_URL").unwrap_or_default());
            
        // Parse the URL to extract components securely
        let config = if url.starts_with("postgres://") || url.starts_with("postgresql://") {
            parse_postgres_url(&url)?
        } else {
            DatabaseConfig {
                host: "localhost".to_string(),
                port: 5432,
                database: "edt".to_string(),
                username: "postgres".to_string(),
                password: "postgres".to_string(),
                ssl_mode: "prefer".to_string(),
            }
        };
        
        Ok(config)
    }
    
    /// Get Redis configuration with secure credentials
    pub async fn get_redis_config(&self) -> Result<RedisConfig> {
        let url = self.vault_config.get_redis_url().await
            .unwrap_or_else(|_| std::env::var("REDIS_URL").unwrap_or_default());
            
        let config = if url.starts_with("redis://") || url.starts_with("rediss://") {
            parse_redis_url(&url)?
        } else {
            RedisConfig {
                host: "localhost".to_string(),
                port: 6379,
                password: None,
                database: 0,
                use_tls: false,
            }
        };
        
        Ok(config)
    }
    
    /// Get JWT configuration with secure secret
    pub async fn get_jwt_config(&self) -> Result<JwtConfig> {
        let secret = self.vault_config.get_jwt_secret().await
            .unwrap_or_else(|_| {
                std::env::var("JWT_SECRET")
                    .unwrap_or_else(|_| {
                        // Generate a secure random secret for development
                        crate::crypto::generate_secure_token(32)
                    })
            });
            
        Ok(JwtConfig {
            secret,
            expiry_hours: 24,
            refresh_expiry_days: 7,
            issuer: "kalisi-gateway".to_string(),
            audience: "kalisi-users".to_string(),
        })
    }
    
    /// Get SMTP configuration with secure credentials
    pub async fn get_smtp_config(&self) -> Result<SmtpConfig> {
        let smtp_map = self.vault_config.get_smtp_config().await
            .unwrap_or_else(|_| std::collections::HashMap::new());
            
        Ok(SmtpConfig {
            host: smtp_map.get("host")
                .cloned()
                .unwrap_or_else(|| std::env::var("SMTP_HOST").unwrap_or_default()),
            port: smtp_map.get("port")
                .and_then(|p| p.parse().ok())
                .unwrap_or(587),
            username: smtp_map.get("username")
                .cloned()
                .unwrap_or_else(|| std::env::var("SMTP_USERNAME").unwrap_or_default()),
            password: smtp_map.get("password")
                .cloned()
                .unwrap_or_else(|| std::env::var("SMTP_PASSWORD").unwrap_or_default()),
            from_email: smtp_map.get("from_email")
                .cloned()
                .unwrap_or_else(|| std::env::var("SMTP_FROM_EMAIL").unwrap_or_default()),
            encryption: smtp_map.get("encryption")
                .cloned()
                .unwrap_or_else(|| "STARTTLS".to_string()),
        })
    }
    
    /// Get field encryption instance
    pub fn get_field_encryption(&self) -> Arc<FieldEncryption> {
        self.field_encryption.clone()
    }
    
    /// Get a generic secret from vault
    pub async fn get_secret(&self, path: &str) -> Result<String> {
        self.vault_config.provider.get_secret(path).await
            .map_err(|e| anyhow::anyhow!("Failed to get secret: {}", e))
    }
}

#[derive(Debug, Clone)]
pub struct DatabaseConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    pub ssl_mode: String,
}

#[derive(Debug, Clone)]
pub struct RedisConfig {
    pub host: String,
    pub port: u16,
    pub password: Option<String>,
    pub database: u8,
    pub use_tls: bool,
}

#[derive(Debug, Clone)]
pub struct JwtConfig {
    pub secret: String,
    pub expiry_hours: u64,
    pub refresh_expiry_days: u64,
    pub issuer: String,
    pub audience: String,
}

#[derive(Debug, Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub from_email: String,
    pub encryption: String,
}

/// Parse PostgreSQL connection URL
fn parse_postgres_url(url: &str) -> Result<DatabaseConfig> {
    let parsed = url::Url::parse(url)?;
    
    Ok(DatabaseConfig {
        host: parsed.host_str().unwrap_or("localhost").to_string(),
        port: parsed.port().unwrap_or(5432),
        database: parsed.path().trim_start_matches('/').to_string(),
        username: parsed.username().to_string(),
        password: parsed.password().unwrap_or("").to_string(),
        ssl_mode: parsed.query_pairs()
            .find(|(k, _)| k == "sslmode")
            .map(|(_, v)| v.to_string())
            .unwrap_or_else(|| "prefer".to_string()),
    })
}

/// Parse Redis connection URL
fn parse_redis_url(url: &str) -> Result<RedisConfig> {
    let parsed = url::Url::parse(url)?;
    let use_tls = parsed.scheme() == "rediss";
    
    Ok(RedisConfig {
        host: parsed.host_str().unwrap_or("localhost").to_string(),
        port: parsed.port().unwrap_or(6379),
        password: parsed.password().map(|p| p.to_string()),
        database: parsed.path()
            .trim_start_matches('/')
            .parse()
            .unwrap_or(0),
        use_tls,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_postgres_url() {
        let url = "postgresql://user:pass@localhost:5432/mydb?sslmode=require";
        let config = parse_postgres_url(url).unwrap();
        
        assert_eq!(config.host, "localhost");
        assert_eq!(config.port, 5432);
        assert_eq!(config.database, "mydb");
        assert_eq!(config.username, "user");
        assert_eq!(config.password, "pass");
        assert_eq!(config.ssl_mode, "require");
    }
    
    #[test]
    fn test_parse_redis_url() {
        let url = "redis://user:pass@localhost:6379/1";
        let config = parse_redis_url(url).unwrap();
        
        assert_eq!(config.host, "localhost");
        assert_eq!(config.port, 6379);
        assert_eq!(config.password, Some("pass".to_string()));
        assert_eq!(config.database, 1);
        assert!(!config.use_tls);
    }
}