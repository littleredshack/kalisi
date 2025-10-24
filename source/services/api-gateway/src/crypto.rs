#![allow(dead_code)]
// Cryptographic utilities - kept for future use

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use argon2::{
    password_hash::{
        rand_core::RngCore, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
    },
    Argon2,
};
use base64::{engine::general_purpose, Engine as _};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Encryption failed: {0}")]
    EncryptionError(String),

    #[error("Decryption failed: {0}")]
    DecryptionError(String),

    #[error("Key derivation failed: {0}")]
    KeyDerivationError(String),

    #[error("Invalid key format")]
    InvalidKeyFormat,

    #[error("Invalid nonce")]
    InvalidNonce,

    #[error("Base64 decode error: {0}")]
    Base64Error(#[from] base64::DecodeError),
}

/// Field-level encryption for sensitive data
#[derive(Clone)]
pub struct FieldEncryption {
    cipher: Arc<Aes256Gcm>,
    rng: Arc<SystemRandom>,
}

impl FieldEncryption {
    /// Create a new field encryption instance from a base64-encoded key
    pub fn new(key_base64: &str) -> Result<Self, CryptoError> {
        let key_bytes = general_purpose::STANDARD
            .decode(key_base64)
            .map_err(|_| CryptoError::InvalidKeyFormat)?;

        if key_bytes.len() != 32 {
            return Err(CryptoError::InvalidKeyFormat);
        }

        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);

        Ok(Self {
            cipher: Arc::new(cipher),
            rng: Arc::new(SystemRandom::new()),
        })
    }

    /// Generate a new encryption key
    pub fn generate_key() -> String {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        general_purpose::STANDARD.encode(key)
    }

    /// Encrypt a string value
    pub fn encrypt_string(&self, plaintext: &str) -> Result<String, CryptoError> {
        let mut nonce_bytes = [0u8; 12];
        self.rng
            .fill(&mut nonce_bytes)
            .map_err(|_| CryptoError::EncryptionError("Failed to generate nonce".to_string()))?;

        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = self
            .cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| CryptoError::EncryptionError(e.to_string()))?;

        // Combine nonce and ciphertext
        let mut combined = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
        combined.extend_from_slice(&nonce_bytes);
        combined.extend_from_slice(&ciphertext);

        Ok(general_purpose::STANDARD.encode(&combined))
    }

    /// Decrypt a string value
    pub fn decrypt_string(&self, encrypted: &str) -> Result<String, CryptoError> {
        let combined = general_purpose::STANDARD.decode(encrypted)?;

        if combined.len() < 12 {
            return Err(CryptoError::InvalidNonce);
        }

        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        let plaintext = self
            .cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| CryptoError::DecryptionError(e.to_string()))?;

        String::from_utf8(plaintext).map_err(|e| CryptoError::DecryptionError(e.to_string()))
    }
}

/// Secure data envelope for encrypted storage
#[derive(Serialize, Deserialize, Clone)]
pub struct EncryptedEnvelope {
    pub data: String,
    pub algorithm: String,
    pub key_id: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl EncryptedEnvelope {
    pub fn new(encrypted_data: String, key_id: String) -> Self {
        Self {
            data: encrypted_data,
            algorithm: "AES-256-GCM".to_string(),
            key_id,
            created_at: chrono::Utc::now(),
        }
    }
}

/// Key management for encryption keys
pub struct KeyManager {
    current_key_id: String,
    keys: std::collections::HashMap<String, FieldEncryption>,
}

impl Default for KeyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl KeyManager {
    pub fn new() -> Self {
        let default_key_id = "default-v1".to_string();
        let mut keys = std::collections::HashMap::new();

        // In production, this should load from a secure key store
        if let Ok(key) = std::env::var("FIELD_ENCRYPTION_KEY") {
            if let Ok(encryption) = FieldEncryption::new(&key) {
                keys.insert(default_key_id.clone(), encryption);
            }
        } else {
            // Generate a key for development only
            tracing::warn!("No FIELD_ENCRYPTION_KEY found, generating temporary key");
            let key = FieldEncryption::generate_key();
            if let Ok(encryption) = FieldEncryption::new(&key) {
                keys.insert(default_key_id.clone(), encryption);
            }
        }

        Self {
            current_key_id: default_key_id,
            keys,
        }
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<EncryptedEnvelope, CryptoError> {
        let encryption = self
            .keys
            .get(&self.current_key_id)
            .ok_or(CryptoError::InvalidKeyFormat)?;

        let encrypted = encryption.encrypt_string(plaintext)?;
        Ok(EncryptedEnvelope::new(
            encrypted,
            self.current_key_id.clone(),
        ))
    }

    pub fn decrypt(&self, envelope: &EncryptedEnvelope) -> Result<String, CryptoError> {
        let encryption = self
            .keys
            .get(&envelope.key_id)
            .ok_or(CryptoError::InvalidKeyFormat)?;

        encryption.decrypt_string(&envelope.data)
    }
}

/// Enhanced password hashing with Argon2id
pub struct SecurePasswordHasher {
    hasher: Argon2<'static>,
}

impl Default for SecurePasswordHasher {
    fn default() -> Self {
        Self::new()
    }
}

impl SecurePasswordHasher {
    pub fn new() -> Self {
        // Use Argon2id variant for better security
        let hasher = Argon2::default();
        Self { hasher }
    }

    pub fn hash_password(&self, password: &str) -> Result<String, CryptoError> {
        let salt = SaltString::generate(&mut OsRng);

        self.hasher
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|e| CryptoError::KeyDerivationError(e.to_string()))
    }

    pub fn verify_password(&self, password: &str, hash: &str) -> Result<bool, CryptoError> {
        let parsed_hash =
            PasswordHash::new(hash).map_err(|e| CryptoError::KeyDerivationError(e.to_string()))?;

        Ok(self
            .hasher
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }
}

/// Secure token generation
pub fn generate_secure_token(length: usize) -> String {
    let mut bytes = vec![0u8; length];
    OsRng.fill_bytes(&mut bytes);
    general_purpose::URL_SAFE_NO_PAD.encode(&bytes)
}

/// Main crypto service for the application
#[derive(Clone)]
pub struct CryptoService {
    pub key_manager: Arc<KeyManager>,
    pub password_hasher: Arc<SecurePasswordHasher>,
}

impl CryptoService {
    pub fn new() -> Self {
        Self {
            key_manager: Arc::new(KeyManager::new()),
            password_hasher: Arc::new(SecurePasswordHasher::new()),
        }
    }

    pub fn encrypt_field(&self, plaintext: &str) -> Result<EncryptedEnvelope, CryptoError> {
        self.key_manager.encrypt(plaintext)
    }

    pub fn decrypt_field(&self, envelope: &EncryptedEnvelope) -> Result<String, CryptoError> {
        self.key_manager.decrypt(envelope)
    }

    pub fn hash_password(&self, password: &str) -> Result<String, CryptoError> {
        self.password_hasher.hash_password(password)
    }

    pub fn verify_password(&self, password: &str, hash: &str) -> Result<bool, CryptoError> {
        self.password_hasher.verify_password(password, hash)
    }
}

impl Default for CryptoService {
    fn default() -> Self {
        Self::new()
    }
}

/// Generate a cryptographically secure OTP
pub fn generate_secure_otp() -> String {
    let mut bytes = [0u8; 3]; // 3 bytes = 24 bits = ~16.7M possibilities
    OsRng.fill_bytes(&mut bytes);
    let num = u32::from_be_bytes([0, bytes[0], bytes[1], bytes[2]]);
    format!("{:06}", num % 1_000_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_encryption() {
        let key = FieldEncryption::generate_key();
        let encryption = FieldEncryption::new(&key).unwrap();

        let plaintext = "sensitive data";
        let encrypted = encryption.encrypt_string(plaintext).unwrap();
        let decrypted = encryption.decrypt_string(&encrypted).unwrap();

        assert_eq!(plaintext, decrypted);
        assert_ne!(plaintext, encrypted);
    }

    #[test]
    fn test_password_hashing() {
        let hasher = SecurePasswordHasher::new();
        // Use environment variable for test password
        let password =
            std::env::var("TEST_PASSWORD").unwrap_or_else(|_| "test_password_123".to_string());

        let hash = hasher.hash_password(&password).unwrap();
        assert!(hasher.verify_password(&password, &hash).unwrap());
        assert!(!hasher.verify_password("different_password", &hash).unwrap());
    }

    #[test]
    fn test_secure_token_generation() {
        let token1 = generate_secure_token(32);
        let token2 = generate_secure_token(32);

        assert_ne!(token1, token2);
        assert_eq!(token1.len(), 43); // Base64 URL-safe encoding of 32 bytes
    }

    #[test]
    fn test_secure_otp_generation() {
        let otp = generate_secure_otp();
        assert_eq!(otp.len(), 6);
        assert!(otp.chars().all(|c| c.is_numeric()));
    }
}
