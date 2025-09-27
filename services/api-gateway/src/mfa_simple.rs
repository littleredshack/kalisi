use anyhow::Result;
// Using base32 crate
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

/// TOTP implementation for MFA
pub struct TotpMfa {
    issuer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaSetup {
    pub user_id: Uuid,
    pub secret: String,
    pub qr_code_url: String,
    pub backup_codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMfaConfig {
    pub user_id: Uuid,
    pub secret: String,
    pub enabled: bool,
    pub backup_codes: Vec<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl TotpMfa {
    pub fn new(issuer: String) -> Self {
        Self { issuer }
    }

    /// Generate a new secret for TOTP
    pub fn generate_secret() -> String {
        use ring::rand::{SecureRandom, SystemRandom};
        
        let rng = SystemRandom::new();
        let mut secret = [0u8; 20]; // 160-bit secret
        rng.fill(&mut secret).unwrap();
        
        base32::encode(base32::Alphabet::Rfc4648 { padding: true }, &secret)
    }

    /// Generate QR code URL for authenticator apps
    pub fn generate_qr_url(&self, user_email: &str, secret: &str) -> String {
        let label = format!("{}:{}", self.issuer, user_email);
        let issuer = urlencoding::encode(&self.issuer);
        let label_encoded = urlencoding::encode(&label);
        
        format!(
            "otpauth://totp/{}?secret={}&issuer={}",
            label_encoded, secret, issuer
        )
    }

    /// Verify a TOTP code
    pub fn verify_totp(&self, secret: &str, code: &str, window: i64) -> Result<bool> {
        let code_num: u32 = code.parse().map_err(|_| anyhow::anyhow!("Invalid code format"))?;
        
        let current_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        let current_step = current_time / 30;
        
        // Check current time and nearby time windows (±window)
        for i in -window..=window {
            let step = current_step as i64 + i;
            if step < 0 { continue; }
            
            let generated_code = self.generate_totp(secret, step as u64)?;
            if generated_code == code_num {
                return Ok(true);
            }
        }
        
        Ok(false)
    }

    /// Generate TOTP code for a given time step (public for debugging)
    pub fn generate_totp_for_step(&self, secret: &str, time_step: u64) -> Result<u32> {
        self.generate_totp(secret, time_step)
    }

    /// Generate TOTP code for a given time step
    fn generate_totp(&self, secret: &str, time_step: u64) -> Result<u32> {
        let secret_bytes = base32::decode(base32::Alphabet::Rfc4648 { padding: true }, secret)
            .ok_or_else(|| anyhow::anyhow!("Invalid secret format"))?;
        
        let time_bytes = time_step.to_be_bytes();
        
        // HMAC-SHA1
        let mac = ring::hmac::Key::new(ring::hmac::HMAC_SHA1_FOR_LEGACY_USE_ONLY, &secret_bytes);
        let signature = ring::hmac::sign(&mac, &time_bytes);
        let hash = signature.as_ref();
        
        // Dynamic truncation
        let offset = (hash[19] & 0xf) as usize;
        let code = ((hash[offset] & 0x7f) as u32) << 24
            | ((hash[offset + 1] & 0xff) as u32) << 16
            | ((hash[offset + 2] & 0xff) as u32) << 8
            | (hash[offset + 3] & 0xff) as u32;
        
        Ok(code % 1_000_000)
    }

    /// Generate backup codes
    pub fn generate_backup_codes(count: usize) -> Vec<String> {
        use ring::rand::{SecureRandom, SystemRandom};
        
        let rng = SystemRandom::new();
        let mut codes = Vec::new();
        
        for _ in 0..count {
            let mut bytes = [0u8; 4];
            rng.fill(&mut bytes).unwrap();
            let code = u32::from_be_bytes(bytes) % 100_000_000;
            codes.push(format!("{:08}", code));
        }
        
        codes
    }
}

/// MFA storage operations
pub struct MfaStorage {
    redis: redis::aio::MultiplexedConnection,
}

impl MfaStorage {
    pub fn new(redis: redis::aio::MultiplexedConnection) -> Self {
        Self { redis }
    }

    /// Store MFA configuration for a user
    pub async fn store_mfa_config(&mut self, config: &UserMfaConfig) -> Result<()> {
        let key = format!("mfa:user:{}", config.user_id);
        let data = serde_json::to_string(config)?;
        
        redis::cmd("SET")
            .arg(&key)
            .arg(&data)
            .query_async::<()>(&mut self.redis)
            .await?;
        
        Ok(())
    }

    /// Get MFA configuration for a user
    pub async fn get_mfa_config(&mut self, user_id: Uuid) -> Result<Option<UserMfaConfig>> {
        let key = format!("mfa:user:{}", user_id);
        
        let data: Option<String> = redis::cmd("GET")
            .arg(&key)
            .query_async(&mut self.redis)
            .await?;
        
        if let Some(json) = data {
            let config = serde_json::from_str(&json)?;
            Ok(Some(config))
        } else {
            Ok(None)
        }
    }

    /// Store temporary MFA setup data
    pub async fn store_setup_session(&mut self, user_id: Uuid, setup: &MfaSetup) -> Result<()> {
        let key = format!("mfa:setup:{}", user_id);
        let data = serde_json::to_string(setup)?;
        
        // Store for 10 minutes
        redis::cmd("SETEX")
            .arg(&key)
            .arg(600)
            .arg(&data)
            .query_async::<()>(&mut self.redis)
            .await?;
        
        Ok(())
    }

    /// Get temporary MFA setup data
    pub async fn get_setup_session(&mut self, user_id: Uuid) -> Result<Option<MfaSetup>> {
        let key = format!("mfa:setup:{}", user_id);
        
        let data: Option<String> = redis::cmd("GET")
            .arg(&key)
            .query_async(&mut self.redis)
            .await?;
        
        if let Some(json) = data {
            let setup = serde_json::from_str(&json)?;
            Ok(Some(setup))
        } else {
            Ok(None)
        }
    }

    /// Delete setup session
    pub async fn delete_setup_session(&mut self, user_id: Uuid) -> Result<()> {
        let key = format!("mfa:setup:{}", user_id);
        
        redis::cmd("DEL")
            .arg(&key)
            .query_async::<()>(&mut self.redis)
            .await?;
        
        Ok(())
    }

    /// Delete MFA configuration for a user
    pub async fn delete_mfa_config(&mut self, user_id: Uuid) -> Result<()> {
        let key = format!("mfa:user:{}", user_id);
        
        redis::cmd("DEL")
            .arg(&key)
            .query_async::<()>(&mut self.redis)
            .await?;
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_generation() {
        let secret = TotpMfa::generate_secret();
        assert!(!secret.is_empty());
        assert!(secret.len() >= 32); // Base32 encoded 20 bytes should be 32+ chars
    }

    #[test]
    fn test_qr_url_generation() {
        let totp = TotpMfa::new("EDT System".to_string());
        let url = totp.generate_qr_url("test@example.com", "JBSWY3DPEHPK3PXP");
        
        assert!(url.starts_with("otpauth://totp/"));
        assert!(url.contains("EDT%20System"));
        assert!(url.contains("test%40example.com"));
        assert!(url.contains("secret=JBSWY3DPEHPK3PXP"));
    }

    #[test]
    fn test_backup_codes() {
        let codes = TotpMfa::generate_backup_codes(8);
        assert_eq!(codes.len(), 8);
        
        for code in codes {
            assert_eq!(code.len(), 8);
            assert!(code.chars().all(|c| c.is_numeric()));
        }
    }
}