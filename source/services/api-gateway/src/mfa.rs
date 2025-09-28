use anyhow::Result;
use base32::{self, Alphabet};
use chrono::{DateTime, Utc};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use totp_lite::{totp, Sha1};
use uuid::Uuid;
use qrcode::QrCode;
use image::Luma;

use crate::crypto::CryptoService;

/// Multi-Factor Authentication types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MfaType {
    Totp,       // Time-based One Time Password (Google Authenticator)
    Sms,        // SMS-based (future)
    Email,      // Email-based (current OTP)
    WebAuthn,   // FIDO2/WebAuthn (future)
    Backup,     // Backup codes
}

/// MFA configuration for a user
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MfaConfig {
    pub user_id: Uuid,
    pub mfa_type: MfaType,
    pub enabled: bool,
    pub secret: String,  // Encrypted
    pub backup_codes: Vec<String>,  // Encrypted
    pub recovery_email: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
}

/// MFA service for managing multi-factor authentication
pub struct MfaService {
    crypto: CryptoService,
    issuer: String,
}

impl MfaService {
    pub fn new(crypto: CryptoService, issuer: String) -> Self {
        Self { crypto, issuer }
    }

    /// Generate a new TOTP secret for a user
    pub async fn generate_totp_secret(&self, user_email: &str) -> Result<(String, String, String)> {
        // Generate random secret
        let rng = SystemRandom::new();
        let mut secret_bytes = [0u8; 20];
        rng.fill(&mut secret_bytes)?;
        
        // Encode to base32
        let secret = base32::encode(Alphabet::RFC4648 { padding: false }, &secret_bytes);
        
        // Generate provisioning URI for QR code
        let uri = format!(
            "otpauth://totp/{issuer}:{email}?secret={secret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30",
            issuer = urlencoding::encode(&self.issuer),
            email = urlencoding::encode(user_email),
            secret = secret
        );
        
        // Generate QR code
        let qr_code = self.generate_qr_code(&uri)?;
        
        Ok((secret, uri, qr_code))
    }

    /// Generate QR code as base64 PNG
    fn generate_qr_code(&self, data: &str) -> Result<String> {
        let code = QrCode::new(data)?;
        let image = code.render::<Luma<u8>>()
            .min_dimensions(200, 200)
            .build();
        
        let mut buffer = Vec::new();
        image.write_to(&mut buffer, image::ImageOutputFormat::Png)?;
        
        Ok(base64::encode(buffer))
    }

    /// Verify TOTP code
    pub async fn verify_totp(&self, secret: &str, code: &str) -> Result<bool> {
        let time = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() / 30;
        
        // Check current time slot and ±1 for clock skew
        for offset in -1i64..=1 {
            let test_time = (time as i64 + offset) as u64;
            let expected = self.generate_totp_code(secret, test_time)?;
            
            if constant_time_eq::constant_time_eq(expected.as_bytes(), code.as_bytes()) {
                return Ok(true);
            }
        }
        
        Ok(false)
    }

    /// Generate TOTP code for a given time
    fn generate_totp_code(&self, secret: &str, time: u64) -> Result<String> {
        let secret_bytes = base32::decode(Alphabet::RFC4648 { padding: false }, secret)
            .ok_or_else(|| anyhow::anyhow!("Invalid base32 secret"))?;
        
        let code = totp::<Sha1>(&secret_bytes, time);
        Ok(format!("{:06}", code))
    }

    /// Generate backup codes
    pub async fn generate_backup_codes(&self, count: usize) -> Result<Vec<String>> {
        let rng = SystemRandom::new();
        let mut codes = Vec::with_capacity(count);
        
        for _ in 0..count {
            let mut bytes = [0u8; 6];
            rng.fill(&mut bytes)?;
            
            // Convert to numeric code
            let code = format!(
                "{:03}-{:03}",
                u32::from_be_bytes([0, bytes[0], bytes[1], bytes[2]]) % 1000,
                u32::from_be_bytes([0, bytes[3], bytes[4], bytes[5]]) % 1000
            );
            codes.push(code);
        }
        
        Ok(codes)
    }

    /// Store MFA configuration (encrypted)
    pub async fn store_mfa_config(
        &self,
        redis: &mut redis::aio::MultiplexedConnection,
        config: &MfaConfig,
    ) -> Result<()> {
        let mut encrypted_config = config.clone();
        
        // Encrypt sensitive fields
        encrypted_config.secret = self.crypto.encrypt_field(&config.secret)?;
        encrypted_config.backup_codes = config.backup_codes
            .iter()
            .map(|code| self.crypto.encrypt_field(code))
            .collect::<Result<Vec<_>>>()?;
        
        let key = format!("mfa:{}", config.user_id);
        let value = serde_json::to_string(&encrypted_config)?;
        
        redis::cmd("SET")
            .arg(&key)
            .arg(value)
            .query_async::<_, ()>(redis)
            .await?;
        
        Ok(())
    }

    /// Retrieve MFA configuration (decrypted)
    pub async fn get_mfa_config(
        &self,
        redis: &mut redis::aio::MultiplexedConnection,
        user_id: Uuid,
    ) -> Result<Option<MfaConfig>> {
        let key = format!("mfa:{}", user_id);
        let value: Option<String> = redis::cmd("GET")
            .arg(&key)
            .query_async(redis)
            .await?;
        
        match value {
            Some(json) => {
                let mut config: MfaConfig = serde_json::from_str(&json)?;
                
                // Decrypt sensitive fields
                config.secret = self.crypto.decrypt_field(&config.secret)?;
                config.backup_codes = config.backup_codes
                    .iter()
                    .map(|code| self.crypto.decrypt_field(code))
                    .collect::<Result<Vec<_>>>()?;
                
                Ok(Some(config))
            }
            None => Ok(None),
        }
    }

    /// Verify backup code
    pub async fn verify_backup_code(
        &self,
        redis: &mut redis::aio::MultiplexedConnection,
        user_id: Uuid,
        code: &str,
    ) -> Result<bool> {
        let mut config = match self.get_mfa_config(redis, user_id).await? {
            Some(c) => c,
            None => return Ok(false),
        };
        
        // Find and remove the used backup code
        if let Some(index) = config.backup_codes.iter().position(|c| c == code) {
            config.backup_codes.remove(index);
            
            // Update configuration
            self.store_mfa_config(redis, &config).await?;
            
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Enforce MFA requirement based on risk factors
    pub async fn requires_mfa(&self, user_email: &str, ip: &str, user_agent: &str) -> bool {
        // Banking requirement: Always require MFA for production
        if std::env::var("ENVIRONMENT").unwrap_or_default() == "production" {
            return true;
        }
        
        // Risk-based MFA for development/staging
        let mut risk_score = 0;
        
        // Check for high-risk email domains
        if user_email.ends_with("@bank.com") || user_email.ends_with("@finance.com") {
            risk_score += 50;
        }
        
        // Check for suspicious IPs (simplified)
        if ip.starts_with("10.") || ip.starts_with("192.168.") {
            risk_score += 0; // Internal network
        } else {
            risk_score += 20; // External access
        }
        
        // Check user agent for automation tools
        let ua_lower = user_agent.to_lowercase();
        if ua_lower.contains("curl") || ua_lower.contains("wget") || ua_lower.contains("bot") {
            risk_score += 30;
        }
        
        risk_score >= 40
    }
}

/// MFA verification result
#[derive(Debug, Serialize, Deserialize)]
pub struct MfaVerificationResult {
    pub verified: bool,
    pub mfa_type: Option<MfaType>,
    pub remaining_backup_codes: Option<usize>,
}

/// MFA setup response
#[derive(Debug, Serialize, Deserialize)]
pub struct MfaSetupResponse {
    pub secret: String,
    pub qr_code: String,  // Base64 PNG
    pub backup_codes: Vec<String>,
    pub provisioning_uri: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_totp_generation_and_verification() {
        let crypto = CryptoService::new("test-key".to_string());
        let mfa = MfaService::new(crypto, "EDT Test".to_string());
        
        let (secret, uri, _qr) = mfa.generate_totp_secret("test@example.com")
            .await
            .unwrap();
        
        assert!(!secret.is_empty());
        assert!(uri.contains("otpauth://totp/"));
        
        // Generate a code
        let time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() / 30;
        
        let code = mfa.generate_totp_code(&secret, time).unwrap();
        assert_eq!(code.len(), 6);
        
        // Verify the code
        let verified = mfa.verify_totp(&secret, &code).await.unwrap();
        assert!(verified);
    }

    #[tokio::test]
    async fn test_backup_codes() {
        let crypto = CryptoService::new("test-key".to_string());
        let mfa = MfaService::new(crypto, "EDT Test".to_string());
        
        let codes = mfa.generate_backup_codes(8).await.unwrap();
        assert_eq!(codes.len(), 8);
        
        for code in codes {
            assert_eq!(code.len(), 7); // XXX-XXX format
            assert!(code.contains('-'));
        }
    }

    #[test]
    fn test_risk_based_mfa() {
        let crypto = CryptoService::new("test-key".to_string());
        let mfa = MfaService::new(crypto, "EDT Test".to_string());
        
        // Internal IP, normal browser
        assert!(!mfa.requires_mfa("user@company.com", "192.168.1.1", "Mozilla/5.0").await);
        
        // External IP, normal browser
        assert!(mfa.requires_mfa("user@company.com", "1.2.3.4", "Mozilla/5.0").await);
        
        // Bank email always requires MFA
        assert!(mfa.requires_mfa("admin@bank.com", "192.168.1.1", "Mozilla/5.0").await);
        
        // Automation tools require MFA
        assert!(mfa.requires_mfa("user@company.com", "192.168.1.1", "curl/7.0").await);
    }
}