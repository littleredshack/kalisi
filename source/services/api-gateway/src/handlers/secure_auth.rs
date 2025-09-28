use axum::{
    extract::{State, Json, Extension},
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use kalisi_core::{
    auth::JwtAuth,
    types::{User, ApiResponse},
    Error,
};
use uuid::Uuid;
use chrono::{Utc, Duration};
use crate::{
    state::AppState,
    storage::{OtpStorage, OtpPurpose, SessionStorage, EncryptedUserStorage},
    validation::{RequestValidator, InputSanitizer},
    crypto::{generate_secure_otp, generate_secure_token},
};
use tracing::{info, error, warn};
use validator::Validate;

#[derive(Debug, Deserialize, Validate)]
pub struct RequestOtpPayload {
    #[validate(email(message = "Invalid email format"))]
    #[validate(length(max = 255, message = "Email too long"))]
    pub email: String,
}

#[derive(Debug, Serialize)]
pub struct RequestOtpResponse {
    pub success: bool,
    pub message: String,
    pub email: String,
    pub expires_in: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dev_otp: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct VerifyOtpPayload {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    
    #[validate(regex(path = "crate::validation::OTP_REGEX", message = "Invalid OTP format"))]
    #[validate(length(equal = 6, message = "OTP must be 6 digits"))]
    pub otp: String,
}

#[derive(Debug, Serialize)]
pub struct VerifyOtpResponse {
    pub success: bool,
    pub token: String,
    pub user: UserInfo,
    pub expires_at: String,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: Uuid,
    pub email: String,
    pub is_verified: bool,
}

pub async fn request_otp(
    State(state): State<AppState>,
    Json(payload): Json<RequestOtpPayload>,
) -> impl IntoResponse {
    // Validate input
    if let Err(e) = payload.validate() {
        warn!("Invalid OTP request: {:?}", e);
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error("Invalid request format")),
        ).into_response();
    }
    
    // Sanitize email
    let email = match InputSanitizer::sanitize_email(&payload.email) {
        Ok(sanitized) => sanitized,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error("Invalid email format")),
            ).into_response();
        }
    };
    
    // Check if email is approved
    if !state.is_approved_email(&email) {
        warn!("Unauthorized OTP request for email: {}", email);
        
        // Record failed attempt
        let mut auth_event_storage = state.auth_event_storage.clone();
        let _ = auth_event_storage.record_failed_login(&email, "Email not authorized").await;
        
        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::error("Email not authorized for this system")),
        ).into_response();
    }
    
    // Generate secure OTP
    let otp_code = generate_secure_otp();
    
    // Store OTP in Redis with rate limiting check
    let mut otp_storage = OtpStorage::new(state.redis.clone());
    
    // Check for recent OTP requests (rate limiting)
    if let Ok(recent_count) = otp_storage.get_recent_request_count(&email).await {
        if recent_count > 5 {
            warn!("Too many OTP requests for email: {}", email);
            return (
                StatusCode::TOO_MANY_REQUESTS,
                Json(ApiResponse::<()>::error("Too many OTP requests. Please try again later.")),
            ).into_response();
        }
    }
    
    match otp_storage.store_otp(&email, &otp_code, OtpPurpose::Login).await {
        Ok(_) => {
            info!("OTP stored for email: {}", email);
            
            // Send OTP email
            match state.email_service.send_otp(&email, &otp_code).await {
                Ok(_) => {
                    info!("OTP sent to {}", email);
                }
                Err(e) => {
                    error!("Failed to send OTP email: {}", e);
                    // Continue anyway - for development, log the OTP
                    if state.config.environment == "development" {
                        info!("🔐 OTP for {}: {}", email, otp_code);
                    }
                }
            }
            
            // Record auth event
            let mut auth_event_storage = state.auth_event_storage.clone();
            let _ = auth_event_storage.record_otp_requested(&email).await;
            
            // Prepare response
            let response = RequestOtpResponse {
                success: true,
                message: "OTP sent to your email address".to_string(),
                email: email.clone(),
                expires_in: "10 minutes".to_string(),
                // Only include OTP in development mode
                dev_otp: if state.config.environment == "development" {
                    Some(otp_code)
                } else {
                    None
                },
            };
            
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            error!("Failed to store OTP: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("Failed to generate OTP")),
            ).into_response()
        }
    }
}

pub async fn verify_otp(
    State(state): State<AppState>,
    Json(payload): Json<VerifyOtpPayload>,
) -> impl IntoResponse {
    // Validate input
    if let Err(e) = payload.validate() {
        warn!("Invalid OTP verification: {:?}", e);
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error("Invalid request format")),
        ).into_response();
    }
    
    // Sanitize inputs
    let email = match InputSanitizer::sanitize_email(&payload.email) {
        Ok(sanitized) => sanitized,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error("Invalid email format")),
            ).into_response();
        }
    };
    
    // Verify OTP
    let mut otp_storage = OtpStorage::new(state.redis.clone());
    
    match otp_storage.verify_otp(&email, &payload.otp, OtpPurpose::Login).await {
        Ok(true) => {
            info!("OTP verified for email: {}", email);
            
            // Get or create user with encrypted storage
            let mut user_storage = EncryptedUserStorage::new(state.redis.clone());
            let mut user = match user_storage.find_by_email(&email).await {
                Ok(Some(u)) => u,
                Ok(None) => {
                    // Create new user
                    let new_user = User {
                        id: Uuid::new_v4(),
                        email: email.clone(),
                        is_verified: true,
                        created_at: Utc::now(),
                        last_login: Some(Utc::now()),
                    };
                    
                    if let Err(e) = user_storage.set_user(&new_user).await {
                        error!("Failed to create user: {}", e);
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ApiResponse::<()>::error("Failed to create user")),
                        ).into_response();
                    }
                    
                    new_user
                }
                Err(e) => {
                    error!("Failed to find user: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ApiResponse::<()>::error("Database error")),
                    ).into_response();
                }
            };
            
            // Update last login
            user.last_login = Some(Utc::now());
            let _ = user_storage.set_user(&user).await;
            
            // Create JWT token with secure random jti
            let jti = generate_secure_token(16);
            let token = match state.jwt_auth.create_token(user.id, &jti) {
                Ok(t) => t,
                Err(e) => {
                    error!("Failed to create JWT: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ApiResponse::<()>::error("Failed to create session")),
                    ).into_response();
                }
            };
            
            // Store session in Redis
            let mut session_storage = SessionStorage::new(state.redis.clone());
            if let Err(e) = session_storage.create_session(user.id, &jti).await {
                error!("Failed to store session: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ApiResponse::<()>::error("Failed to create session")),
                ).into_response();
            }
            
            // Record successful login
            let mut auth_event_storage = state.auth_event_storage.clone();
            let _ = auth_event_storage.record_successful_login(&email, &jti).await;
            
            // Prepare response
            let response = VerifyOtpResponse {
                success: true,
                token,
                user: UserInfo {
                    id: user.id,
                    email: user.email,
                    is_verified: user.is_verified,
                },
                expires_at: (Utc::now() + Duration::hours(24)).to_rfc3339(),
            };
            
            (StatusCode::OK, Json(response)).into_response()
        }
        Ok(false) => {
            warn!("Invalid OTP attempt for email: {}", email);
            
            // Record failed attempt
            let mut auth_event_storage = state.auth_event_storage.clone();
            let _ = auth_event_storage.record_failed_login(&email, "Invalid OTP").await;
            
            (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<()>::error("Invalid or expired OTP")),
            ).into_response()
        }
        Err(e) => {
            error!("OTP verification error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("Verification failed")),
            ).into_response()
        }
    }
}

pub async fn logout(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> impl IntoResponse {
    // Extract JTI from current session
    if let Some(jti) = state.get_current_jti(&user.id).await {
        // Invalidate session
        let mut session_storage = SessionStorage::new(state.redis.clone());
        if let Err(e) = session_storage.revoke_session(&jti).await {
            error!("Failed to revoke session: {}", e);
        }
        
        // Record logout event
        let mut auth_event_storage = state.auth_event_storage.clone();
        let _ = auth_event_storage.record_logout(&user.email, &jti).await;
    }
    
    (
        StatusCode::OK,
        Json(ApiResponse::success("Logged out successfully")),
    ).into_response()
}

pub async fn get_profile(
    Extension(user): Extension<User>,
) -> impl IntoResponse {
    let profile = UserInfo {
        id: user.id,
        email: user.email,
        is_verified: user.is_verified,
    };
    
    (StatusCode::OK, Json(profile)).into_response()
}

// Helper functions for OTP storage rate limiting
impl OtpStorage {
    pub async fn get_recent_request_count(&mut self, email: &str) -> Result<usize, redis::RedisError> {
        use redis::AsyncCommands;
        
        let key = format!("otp_rate_limit:{}", email);
        let count: Option<String> = self.redis.get(&key).await?;
        
        Ok(count.and_then(|c| c.parse().ok()).unwrap_or(0))
    }
}