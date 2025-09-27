use axum::{
    extract::{State, Extension},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{info, error};
use uuid::Uuid;

use crate::{
    state::AppState,
    middleware::partial_auth::PartialAuthUser,
    mfa_simple::{TotpMfa, MfaStorage, MfaSetup, UserMfaConfig},
    handlers::mfa_simple::{MfaSetupResponse, MfaEnableRequest},
};

/// Initiate MFA setup with partial token - generate QR code
pub async fn setup_mfa_partial(
    State(state): State<AppState>,
    Extension(user): Extension<PartialAuthUser>,
) -> impl IntoResponse {
    // Verify user is in MFA setup stage
    if user.stage != "mfa_setup_required" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Invalid authentication stage for MFA setup"
            }))
        ).into_response();
    }
    
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
    
    info!("MFA setup initiated for user (partial auth): {}", user.email);
    (StatusCode::OK, Json(response)).into_response()
}

/// Verify TOTP code during setup and enable MFA with partial token
pub async fn enable_mfa_partial(
    State(state): State<AppState>,
    Extension(user): Extension<PartialAuthUser>,
    Json(payload): Json<MfaEnableRequest>,
) -> impl IntoResponse {
    // Verify user is in MFA setup stage
    if user.stage != "mfa_setup_required" {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Invalid authentication stage for MFA enable"
            }))
        ).into_response();
    }
    
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
    
    // Verify the TOTP code (with development bypass)
    let code_valid = if state.config.environment == "development" && payload.code == "123456" {
        info!("🔧 Development mode: accepting test code 123456");
        true
    } else {
        match totp.verify_totp(&setup.secret, &payload.code, 1) {
            Ok(valid) => valid,
            Err(e) => {
                error!("TOTP verification error: {}", e);
                false
            }
        }
    };
    
    if code_valid {
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
            
            // Generate full authentication token now that MFA is set up
            use crate::storage::{UserStorage, SessionStorage};
            
            // Get user details for JWT
            let mut user_storage = UserStorage::new(state.redis.clone());
            let user_data = match user_storage.get_user_by_email(&user.email).await {
                Ok(Some(u)) => u,
                Ok(None) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
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
                            "error": "Failed to complete setup"
                        }))
                    ).into_response();
                }
            };
            
            // Generate full JWT token
            let session_id = Uuid::new_v4();
            let token = match state.jwt_auth.generate_token(&user_data, session_id) {
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
            let _ = session_storage.store_session(&session_id.to_string(), user_data.id, &user_data.email).await;
            
            // Clean up partial session if exists
            let partial_key = format!("partial_session:{}", user.user_id);
            let mut redis = state.redis.clone();
            let _: Result<(), _> = redis::cmd("DEL")
                .arg(&partial_key)
                .query_async(&mut redis)
                .await;
            
        info!("MFA enabled successfully for user (partial auth): {}", user.email);
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "success": true,
                "message": "MFA has been successfully enabled",
                "backup_codes_count": config.backup_codes.len(),
                "token": token,
                "user": {
                    "id": user_data.id,
                    "email": user_data.email,
                    "is_verified": user_data.is_verified
                },
                "expires_at": (chrono::Utc::now() + chrono::Duration::hours(24)).to_rfc3339()
            }))
        ).into_response()
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error": "Invalid verification code. Please try again."
            }))
        ).into_response()
    }
}