use axum::{
    extract::{State, Extension},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use tracing::{info, error};
use uuid::Uuid;

use crate::{
    state::AppState,
    middleware::auth::AuthUser,
    mfa_simple::{TotpMfa, MfaStorage, MfaSetup, UserMfaConfig},
};
use crate::logging::security_events::{SecurityEvent as LogSecurityEvent, SecurityEventType as LogSecurityEventType};

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct MfaSetupRequest {
    // No parameters needed - just initiate setup
}

#[derive(Debug, Serialize)]
pub struct MfaSetupResponse {
    pub secret: String,
    pub qr_code_url: String,
    pub backup_codes: Vec<String>,
    pub manual_entry_key: String,
}

#[derive(Debug, Deserialize)]
pub struct MfaVerifyRequest {
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct MfaEnableRequest {
    pub code: String,
    pub backup_acknowledged: bool,
}

#[derive(Debug, Serialize)]
pub struct MfaStatusResponse {
    pub enabled: bool,
    pub has_backup_codes: bool,
    pub setup_required: bool,
}

/// Initiate MFA setup - generate QR code (for authenticated users)
#[allow(dead_code)]
pub async fn setup_mfa(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    let totp = TotpMfa::new(state.config.mfa_issuer.clone());
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    
    // Check if MFA is already enabled
    match mfa_storage.get_mfa_config(user.user_id).await {
        Ok(Some(config)) if config.enabled => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "MFA is already enabled for this account"
                }))
            ).into_response();
        }
        Err(e) => {
            error!("Failed to check existing MFA config: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to check MFA status"
                }))
            ).into_response();
        }
        _ => {}
    }
    
    // Generate new TOTP secret
    let secret = TotpMfa::generate_secret();
    let qr_url = totp.generate_qr_url(&user.email, &secret);
    let backup_codes = TotpMfa::generate_backup_codes(8);
    
    let setup = MfaSetup {
        user_id: user.user_id,
        secret: secret.clone(),
        qr_code_url: qr_url.clone(),
        backup_codes: backup_codes.clone(),
    };
    
    // Store setup session temporarily
    if let Err(e) = mfa_storage.store_setup_session(user.user_id, &setup).await {
        error!("Failed to store MFA setup session: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({
                "error": "Failed to initialize MFA setup"
            }))
        ).into_response();
    }
    
    let response = MfaSetupResponse {
        secret: secret.clone(),
        qr_code_url: qr_url,
        backup_codes,
        manual_entry_key: secret, // For manual entry in authenticator apps
    };
    
    info!("MFA setup initiated for user: {}", user.email);
    (StatusCode::OK, Json(response)).into_response()
}

/// Verify TOTP code during setup and enable MFA
#[allow(dead_code)]
pub async fn enable_mfa(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(payload): Json<MfaEnableRequest>,
) -> impl IntoResponse {
    if payload.code.len() != 6 || !payload.code.chars().all(|c| c.is_numeric()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Invalid code format. Must be 6 digits."
            }))
        ).into_response();
    }
    
    if !payload.backup_acknowledged {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "You must acknowledge that you have saved your backup codes"
            }))
        ).into_response();
    }
    
    let totp = TotpMfa::new(state.config.mfa_issuer.clone());
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    
    // Get setup session
    let setup = match mfa_storage.get_setup_session(user.user_id).await {
        Ok(Some(setup)) => setup,
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "MFA setup session expired or not found. Please restart setup."
                }))
            ).into_response();
        }
        Err(e) => {
            error!("Failed to get MFA setup session: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to retrieve setup session"
                }))
            ).into_response();
        }
    };
    
    // Verify the TOTP code
    match totp.verify_totp(&setup.secret, &payload.code, 1) {
        Ok(true) => {
            // Code is valid, enable MFA
            let config = UserMfaConfig {
                user_id: user.user_id,
                secret: setup.secret,
                enabled: true,
                backup_codes: setup.backup_codes,
                created_at: chrono::Utc::now(),
            };
            
            // Store MFA configuration
            if let Err(e) = mfa_storage.store_mfa_config(&config).await {
                error!("Failed to store MFA config: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": "Failed to enable MFA"
                    }))
                ).into_response();
            }
            
            // Clean up setup session
            let _ = mfa_storage.delete_setup_session(user.user_id).await;
            
            info!("MFA enabled successfully for user: {}", user.email);
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "message": "MFA has been successfully enabled",
                    "backup_codes_count": config.backup_codes.len()
                }))
            ).into_response()
        }
        Ok(false) => {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "Invalid verification code. Please try again."
                }))
            ).into_response()
        }
        Err(e) => {
            error!("Failed to verify TOTP code: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to verify code"
                }))
            ).into_response()
        }
    }
}

/// Complete login after MFA verification using partial token
pub async fn complete_mfa_login(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    let partial_token = match payload.get("partial_token").and_then(|v| v.as_str()) {
        Some(token) => token,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "partial_token is required"
                }))
            ).into_response();
        }
    };
    
    let code = match payload.get("code").and_then(|v| v.as_str()) {
        Some(code) => code,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "code is required"
                }))
            ).into_response();
        }
    };
    
    if code.len() != 6 || !code.chars().all(|c| c.is_numeric()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Invalid code format. Must be 6 digits."
            }))
        ).into_response();
    }
    
    // Get partial session data
    let partial_key = format!("partial_session:{}", partial_token);
    let mut redis = state.redis.clone();
    
    let partial_data: Option<String> = match redis::cmd("GET")
        .arg(&partial_key)
        .query_async(&mut redis)
        .await
    {
        Ok(data) => data,
        Err(e) => {
            error!("Failed to get partial session: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Authentication error"
                }))
            ).into_response();
        }
    };
    
    let session_info: serde_json::Value = match partial_data {
        Some(data) => match serde_json::from_str(&data) {
            Ok(info) => info,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({
                        "error": "Invalid session data"
                    }))
                ).into_response();
            }
        },
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({
                    "error": "Session expired or invalid"
                }))
            ).into_response();
        }
    };
    
    let user_id_str = match session_info.get("user_id").and_then(|v| v.as_str()) {
        Some(id) => id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "Invalid session data"
                }))
            ).into_response();
        }
    };
    
    let user_id = match Uuid::parse_str(user_id_str) {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "Invalid user ID format"
                }))
            ).into_response();
        }
    };
    
    // Get user email from session
    let user_email = session_info.get("email").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
    
    // Verify TOTP code
    let totp = TotpMfa::new(state.config.mfa_issuer.clone());
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    
    let config = match mfa_storage.get_mfa_config(user_id).await {
        Ok(Some(config)) if config.enabled => config,
        Ok(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "MFA not properly configured"
                }))
            ).into_response();
        }
        Err(e) => {
            error!("Failed to get MFA config: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to verify MFA"
                }))
            ).into_response();
        }
    };
    
    // Log MFA verification attempt
    state.logger.log_security_event(LogSecurityEvent::new(
        LogSecurityEventType::MfaRequired,
        Some(user_email.clone()),
    )
    .with_user(user_id.to_string(), Some(user_email.clone()))
    .with_details("MFA verification attempt during login".to_string())).await;
    
    // Verify TOTP code (with development bypass)
    let code_valid = if state.config.environment == "development" && code == "123456" {
        info!("🔧 Development mode: accepting test code 123456 for complete MFA");
        true
    } else {
        match totp.verify_totp(&config.secret, code, 1) {
            Ok(valid) => valid,
            Err(e) => {
                error!("TOTP verification error in complete MFA: {}", e);
                false
            }
        }
    };
    
    if code_valid {
            // Log successful MFA verification
            state.logger.log_mfa_attempt(&user_id.to_string(), &user_email, true).await;
            
            // TOTP verified - complete login
            use crate::storage::{UserStorage, SessionStorage};
            
            let user_email = session_info.get("email").and_then(|v| v.as_str()).unwrap_or("");
            
            // Get user details for JWT
            let mut user_storage = UserStorage::new(state.redis.clone());
            let user = match user_storage.get_user_by_email(user_email).await {
                Ok(Some(user)) => user,
                Ok(None) => {
                    return (
                        StatusCode::UNAUTHORIZED,
                        Json(serde_json::json!({
                            "error": "User not found"
                        }))
                    ).into_response();
                }
                Err(e) => {
                    error!("Failed to get user: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "error": "Authentication error"
                        }))
                    ).into_response();
                }
            };
            
            // Generate full JWT token
            let session_id = Uuid::new_v4();
            
            // Log token issuance
            state.logger.log_security_event(LogSecurityEvent::new(
                LogSecurityEventType::TokenIssued,
                Some(user.email.clone()),
            )
            .with_user(user.id.to_string(), Some(user.email.clone()))
            .with_details("JWT token issued after MFA verification".to_string())).await;
            
            let token = match state.jwt_auth.generate_token(&user, session_id) {
                Ok(token) => token,
                Err(e) => {
                    error!("Failed to generate token: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "error": "Failed to complete authentication"
                        }))
                    ).into_response();
                }
            };
            
            // Store session
            let mut session_storage = SessionStorage::new(state.redis.clone());
            let _ = session_storage.store_session(&session_id.to_string(), user.id, &user.email).await;
            
            // Clean up partial session
            let _: Result<(), _> = redis::cmd("DEL")
                .arg(&partial_key)
                .query_async(&mut redis)
                .await;
            
        info!("MFA login completed successfully for user: {}", user.email);
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "token": token,
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "is_verified": user.is_verified
                },
                "expires_at": (chrono::Utc::now() + chrono::Duration::hours(24)).to_rfc3339(),
                "message": "Authentication completed successfully"
            }))
        ).into_response()
    } else {
        // Log failed MFA verification
        state.logger.log_mfa_attempt(&user_id.to_string(), &user_email, false).await;
        
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "error": "Invalid MFA code"
            }))
        ).into_response()
    }
}

/// Verify MFA code during login
pub async fn verify_mfa(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(payload): Json<MfaVerifyRequest>,
) -> impl IntoResponse {
    if payload.code.len() != 6 || !payload.code.chars().all(|c| c.is_numeric()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Invalid code format. Must be 6 digits."
            }))
        ).into_response();
    }
    
    let totp = TotpMfa::new(state.config.mfa_issuer.clone());
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    
    // Get user's MFA config
    let config = match mfa_storage.get_mfa_config(user.user_id).await {
        Ok(Some(config)) if config.enabled => config,
        Ok(Some(_)) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "MFA is not enabled for this account"
                }))
            ).into_response();
        }
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "MFA is not configured for this account"
                }))
            ).into_response();
        }
        Err(e) => {
            error!("Failed to get MFA config: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to verify MFA"
                }))
            ).into_response();
        }
    };
    
    // Verify TOTP code (with development bypass)
    let code_valid = if state.config.environment == "development" && payload.code == "123456" {
        info!("🔧 Development mode: accepting test code 123456 for verify");
        true
    } else {
        match totp.verify_totp(&config.secret, &payload.code, 1) {
            Ok(valid) => valid,
            Err(e) => {
                error!("TOTP verification error: {}", e);
                false
            }
        }
    };
    
    if code_valid {
        info!("MFA verification successful for user: {}", user.email);
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "message": "MFA verification successful"
            }))
        ).into_response()
    } else {
        // TODO: Check backup codes here
        info!("MFA verification failed for user: {}", user.email);
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "error": "Invalid MFA code"
            }))
        ).into_response()
    }
}

/// Get MFA status for current user
pub async fn get_mfa_status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    
    match mfa_storage.get_mfa_config(user.user_id).await {
        Ok(Some(config)) => {
            let response = MfaStatusResponse {
                enabled: config.enabled,
                has_backup_codes: !config.backup_codes.is_empty(),
                setup_required: false,
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Ok(None) => {
            // Check if MFA is required by configuration
            let setup_required = state.config.mfa_required;
            let response = MfaStatusResponse {
                enabled: false,
                has_backup_codes: false,
                setup_required,
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            error!("Failed to get MFA status: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to get MFA status"
                }))
            ).into_response()
        }
    }
}

