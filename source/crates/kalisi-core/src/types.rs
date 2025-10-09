use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// User representation in the EDT system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub is_verified: bool,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
}

/// JWT Claims for authentication
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid, // User ID
    pub email: String,
    pub session_id: Uuid,
    pub role: String,
    pub exp: i64, // Expiration timestamp
    pub iat: i64, // Issued at timestamp
}

/// OTP (One-Time Password) data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtpData {
    pub email: String,
    pub code: String,
    pub purpose: OtpPurpose,
    pub expires_at: DateTime<Utc>,
    pub attempts: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum OtpPurpose {
    Login,
    PasswordReset,
    EmailVerification,
}

/// Session information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token: String,
    pub expires_at: DateTime<Utc>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub is_active: bool,
}

/// Health check response
#[derive(Debug, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,
    pub timestamp: DateTime<Utc>,
    pub version: String,
    pub services: ServicesStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServicesStatus {
    pub gateway: String,
    pub postgres: String,
    pub redis: String,
    pub elasticsearch: String,
}

/// API Response wrapper
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ApiResponse<T> {
    Success(T),
    Error {
        error: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        details: Option<String>,
    },
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        ApiResponse::Success(data)
    }

    pub fn error(message: impl Into<String>) -> Self {
        ApiResponse::Error {
            error: message.into(),
            details: None,
        }
    }

    pub fn error_with_details(message: impl Into<String>, details: impl Into<String>) -> Self {
        ApiResponse::Error {
            error: message.into(),
            details: Some(details.into()),
        }
    }
}
