use axum::{
    extract::{Extension, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use tracing::{error, info};
use uuid::Uuid;

use crate::{
    logging::security_events::{SecurityEvent, SecurityEventType, SecuritySeverity},
    mfa_simple::{MfaStorage, TotpMfa, UserMfaConfig},
    middleware::partial_auth::PartialAuthUser,
    state::AppState,
    storage::{session::SessionStorage, user::UserStorage},
};
use kalisi_core::types::ApiResponse;

// ================================
// REQUEST/RESPONSE TYPES
// ================================

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub method: String, // "email" or "totp"
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct VerifyRequest {
    pub session_id: String,
    pub otp_code: String,
}

#[derive(Debug, Deserialize)]
pub struct MfaVerifyRequest {
    pub totp_code: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct MfaSetupCompleteRequest {
    pub totp_code: String,
    pub backup_codes_saved: bool,
}

#[derive(Debug, Serialize)]
pub struct NextStep {
    pub action: String,
    pub endpoint: String,
    pub expires_in: Option<i64>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct LoginResponse {
    pub success: bool,
    pub session_id: Option<String>,
    pub auth_method: String,
    pub next_step: NextStep,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    pub success: bool,
    pub partial_token: String,
    pub next_step: NextStep,
}

#[derive(Debug, Serialize)]
pub struct MfaStatus {
    pub required: bool,
    pub configured: bool,
}

#[derive(Debug, Serialize)]
pub struct PartialAuthResponse {
    pub success: bool,
    pub partial_token: String,
    pub mfa_status: MfaStatus,
    pub next_step: NextStep,
    pub expires_in: i64,
}

#[derive(Debug, Serialize)]
pub struct MfaStatusResponse {
    pub success: bool,
    pub configured: bool,
    pub method: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MfaSetupResponse {
    pub success: bool,
    pub secret: String,
    pub qr_code_url: String,
    pub backup_codes: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub mfa_enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub success: bool,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub user: UserInfo,
    pub expires_in: i64,
}

// ================================
// HANDLERS
// ================================

/// Unified login endpoint - handles both email and TOTP initial authentication
pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    info!(
        "V2 Login attempt for email: {} with method: {}",
        payload.email, payload.method
    );

    // Validate email is approved
    if !state.is_approved_email(&payload.email) {
        state
            .logger
            .log_security_event(
                SecurityEvent::new(SecurityEventType::LoginFailure, Some(payload.email.clone()))
                    .with_details(format!(
                        "Unauthorized email attempted V2 login: {}",
                        payload.email
                    ))
                    .with_severity(SecuritySeverity::Medium),
            )
            .await;

        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::error(
                "Email not authorized for this system",
            )),
        )
            .into_response();
    }

    match payload.method.as_str() {
        "email" => handle_email_login(state, payload.email).await,
        "totp" => handle_totp_login(state, payload.email).await,
        _ => (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Invalid authentication method. Use 'email' or 'totp'",
            )),
        )
            .into_response(),
    }
}

async fn handle_email_login(
    _state: AppState,
    _email: String,
) -> axum::response::Response<axum::body::Body> {
    // TODO: Implement email OTP flow when needed
    // For now, EDT is TOTP-only, so redirect to TOTP flow
    (
        StatusCode::BAD_REQUEST,
        Json(ApiResponse::<()>::error(
            "Email OTP not implemented. Use method: 'totp'",
        )),
    )
        .into_response()
}

async fn handle_totp_login(
    state: AppState,
    email: String,
) -> axum::response::Response<axum::body::Body> {
    // Check if user exists, auto-register if not
    let mut user_storage = UserStorage::new(state.redis.clone());
    let user = match user_storage.get_user_by_email(&email).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            // Auto-register for allowed emails
            let new_user = kalisi_core::types::User {
                id: Uuid::new_v4(),
                email: email.clone(),
                is_verified: true,
                created_at: Utc::now(),
                last_login: Some(Utc::now()),
            };

            match user_storage.store_user(&new_user).await {
                Ok(_) => {
                    info!("Auto-registered user for TOTP auth: {}", email);
                    new_user
                }
                Err(e) => {
                    error!("Failed to auto-register user: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ApiResponse::<()>::error("Failed to register user")),
                    )
                        .into_response();
                }
            }
        }
        Err(e) => {
            error!("Failed to check user: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("Database error")),
            )
                .into_response();
        }
    };

    // Check MFA status
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    let has_mfa_setup = match mfa_storage.get_mfa_config(user.id).await {
        Ok(Some(config)) => config.enabled,
        _ => false,
    };

    // Generate partial token
    let partial_session_id = Uuid::new_v4();
    let partial_key = format!("partial_session:{}", partial_session_id);
    let partial_data = serde_json::json!({
        "user_id": user.id,
        "email": user.email,
        "stage": if has_mfa_setup { "mfa_required" } else { "mfa_setup_required" },
        "expires_at": (Utc::now() + Duration::minutes(10)).timestamp()
    });

    // Store partial session
    let mut redis = state.redis.clone();
    if let Err(e) = redis::cmd("SET")
        .arg(&partial_key)
        .arg(partial_data.to_string())
        .arg("EX")
        .arg(600) // 10 minutes
        .query_async::<()>(&mut redis)
        .await
    {
        error!("Failed to store partial session: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(
                "Failed to store authentication session",
            )),
        )
            .into_response();
    }

    let response = PartialAuthResponse {
        success: true,
        partial_token: partial_session_id.to_string(),
        mfa_status: MfaStatus {
            required: true,
            configured: has_mfa_setup,
        },
        next_step: NextStep {
            action: if has_mfa_setup {
                "verify_mfa".to_string()
            } else {
                "setup_mfa".to_string()
            },
            endpoint: if has_mfa_setup {
                "/v2/auth/mfa/verify".to_string()
            } else {
                "/v2/auth/mfa/status".to_string()
            },
            expires_in: Some(600),
        },
        expires_in: 600,
    };

    // Log successful partial authentication
    state
        .logger
        .log_security_event(
            SecurityEvent::new(SecurityEventType::TokenIssued, Some(email.to_string()))
                .with_details(format!("V2 Partial token issued for user: {}", email)),
        )
        .await;

    (StatusCode::OK, Json(response)).into_response()
}

/// Reset MFA configuration (for secret mismatch recovery)
pub async fn mfa_reset(
    State(state): State<AppState>,
    Extension(user): Extension<PartialAuthUser>,
) -> impl IntoResponse {
    info!("🔧 MFA Reset requested for user: {}", user.email);

    // Delete existing MFA configuration
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    if let Err(e) = mfa_storage.delete_mfa_config(user.user_id).await {
        error!("❌ MFA Reset - Failed to delete MFA config: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(
                "Failed to reset MFA configuration",
            )),
        )
            .into_response();
    }

    // Also delete any pending setup sessions
    let _ = mfa_storage.delete_setup_session(user.user_id).await;

    // Update partial session to require MFA setup
    let partial_key = format!("partial_session:{}", user.user_id);
    let partial_data = serde_json::json!({
        "user_id": user.user_id,
        "email": user.email,
        "stage": "mfa_setup_required",
        "expires_at": (chrono::Utc::now() + chrono::Duration::minutes(10)).timestamp()
    });

    // Store updated partial session
    let mut redis = state.redis.clone();
    if let Err(e) = redis::cmd("SET")
        .arg(&partial_key)
        .arg(partial_data.to_string())
        .arg("EX")
        .arg(600) // 10 minutes
        .query_async::<()>(&mut redis)
        .await
    {
        error!("❌ MFA Reset - Failed to update partial session: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(
                "Failed to update authentication session",
            )),
        )
            .into_response();
    }

    let response = serde_json::json!({
        "success": true,
        "message": "MFA configuration has been reset. Please set up MFA again.",
        "next_step": {
            "action": "setup_mfa",
            "endpoint": "/v2/auth/mfa/setup/init",
            "expires_in": 600
        }
    });

    // Log security event
    state
        .logger
        .log_security_event(
            crate::logging::security_events::SecurityEvent::new(
                crate::logging::security_events::SecurityEventType::TokenIssued,
                Some(user.email.clone()),
            )
            .with_details(format!("MFA configuration reset for user: {}", user.email)),
        )
        .await;

    info!("✅ MFA Reset completed for user: {}", user.email);
    (StatusCode::OK, Json(response)).into_response()
}

/// Check MFA configuration status
pub async fn mfa_status(
    State(state): State<AppState>,
    Extension(user): Extension<PartialAuthUser>,
) -> impl IntoResponse {
    let mut mfa_storage = MfaStorage::new(state.redis.clone());

    let configured = match mfa_storage.get_mfa_config(user.user_id).await {
        Ok(Some(config)) => config.enabled,
        _ => false,
    };

    let response = MfaStatusResponse {
        success: true,
        configured,
        method: if configured {
            Some("totp".to_string())
        } else {
            None
        },
    };

    (StatusCode::OK, Json(response)).into_response()
}

/// Initialize MFA setup - generate QR code and backup codes
pub async fn mfa_setup_init(
    State(state): State<AppState>,
    Extension(user): Extension<PartialAuthUser>,
) -> impl IntoResponse {
    if user.stage != "mfa_setup_required" {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Invalid authentication stage for MFA setup",
            )),
        )
            .into_response();
    }

    // Check if MFA is already set up
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    if let Ok(Some(config)) = mfa_storage.get_mfa_config(user.user_id).await {
        if config.enabled {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error(
                    "MFA is already configured for this user",
                )),
            )
                .into_response();
        }
    }

    // Generate TOTP secret and QR code
    let totp = TotpMfa::new(state.config.mfa_issuer.clone());
    let secret = TotpMfa::generate_secret();
    let qr_code_url = totp.generate_qr_url(&user.email, &secret);
    let backup_codes = TotpMfa::generate_backup_codes(8);

    // Store setup session temporarily
    let setup_session = crate::mfa_simple::MfaSetup {
        user_id: user.user_id,
        secret: secret.clone(),
        qr_code_url: qr_code_url.clone(),
        backup_codes: backup_codes.clone(),
    };

    if let Err(e) = mfa_storage
        .store_setup_session(user.user_id, &setup_session)
        .await
    {
        error!("Failed to store MFA setup session: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error("Failed to initialize MFA setup")),
        )
            .into_response();
    }

    let response = MfaSetupResponse {
        success: true,
        secret,
        qr_code_url,
        backup_codes,
    };

    info!("V2 MFA setup initiated for user: {}", user.email);
    (StatusCode::OK, Json(response)).into_response()
}

/// Complete MFA setup with verification
pub async fn mfa_setup_complete(
    State(state): State<AppState>,
    Extension(user): Extension<PartialAuthUser>,
    Json(payload): Json<MfaSetupCompleteRequest>,
) -> impl IntoResponse {
    if user.stage != "mfa_setup_required" {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Invalid authentication stage for MFA setup completion",
            )),
        )
            .into_response();
    }

    // Validate TOTP code format
    if payload.totp_code.len() != 6 || !payload.totp_code.chars().all(|c| c.is_numeric()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Invalid TOTP code format. Must be 6 digits",
            )),
        )
            .into_response();
    }

    // Get setup session
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    let setup = match mfa_storage.get_setup_session(user.user_id).await {
        Ok(Some(setup)) => setup,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error(
                    "No MFA setup session found. Please restart setup",
                )),
            )
                .into_response();
        }
    };

    // Verify TOTP code
    let totp = TotpMfa::new(state.config.mfa_issuer.clone());
    let code_valid = if state.config.environment == "development" && payload.totp_code == "123456" {
        info!("🔧 V2 Development mode: accepting test code 123456");
        true
    } else {
        match totp.verify_totp(&setup.secret, &payload.totp_code, 1) {
            Ok(valid) => valid,
            Err(e) => {
                error!("V2 TOTP verification error: {}", e);
                false
            }
        }
    };

    if !code_valid {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Invalid TOTP code. Please check your authenticator app",
            )),
        )
            .into_response();
    }

    // Enable MFA
    let mfa_config = UserMfaConfig {
        user_id: user.user_id,
        secret: setup.secret,
        enabled: true,
        backup_codes: setup.backup_codes,
        created_at: Utc::now(),
    };

    if let Err(e) = mfa_storage.store_mfa_config(&mfa_config).await {
        error!("Failed to store MFA config: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error("Failed to enable MFA")),
        )
            .into_response();
    }

    // Clean up setup session
    let _ = mfa_storage.delete_setup_session(user.user_id).await;

    // Generate full authentication token
    generate_full_auth_token(state, user).await
}

/// Verify MFA for existing users
pub async fn mfa_verify(
    State(state): State<AppState>,
    Extension(user): Extension<PartialAuthUser>,
    Json(payload): Json<MfaVerifyRequest>,
) -> impl IntoResponse {
    info!(
        "🔧 MFA Verify Debug - User stage: {}, TOTP code: '{}', Length: {}",
        user.stage,
        payload.totp_code,
        payload.totp_code.len()
    );

    if user.stage != "mfa_required" {
        error!("❌ MFA Verify - Invalid stage: {}", user.stage);
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Invalid authentication stage for MFA verification",
            )),
        )
            .into_response();
    }

    // Validate TOTP code format
    if payload.totp_code.len() != 6 || !payload.totp_code.chars().all(|c| c.is_numeric()) {
        error!(
            "❌ MFA Verify - Invalid TOTP format: '{}' (len={})",
            payload.totp_code,
            payload.totp_code.len()
        );
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Invalid TOTP code format. Must be 6 digits",
            )),
        )
            .into_response();
    }

    // Get MFA config
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    info!(
        "🔧 MFA Verify - Getting MFA config for user: {}",
        user.user_id
    );
    let mfa_config = match mfa_storage.get_mfa_config(user.user_id).await {
        Ok(Some(config)) if config.enabled => {
            info!("🔧 MFA Verify - MFA config found and enabled");
            config
        }
        Ok(Some(_config)) => {
            error!("❌ MFA Verify - MFA config found but disabled");
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error("MFA not configured for this user")),
            )
                .into_response();
        }
        Ok(None) => {
            error!("❌ MFA Verify - No MFA config found");
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error("MFA not configured for this user")),
            )
                .into_response();
        }
        Err(e) => {
            error!("❌ MFA Verify - Error getting MFA config: {}", e);
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error("MFA not configured for this user")),
            )
                .into_response();
        }
    };

    // Verify TOTP code
    let totp = TotpMfa::new(state.config.mfa_issuer.clone());
    info!(
        "🔧 MFA Verify - Verifying TOTP code: '{}' against secret: {}...",
        payload.totp_code,
        &mfa_config.secret[..8]
    );

    let code_valid = if state.config.environment == "development" && payload.totp_code == "123456" {
        info!("🔧 V2 Development mode: accepting test code 123456");
        true
    } else {
        info!("🔧 MFA Verify - Checking real TOTP code against secret (window: ±3)");
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        // Convert timestamp to human readable for debugging
        let datetime = chrono::DateTime::from_timestamp(current_time as i64, 0)
            .unwrap_or_else(chrono::Utc::now);
        info!(
            "🔧 MFA Verify - Current timestamp: {} ({}), time step: {}",
            current_time,
            datetime.format("%Y-%m-%d %H:%M:%S UTC"),
            current_time / 30
        );

        // Generate what the server thinks the code should be for debugging
        let current_step = current_time / 30;
        if let Ok(expected_code) = totp.generate_totp_for_step(&mfa_config.secret, current_step) {
            info!(
                "🔧 MFA Verify - Expected TOTP code for current time: {:06}",
                expected_code
            );
        }

        // Also check codes for nearby time steps
        for offset in -3..=3 {
            let step = current_step as i64 + offset;
            if step >= 0 {
                if let Ok(code) = totp.generate_totp_for_step(&mfa_config.secret, step as u64) {
                    info!(
                        "🔧 MFA Verify - TOTP code for step {} (offset {}): {:06}",
                        step, offset, code
                    );
                }
            }
        }

        match totp.verify_totp(&mfa_config.secret, &payload.totp_code, 3) {
            Ok(valid) => {
                info!("🔧 MFA Verify - TOTP verification result: {}", valid);
                valid
            }
            Err(e) => {
                error!("❌ MFA Verify - TOTP verification error: {}", e);
                false
            }
        }
    };

    if !code_valid {
        error!("❌ MFA Verify - TOTP code validation failed");
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Invalid TOTP code. Please check your authenticator app",
            )),
        )
            .into_response();
    }

    info!("✅ MFA Verify - TOTP code validation successful");

    // Generate full authentication token
    generate_full_auth_token(state, user).await
}

// ================================
// HELPER FUNCTIONS
// ================================

async fn generate_full_auth_token(
    state: AppState,
    user: PartialAuthUser,
) -> axum::response::Response<axum::body::Body> {
    // Get user details for JWT
    let mut user_storage = UserStorage::new(state.redis.clone());
    let user_data = match user_storage.get_user_by_email(&user.email).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("User not found")),
            )
                .into_response();
        }
        Err(e) => {
            error!("Failed to get user: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error(
                    "Failed to complete authentication",
                )),
            )
                .into_response();
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
                Json(ApiResponse::<()>::error(
                    "Failed to complete authentication",
                )),
            )
                .into_response();
        }
    };

    // Store session
    let mut session_storage = SessionStorage::new(state.redis.clone());
    let _ = session_storage
        .store_session(&session_id.to_string(), user_data.id, &user_data.email)
        .await;

    // Clean up partial session
    let partial_key = format!("partial_session:{}", user.user_id);
    let mut redis = state.redis.clone();
    let _: Result<(), _> = redis::cmd("DEL")
        .arg(&partial_key)
        .query_async(&mut redis)
        .await;

    let response = AuthResponse {
        success: true,
        access_token: token,
        refresh_token: None, // TODO: Implement refresh tokens if needed
        user: UserInfo {
            id: user_data.id.to_string(),
            email: user_data.email.clone(),
            mfa_enabled: true,
        },
        expires_in: 86400, // 24 hours
    };

    // Log successful authentication
    state
        .logger
        .log_security_event(
            SecurityEvent::new(SecurityEventType::LoginSuccess, Some(user.email.clone()))
                .with_details(format!(
                    "V2 Full authentication completed for user: {}",
                    user.email
                )),
        )
        .await;

    info!(
        "V2 Authentication completed successfully for user: {}",
        user.email
    );
    (StatusCode::OK, Json(response)).into_response()
}

/// Register a new user - flows directly to MFA setup
pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
    info!("V2 Registration attempt for email: {}", payload.email);

    // Validate email format
    if !payload.email.contains('@') || payload.email.len() < 5 {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error("Invalid email format")),
        )
            .into_response();
    }

    // Validate email is approved
    if !state.is_approved_email(&payload.email) {
        state
            .logger
            .log_security_event(
                SecurityEvent::new(SecurityEventType::LoginFailure, Some(payload.email.clone()))
                    .with_details(format!(
                        "Unauthorized email attempted V2 registration: {}",
                        payload.email
                    ))
                    .with_severity(SecuritySeverity::Medium),
            )
            .await;

        return (
            StatusCode::FORBIDDEN,
            Json(ApiResponse::<()>::error(
                "Email not authorized for this system",
            )),
        )
            .into_response();
    }

    // Check if user already exists
    let mut user_storage = UserStorage::new(state.redis.clone());
    if let Ok(Some(_)) = user_storage.get_user_by_email(&payload.email).await {
        return (
            StatusCode::CONFLICT,
            Json(ApiResponse::<()>::error(
                "User already exists. Please login instead.",
            )),
        )
            .into_response();
    }

    // Create new user
    let new_user = kalisi_core::types::User {
        id: Uuid::new_v4(),
        email: payload.email.clone(),
        is_verified: true,
        created_at: Utc::now(),
        last_login: Some(Utc::now()),
    };

    match user_storage.store_user(&new_user).await {
        Ok(_) => {
            info!("Successfully registered new user: {}", payload.email);

            // Log registration event
            state
                .logger
                .log_security_event(
                    SecurityEvent::new(
                        SecurityEventType::LoginSuccess,
                        Some(payload.email.clone()),
                    )
                    .with_details(format!("New user registered: {}", payload.email)),
                )
                .await;
        }
        Err(e) => {
            error!("Failed to register user: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("Failed to create user account")),
            )
                .into_response();
        }
    }

    // Generate partial token for MFA setup
    let partial_session_id = Uuid::new_v4();
    let partial_key = format!("partial_session:{}", partial_session_id);
    let partial_data = serde_json::json!({
        "user_id": new_user.id,
        "email": new_user.email,
        "stage": "mfa_setup_required",
        "expires_at": (Utc::now() + Duration::minutes(10)).timestamp()
    });

    // Store partial session
    let mut redis = state.redis.clone();
    if let Err(e) = redis::cmd("SET")
        .arg(&partial_key)
        .arg(partial_data.to_string())
        .arg("EX")
        .arg(600) // 10 minutes
        .query_async::<()>(&mut redis)
        .await
    {
        error!("Failed to store partial session: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(
                "Failed to initialize registration session",
            )),
        )
            .into_response();
    }

    let response = RegisterResponse {
        success: true,
        partial_token: partial_session_id.to_string(),
        next_step: NextStep {
            action: "setup_mfa".to_string(),
            endpoint: "/v2/auth/mfa/setup/init".to_string(),
            expires_in: Some(600),
        },
    };

    (StatusCode::OK, Json(response)).into_response()
}

// ================================
// TIME SYNC ENDPOINT
// ================================

#[derive(Serialize)]
pub struct TimeSyncResponse {
    pub server_time: i64, // Unix timestamp in milliseconds
    pub server_time_iso: String,
}

pub async fn time_sync() -> impl IntoResponse {
    let now = Utc::now();
    let response = TimeSyncResponse {
        server_time: now.timestamp_millis(),
        server_time_iso: now.to_rfc3339(),
    };

    (StatusCode::OK, Json(response)).into_response()
}

// ================================
// MFA RESET REQUEST
// ================================

pub async fn mfa_reset_request(
    State(state): State<AppState>,
    Extension(partial_user): Extension<PartialAuthUser>,
) -> impl IntoResponse {
    info!("MFA reset requested for user: {}", partial_user.user_id);

    // Get user details
    let redis = state.redis.clone();
    let mut user_storage = UserStorage::new(redis.clone());
    let user = match user_storage.get_user_by_id(partial_user.user_id).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ApiResponse::<()>::error("User not found")),
            )
                .into_response();
        }
        Err(e) => {
            error!("Failed to get user: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("Failed to retrieve user")),
            )
                .into_response();
        }
    };

    // Generate reset token
    let reset_token = Uuid::new_v4();
    let reset_key = format!("mfa_reset:{}", reset_token);
    let reset_data = serde_json::json!({
        "user_id": user.id,
        "email": user.email,
        "requested_at": Utc::now().timestamp(),
        "expires_at": (Utc::now() + Duration::hours(1)).timestamp()
    });

    // Store reset token
    let mut redis = state.redis.clone();
    if let Err(e) = redis::cmd("SET")
        .arg(&reset_key)
        .arg(reset_data.to_string())
        .arg("EX")
        .arg(3600) // 1 hour
        .query_async::<()>(&mut redis)
        .await
    {
        error!("Failed to store reset token: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error("Failed to create reset request")),
        )
            .into_response();
    }

    // Send reset email - get BASE_URL from environment (no hardcoding)
    let base_url = std::env::var("BASE_URL").expect("BASE_URL must be set in .env");
    let reset_link = format!("{}/mfa-reset?token={}", base_url, reset_token);

    let _email_body = format!(
        r#"
        <h2>MFA Reset Request</h2>
        <p>You requested to reset your two-factor authentication.</p>
        <p>Click the link below to reset your MFA settings:</p>
        <a href="{}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset MFA</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email and your account will remain secure.</p>
        "#,
        reset_link
    );

    // Send reset email with proper formatting
    if let Err(e) = state
        .email_service
        .send_mfa_reset(&user.email, &reset_link)
        .await
    {
        error!("Failed to send reset email: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error("Failed to send reset email")),
        )
            .into_response();
    }

    // Log security event
    let security_event = SecurityEvent::new(
        SecurityEventType::ConfigurationChange,
        Some(user.email.clone()),
    )
    .with_severity(SecuritySeverity::Medium)
    .with_user(user.id.to_string(), Some(user.email.clone()))
    .with_details(format!("MFA reset requested for: {}", user.email));

    state.logger.log_security_event(security_event).await;

    (StatusCode::OK, Json(ApiResponse::success(()))).into_response()
}

// ================================
// MFA RESET CONFIRM
// ================================

#[derive(Deserialize)]
pub struct MfaResetConfirmRequest {
    pub token: String,
}

pub async fn mfa_reset_confirm(
    State(state): State<AppState>,
    Json(payload): Json<MfaResetConfirmRequest>,
) -> impl IntoResponse {
    info!("MFA reset confirmation with token");

    // Get reset data from Redis
    let reset_key = format!("mfa_reset:{}", payload.token);
    let mut redis = state.redis.clone();

    let reset_data: String = match redis::cmd("GET")
        .arg(&reset_key)
        .query_async(&mut redis)
        .await
    {
        Ok(data) => data,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<()>::error("Invalid or expired reset token")),
            )
                .into_response();
        }
    };

    // Parse reset data
    let reset_info: serde_json::Value = match serde_json::from_str(&reset_data) {
        Ok(info) => info,
        Err(e) => {
            error!("Failed to parse reset data: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("Invalid reset data")),
            )
                .into_response();
        }
    };

    let user_id = reset_info["user_id"].as_str().unwrap_or_default();
    let email = reset_info["email"].as_str().unwrap_or_default();

    // Delete MFA configuration
    let mfa_key = format!("mfa:user:{}", user_id);
    let _ = redis::cmd("DEL")
        .arg(&mfa_key)
        .query_async::<()>(&mut redis)
        .await;

    // Delete reset token
    let _ = redis::cmd("DEL")
        .arg(&reset_key)
        .query_async::<()>(&mut redis)
        .await;

    // Log security event
    let security_event = SecurityEvent::new(
        SecurityEventType::ConfigurationChange,
        Some(email.to_string()),
    )
    .with_severity(SecuritySeverity::Medium)
    .with_user(user_id.to_string(), Some(email.to_string()))
    .with_details(format!("MFA reset completed for: {}", email));

    state.logger.log_security_event(security_event).await;

    // Generate partial token for re-setup
    let partial_session_id = Uuid::new_v4();
    let partial_key = format!("partial_session:{}", partial_session_id);
    let partial_data = serde_json::json!({
        "user_id": user_id,
        "email": email,
        "stage": "mfa_setup_required",
        "expires_at": (Utc::now() + Duration::minutes(10)).timestamp()
    });

    // Store partial session
    if let Err(e) = redis::cmd("SET")
        .arg(&partial_key)
        .arg(partial_data.to_string())
        .arg("EX")
        .arg(600) // 10 minutes
        .query_async::<()>(&mut redis)
        .await
    {
        error!("Failed to store partial session: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<()>::error(
                "Failed to initialize setup session",
            )),
        )
            .into_response();
    }

    #[derive(Serialize)]
    struct ResetConfirmResponse {
        success: bool,
        partial_token: String,
        message: String,
    }

    let response = ResetConfirmResponse {
        success: true,
        partial_token: partial_session_id.to_string(),
        message: "MFA has been reset. Please set up 2FA again to secure your account.".to_string(),
    };

    (StatusCode::OK, Json(response)).into_response()
}
