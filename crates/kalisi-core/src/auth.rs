use crate::types::{Claims, User};
use crate::error::{Error, Result};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use chrono::{Duration, Utc};
use uuid::Uuid;

/// JWT token utilities
pub struct JwtAuth {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    validation: Validation,
}

impl JwtAuth {
    /// Create a new JWT auth handler with the given secret
    pub fn new(secret: &str) -> Self {
        Self {
            encoding_key: EncodingKey::from_secret(secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(secret.as_bytes()),
            validation: Validation::default(),
        }
    }
    
    /// Generate a JWT token for a user
    pub fn generate_token(&self, user: &User, session_id: Uuid) -> Result<String> {
        let now = Utc::now();
        let exp = now + Duration::hours(24);
        
        let claims = Claims {
            sub: user.id,
            email: user.email.clone(),
            session_id,
            role: "user".to_string(),
            exp: exp.timestamp(),
            iat: now.timestamp(),
        };
        
        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|_| Error::Internal)
    }
    
    /// Verify and decode a JWT token
    pub fn verify_token(&self, token: &str) -> Result<Claims> {
        let token_data = decode::<Claims>(token, &self.decoding_key, &self.validation)?;
        Ok(token_data.claims)
    }
}

/// Generate a random 6-digit OTP code
pub fn generate_otp() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    format!("{:06}", rng.gen_range(100000..1000000))
}

/// Hash a password using Argon2
pub async fn hash_password(password: &str) -> Result<String> {
    use argon2::{password_hash::{rand_core::OsRng, PasswordHasher, SaltString}, Argon2};
    
    let password = password.to_string();
    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        argon2.hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|_| Error::Internal)
    })
    .await
    .map_err(|_| Error::Internal)?
}

/// Verify a password against its hash
pub async fn verify_password(password: &str, hash: &str) -> Result<bool> {
    use argon2::{password_hash::PasswordHash, Argon2, PasswordVerifier};
    
    let password = password.to_string();
    let hash = hash.to_string();
    tokio::task::spawn_blocking(move || {
        let parsed_hash = PasswordHash::new(&hash)
            .map_err(|_| Error::Internal)?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    })
    .await
    .map_err(|_| Error::Internal)?
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_otp_generation() {
        let otp = generate_otp();
        assert_eq!(otp.len(), 6);
        assert!(otp.chars().all(|c| c.is_numeric()));
    }
    
    #[tokio::test]
    async fn test_password_hashing() {
        let password = "test_password123";
        let hash = hash_password(password).await.unwrap();
        assert!(verify_password(password, &hash).await.unwrap());
        
        let wrong_password = "wrong_password456";
        assert!(!verify_password(wrong_password, &hash).await.unwrap());
    }
}