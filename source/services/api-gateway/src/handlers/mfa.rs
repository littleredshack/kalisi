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
    mfa::{MfaService, MfaConfig, MfaType, MfaSetupResponse, MfaVerificationResult},
    validation::Validator,
};

/// MFA setup request
#[derive(Debug, Deserialize)]
pub struct MfaSetupRequest {
    pub mfa_type: MfaType,
}

/// MFA enable request
#[derive(Debug, Deserialize)]
pub struct MfaEnableRequest {
    pub code: String,
    pub backup_code_acknowledgment: bool,
}

/// MFA verify request
#[derive(Debug, Deserialize)]
pub struct MfaVerifyRequest {
    pub code: String,
}

/// MFA disable request
#[derive(Debug, Deserialize)]
pub struct MfaDisableRequest {
    pub password: String,  // Require password to disable MFA
    pub code: String,      // Current MFA code
}

/// MFA status response
#[derive(Debug, Serialize)]
pub struct MfaStatusResponse {
    pub enabled: bool,
    pub mfa_type: Option<MfaType>,
    pub backup_codes_remaining: Option<usize>,
    pub last_used: Option<chrono::DateTime<chrono::Utc>>,
}

/// Initialize MFA setup
pub async fn setup_mfa(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(payload): Json<MfaSetupRequest>,
) -> impl IntoResponse {
    let validator = Validator::new();
    
    // Currently only TOTP is implemented
    if !matches!(payload.mfa_type, MfaType::Totp) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Only TOTP is currently supported"
            }))
        ).into_response();
    }
    
    let mfa_service = MfaService::new(
        state.crypto_service.clone(),
        "EDT System".to_string()
    );
    
    // Check if MFA is already enabled
    let mut redis = state.redis.clone();
    if let Ok(Some(_)) = mfa_service.get_mfa_config(&mut redis, user.user_id).await {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "MFA is already enabled for this account"
            }))
        ).into_response();
    }
    
    // Generate TOTP secret and QR code
    match mfa_service.generate_totp_secret(&user.email).await {
        Ok((secret, uri, qr_code)) => {
            // Generate backup codes
            let backup_codes = match mfa_service.generate_backup_codes(8).await {
                Ok(codes) => codes,
                Err(e) => {
                    error!("Failed to generate backup codes: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "error": "Failed to generate backup codes"
                        }))
                    ).into_response();
                }
            };
            
            // Store temporary setup data in Redis (expires in 10 minutes)
            let setup_key = format!("mfa_setup:{}", user.user_id);
            let setup_data = serde_json::json!({
                "secret": secret,
                "backup_codes": backup_codes,
                "mfa_type": payload.mfa_type,
            });
            
            if let Err(e) = redis::cmd("SETEX")
                .arg(&setup_key)
                .arg(600) // 10 minutes
                .arg(setup_data.to_string())
                .query_async::<_, ()>(&mut redis)
                .await
            {
                error!("Failed to store MFA setup data: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": "Failed to initialize MFA setup"
                    }))
                ).into_response();
            }
            
            let response = MfaSetupResponse {
                secret,
                qr_code,
                backup_codes,
                provisioning_uri: uri,
            };
            
            info!("MFA setup initiated for user: {}", user.email);
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            error!("Failed to generate TOTP secret: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to generate MFA secret"
                }))
            ).into_response()
        }
    }
}

/// Enable MFA after verification
pub async fn enable_mfa(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(payload): Json<MfaEnableRequest>,
) -> impl IntoResponse {
    let validator = Validator::new();
    
    // Validate code format
    if !validator.validate_digits_only(&payload.code, 6) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Invalid code format"
            }))
        ).into_response();
    }
    
    if !payload.backup_code_acknowledgment {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "You must acknowledge that you have saved your backup codes"
            }))
        ).into_response();
    }
    
    let mut redis = state.redis.clone();
    let mfa_service = MfaService::new(
        state.crypto_service.clone(),
        "EDT System".to_string()
    );
    
    // Retrieve setup data
    let setup_key = format!("mfa_setup:{}", user.user_id);
    let setup_data: String = match redis::cmd("GET")
        .arg(&setup_key)
        .query_async(&mut redis)
        .await
    {
        Ok(data) => data,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "MFA setup expired or not found"
                }))
            ).into_response();
        }
    };
    
    let setup: serde_json::Value = match serde_json::from_str(&setup_data) {
        Ok(data) => data,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Invalid setup data"
                }))
            ).into_response();
        }
    };
    
    let secret = setup["secret"].as_str().unwrap_or_default();
    
    // Verify the code
    match mfa_service.verify_totp(secret, &payload.code).await {
        Ok(true) => {
            // Create MFA configuration
            let config = MfaConfig {
                user_id: user.user_id,
                mfa_type: MfaType::Totp,
                enabled: true,
                secret: secret.to_string(),
                backup_codes: setup["backup_codes"]
                    .as_array()
                    .unwrap_or(&vec![])
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect(),
                recovery_email: Some(user.email.clone()),
                created_at: chrono::Utc::now(),
                last_used: None,
            };
            
            // Store MFA configuration
            if let Err(e) = mfa_service.store_mfa_config(&mut redis, &config).await {
                error!("Failed to store MFA config: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({
                        "error": "Failed to enable MFA"
                    }))
                ).into_response();
            }
            
            // Delete setup data
            let _: Result<(), _> = redis::cmd("DEL")
                .arg(&setup_key)
                .query_async(&mut redis)
                .await;
            
            info!("MFA enabled for user: {}", user.email);
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
                    "error": "Invalid verification code"
                }))
            ).into_response()
        }
        Err(e) => {
            error!("Failed to verify TOTP: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to verify code"
                }))
            ).into_response()
        }
    }
}

/// Get MFA status
pub async fn get_mfa_status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    let mut redis = state.redis.clone();
    let mfa_service = MfaService::new(
        state.crypto_service.clone(),
        "EDT System".to_string()
    );
    
    match mfa_service.get_mfa_config(&mut redis, user.user_id).await {
        Ok(Some(config)) => {
            let response = MfaStatusResponse {
                enabled: config.enabled,
                mfa_type: Some(config.mfa_type),
                backup_codes_remaining: Some(config.backup_codes.len()),
                last_used: config.last_used,
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Ok(None) => {
            let response = MfaStatusResponse {
                enabled: false,
                mfa_type: None,
                backup_codes_remaining: None,
                last_used: None,
            };
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            error!("Failed to get MFA status: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to retrieve MFA status"
                }))
            ).into_response()
        }
    }
}

/// Regenerate backup codes
pub async fn regenerate_backup_codes(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(payload): Json<MfaVerifyRequest>,
) -> impl IntoResponse {
    let mut redis = state.redis.clone();
    let mfa_service = MfaService::new(
        state.crypto_service.clone(),
        "EDT System".to_string()
    );
    
    // Get current config
    let mut config = match mfa_service.get_mfa_config(&mut redis, user.user_id).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "MFA is not enabled"
                }))
            ).into_response();
        }
        Err(e) => {
            error!("Failed to get MFA config: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to retrieve MFA configuration"
                }))
            ).into_response();
        }
    };
    
    // Verify current MFA code
    match mfa_service.verify_totp(&config.secret, &payload.code).await {
        Ok(true) => {
            // Generate new backup codes
            match mfa_service.generate_backup_codes(8).await {
                Ok(new_codes) => {
                    config.backup_codes = new_codes.clone();
                    
                    // Store updated config
                    if let Err(e) = mfa_service.store_mfa_config(&mut redis, &config).await {
                        error!("Failed to store updated MFA config: {}", e);
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(serde_json::json!({
                                "error": "Failed to update backup codes"
                            }))
                        ).into_response();
                    }
                    
                    info!("Backup codes regenerated for user: {}", user.email);
                    (
                        StatusCode::OK,
                        Json(serde_json::json!({
                            "backup_codes": new_codes,
                            "message": "New backup codes generated. Please save them securely."
                        }))
                    ).into_response()
                }
                Err(e) => {
                    error!("Failed to generate backup codes: {}", e);
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({
                            "error": "Failed to generate new backup codes"
                        }))
                    ).into_response()
                }
            }
        }
        Ok(false) => {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "Invalid verification code"
                }))
            ).into_response()
        }
        Err(e) => {
            error!("Failed to verify MFA: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Failed to verify code"
                }))
            ).into_response()
        }
    }
}