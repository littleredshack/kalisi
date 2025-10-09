use crate::logging::security_events::{
    SecurityEvent as LogSecurityEvent, SecurityEventType as LogSecurityEventType,
};
use crate::{
    security_metrics::{SecurityEvent, SecurityEventType},
    state::AppState,
    storage::{OtpPurpose, OtpStorage, SessionStorage, UserStorage},
};
use axum::{
    extract::{Extension, Json, State},
    http::StatusCode,
    response::IntoResponse,
};
use chrono::{Duration, Utc};
use kalisi_core::{auth::generate_otp, types::ApiResponse};
use serde::{Deserialize, Serialize};
use tracing::{error, info};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct RequestOtpPayload {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct DirectLoginPayload {
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

#[derive(Debug, Deserialize)]
pub struct VerifyOtpPayload {
    pub email: String,
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
    // Check if we're in TOTP-only mode
    if state.config.totp_only_mode {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<()>::error(
                "Email OTP is disabled. Please use TOTP authentication.",
            )),
        )
            .into_response();
    }

    // Log OTP request
    state
        .logger
        .log_security_event(
            LogSecurityEvent::new(
                LogSecurityEventType::OtpRequest,
                Some(payload.email.clone()),
            )
            .with_details(format!("OTP requested for email: {}", payload.email)),
        )
        .await;
    // Validate email
    if !state.is_approved_email(&payload.email) {
        // Log failed OTP request due to unauthorized email
        state
            .logger
            .log_security_event(
                LogSecurityEvent::new(LogSecurityEventType::OtpFailed, None)
                    .with_details(format!(
                        "Unauthorized email attempted OTP: {}",
                        payload.email
                    ))
                    .with_severity(crate::logging::security_events::SecuritySeverity::Medium),
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

    // Generate OTP
    let otp_code = generate_otp();

    // Store OTP in Redis
    let redis_conn = state.redis.clone();
    let mut otp_storage = OtpStorage::new(redis_conn);

    match otp_storage
        .store_otp(&payload.email, &otp_code, OtpPurpose::Login)
        .await
    {
        Ok(_) => {
            info!("OTP stored for email: {}", payload.email);

            // Send OTP email
            match state
                .email_service
                .send_otp(&payload.email, &otp_code)
                .await
            {
                Ok(_) => {
                    info!("OTP sent to {}", payload.email);
                }
                Err(e) => {
                    error!("Failed to send OTP email: {}", e);
                    // Continue anyway - for development, log the OTP
                    if state.config.environment == "development" {
                        info!("🔐 OTP for {}: {}", payload.email, otp_code);
                    }
                }
            }

            // Record security event for OTP request
            let security_event = SecurityEvent {
                timestamp: Utc::now(),
                event_type: SecurityEventType::OtpRequest,
                user: Some(payload.email.clone()),
                ip_address: None, // Could extract from request headers if needed
                success: true,
                details: Some("OTP requested for login".to_string()),
            };
            state
                .security_monitor
                .write()
                .await
                .record_event(security_event)
                .await;

            // Log successful OTP generation
            state
                .logger
                .log_security_event(
                    LogSecurityEvent::new(
                        LogSecurityEventType::OtpVerified,
                        Some(payload.email.clone()),
                    )
                    .with_details("OTP generated and stored successfully".to_string()),
                )
                .await;

            // Prepare response
            let response = RequestOtpResponse {
                success: true,
                message: "OTP sent to your email address".to_string(),
                email: payload.email.clone(),
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

            // Log OTP failure
            state
                .logger
                .log_security_event(
                    LogSecurityEvent::new(
                        LogSecurityEventType::OtpFailed,
                        Some(payload.email.clone()),
                    )
                    .with_details(format!("Failed to store OTP: {}", e))
                    .with_severity(crate::logging::security_events::SecuritySeverity::High),
                )
                .await;

            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("Failed to generate OTP")),
            )
                .into_response()
        }
    }
}

pub async fn verify_otp(
    State(state): State<AppState>,
    Json(payload): Json<VerifyOtpPayload>,
) -> impl IntoResponse {
    // Log OTP verification attempt
    state
        .logger
        .log_login_attempt(&payload.email, None, false)
        .await;

    // Verify OTP from Redis
    let redis_conn = state.redis.clone();
    let mut otp_storage = OtpStorage::new(redis_conn);

    match otp_storage.verify_otp(&payload.email, &payload.otp).await {
        Ok(true) => {
            // OTP is valid, check if user exists in Redis
            let mut user_storage = UserStorage::new(state.redis.clone());
            let user = match user_storage.get_user_by_email(&payload.email).await {
                Ok(Some(user)) => user,
                Ok(None) => {
                    // Auto-register for allowed emails
                    if state.config.approved_emails.contains(&payload.email) {
                        let new_user = kalisi_core::types::User {
                            id: Uuid::new_v4(),
                            email: payload.email.clone(),
                            is_verified: true,
                            created_at: Utc::now(),
                            last_login: Some(Utc::now()),
                        };

                        match user_storage.store_user(&new_user).await {
                            Ok(_) => {
                                info!("Auto-registered user: {}", payload.email);
                                new_user
                            }
                            Err(e) => {
                                error!("Failed to auto-register user: {}", e);
                                return (
                                    StatusCode::INTERNAL_SERVER_ERROR,
                                    Json(ApiResponse::<()>::error("Failed to create user")),
                                )
                                    .into_response();
                            }
                        }
                    } else {
                        return (
                            StatusCode::UNAUTHORIZED,
                            Json(ApiResponse::<()>::error(
                                "Access denied. Please contact your administrator.",
                            )),
                        )
                            .into_response();
                    }
                }
                Err(e) => {
                    error!("Failed to fetch user: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ApiResponse::<()>::error("Database error")),
                    )
                        .into_response();
                }
            };

            // Check if MFA is required and configured
            info!("MFA_REQUIRED config: {}", state.config.mfa_required);
            if state.config.mfa_required {
                use crate::mfa_simple::MfaStorage;
                let mut mfa_storage = MfaStorage::new(state.redis.clone());

                info!("Checking MFA config for user: {}", user.id);
                match mfa_storage.get_mfa_config(user.id).await {
                    Ok(Some(mfa_config)) if mfa_config.enabled => {
                        // User has MFA enabled - require TOTP verification
                        // Store partial session for MFA completion
                        let partial_session_id = Uuid::new_v4();
                        let partial_key = format!("partial_session:{}", partial_session_id);
                        let partial_data = serde_json::json!({
                            "user_id": user.id,
                            "email": user.email,
                            "stage": "mfa_required",
                            "expires_at": (Utc::now() + Duration::minutes(10)).timestamp()
                        });

                        let _: Result<(), _> = redis::cmd("SETEX")
                            .arg(&partial_key)
                            .arg(600) // 10 minutes
                            .arg(partial_data.to_string())
                            .query_async(&mut state.redis.clone())
                            .await;

                        return (
                            StatusCode::OK,
                            Json(serde_json::json!({
                                "success": true,
                                "mfa_required": true,
                                "partial_token": partial_session_id.to_string(),
                                "message": "OTP verified. Please provide your authenticator code."
                            })),
                        )
                            .into_response();
                    }
                    Ok(None) | Ok(Some(_)) => {
                        // No MFA configured but MFA required - user needs to set up MFA
                        info!("User {} needs to set up MFA", user.email);
                        let partial_session_id = Uuid::new_v4();
                        let partial_key = format!("partial_session:{}", partial_session_id);
                        let partial_data = serde_json::json!({
                            "user_id": user.id,
                            "email": user.email,
                            "stage": "mfa_setup_required",
                            "expires_at": (Utc::now() + Duration::minutes(10)).timestamp()
                        });

                        let _: Result<(), _> = redis::cmd("SETEX")
                            .arg(&partial_key)
                            .arg(600) // 10 minutes
                            .arg(partial_data.to_string())
                            .query_async(&mut state.redis.clone())
                            .await;

                        return (
                            StatusCode::OK,
                            Json(serde_json::json!({
                                "success": true,
                                "mfa_setup_required": true,
                                "partial_token": partial_session_id.to_string(),
                                "message": "OTP verified. Please set up multi-factor authentication."
                            })),
                        ).into_response();
                    }
                    Err(e) => {
                        error!("Failed to check MFA config: {}", e);
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ApiResponse::<()>::error("Authentication error")),
                        )
                            .into_response();
                    }
                }
            }

            // No MFA required - generate full JWT token
            let session_id = Uuid::new_v4();
            let token = match state.jwt_auth.generate_token(&user, session_id) {
                Ok(token) => token,
                Err(e) => {
                    error!("Failed to generate token: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(ApiResponse::<()>::error("Failed to generate token")),
                    )
                        .into_response();
                }
            };

            // Store session in Redis
            let redis_conn = state.redis.clone();
            let mut session_storage = SessionStorage::new(redis_conn);
            let _ = session_storage
                .store_session(&session_id.to_string(), user.id, &user.email)
                .await;

            // Record successful login event
            let security_event = SecurityEvent {
                timestamp: Utc::now(),
                event_type: SecurityEventType::Login,
                user: Some(user.email.clone()),
                ip_address: None, // Could extract from request headers if needed
                success: true,
                details: Some("Login successful via OTP".to_string()),
            };
            state
                .security_monitor
                .write()
                .await
                .record_event(security_event)
                .await;

            // Log successful login
            state
                .logger
                .log_login_attempt(&user.email, None, true)
                .await;
            state
                .logger
                .log_security_event(
                    LogSecurityEvent::new(
                        LogSecurityEventType::TokenIssued,
                        Some(user.email.clone()),
                    )
                    .with_details("JWT token issued after OTP verification".to_string()),
                )
                .await;

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
            // Record failed login event
            let security_event = SecurityEvent {
                timestamp: Utc::now(),
                event_type: SecurityEventType::Login,
                user: Some(payload.email.clone()),
                ip_address: None, // Could extract from request headers if needed
                success: false,
                details: Some("Invalid or expired OTP".to_string()),
            };
            state
                .security_monitor
                .write()
                .await
                .record_event(security_event)
                .await;

            // Log failed OTP verification
            state
                .logger
                .log_security_event(
                    LogSecurityEvent::new(
                        LogSecurityEventType::OtpFailed,
                        Some(payload.email.clone()),
                    )
                    .with_details("Invalid or expired OTP".to_string())
                    .with_severity(crate::logging::security_events::SecuritySeverity::Medium),
                )
                .await;

            (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<()>::error("Invalid or expired OTP")),
            )
                .into_response()
        }
        Err(e) => {
            error!("Failed to verify OTP: {}", e);

            // Log OTP verification error
            state
                .logger
                .log_security_event(
                    LogSecurityEvent::new(
                        LogSecurityEventType::OtpFailed,
                        Some(payload.email.clone()),
                    )
                    .with_details(format!("OTP verification error: {}", e))
                    .with_severity(crate::logging::security_events::SecuritySeverity::High),
                )
                .await;

            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error("Failed to verify OTP")),
            )
                .into_response()
        }
    }
}

// New handler for direct TOTP-only authentication
pub async fn direct_login(
    State(state): State<AppState>,
    Json(payload): Json<DirectLoginPayload>,
) -> impl IntoResponse {
    // Log direct login attempt
    state
        .logger
        .log_security_event(
            LogSecurityEvent::new(
                LogSecurityEventType::LoginAttempt,
                Some(payload.email.clone()),
            )
            .with_details(format!(
                "Direct TOTP login requested for email: {}",
                payload.email
            )),
        )
        .await;

    // Validate email
    if !state.is_approved_email(&payload.email) {
        state
            .logger
            .log_security_event(
                LogSecurityEvent::new(
                    LogSecurityEventType::LoginFailure,
                    Some(payload.email.clone()),
                )
                .with_details(format!(
                    "Unauthorized email attempted direct login: {}",
                    payload.email
                ))
                .with_severity(crate::logging::security_events::SecuritySeverity::Medium),
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

    // Check if user exists, if not auto-register
    let mut user_storage = UserStorage::new(state.redis.clone());
    let user = match user_storage.get_user_by_email(&payload.email).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            // Auto-register for allowed emails
            let new_user = kalisi_core::types::User {
                id: Uuid::new_v4(),
                email: payload.email.clone(),
                is_verified: true,
                created_at: Utc::now(),
                last_login: Some(Utc::now()),
            };

            match user_storage.store_user(&new_user).await {
                Ok(_) => {
                    info!("Auto-registered user for TOTP-only auth: {}", payload.email);
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

    // Check if user has MFA already set up
    use crate::mfa_simple::MfaStorage;
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    let has_mfa_setup = match mfa_storage.get_mfa_config(user.id).await {
        Ok(Some(config)) => config.enabled,
        _ => false,
    };

    // Generate partial token for MFA setup/verification
    let partial_session_id = Uuid::new_v4();
    let partial_key = format!("partial_session:{}", partial_session_id);
    let stage = if has_mfa_setup {
        "mfa_required"
    } else {
        "mfa_setup_required"
    };
    let partial_data = serde_json::json!({
        "user_id": user.id,
        "email": user.email,
        "stage": stage,
        "expires_at": (Utc::now() + Duration::minutes(10)).timestamp()
    });

    // Store partial session in Redis
    let mut redis = state.redis.clone();
    if let Err(e) = redis::cmd("SET")
        .arg(&partial_key)
        .arg(&partial_data.to_string())
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

    #[derive(Serialize)]
    struct DirectLoginResponse {
        success: bool,
        message: String,
        partial_token: String,
        user_id: String,
        email: String,
        requires_mfa_setup: bool,
    }

    let response = DirectLoginResponse {
        success: true,
        message: if has_mfa_setup {
            "Please provide your authenticator code"
        } else {
            "Please proceed to MFA setup"
        }
        .to_string(),
        partial_token: partial_session_id.to_string(),
        user_id: user.id.to_string(),
        email: user.email.clone(),
        requires_mfa_setup: !has_mfa_setup,
    };

    // Log successful partial authentication
    state
        .logger
        .log_security_event(
            LogSecurityEvent::new(LogSecurityEventType::TokenIssued, Some(user.email.clone()))
                .with_details("Direct login successful, awaiting TOTP verification".to_string()),
        )
        .await;

    (StatusCode::OK, Json(response)).into_response()
}

pub async fn logout(
    State(state): State<AppState>,
    Extension(auth_user): Extension<crate::middleware::auth::AuthUser>,
) -> impl IntoResponse {
    // Delete session from Redis
    let redis_conn = state.redis.clone();
    let mut session_storage = SessionStorage::new(redis_conn);

    match session_storage
        .delete_session(&auth_user.session_id.to_string())
        .await
    {
        Ok(_) => {
            info!("User {} logged out successfully", auth_user.email);

            // Record logout event
            let security_event = SecurityEvent {
                timestamp: Utc::now(),
                event_type: SecurityEventType::Logout,
                user: Some(auth_user.email.clone()),
                ip_address: None, // Could extract from request headers if needed
                success: true,
                details: Some("User logged out".to_string()),
            };
            state
                .security_monitor
                .write()
                .await
                .record_event(security_event)
                .await;

            // Log logout
            state
                .logger
                .log_security_event(
                    LogSecurityEvent::new(
                        LogSecurityEventType::TokenRevoked,
                        Some(auth_user.email.clone()),
                    )
                    .with_details("User logged out, session deleted".to_string()),
                )
                .await;

            (
                StatusCode::OK,
                Json(ApiResponse::success("Logged out successfully")),
            )
        }
        Err(e) => {
            error!("Failed to delete session: {}", e);
            // Return success anyway - session will expire
            (
                StatusCode::OK,
                Json(ApiResponse::success("Logged out successfully")),
            )
        }
    }
}

pub async fn get_profile(
    State(state): State<AppState>,
    Extension(auth_user): Extension<crate::middleware::auth::AuthUser>,
) -> impl IntoResponse {
    // Fetch user from Redis
    let mut user_storage = UserStorage::new(state.redis.clone());
    match user_storage.get_user_by_id(auth_user.user_id).await {
        Ok(Some(user)) => {
            let user_info = UserInfo {
                id: user.id,
                email: user.email,
                is_verified: user.is_verified,
            };
            (StatusCode::OK, Json(ApiResponse::success(user_info)))
        }
        Ok(None) => {
            error!("User not found: {}", auth_user.user_id);
            (
                StatusCode::NOT_FOUND,
                Json(ApiResponse::<UserInfo>::error("User not found")),
            )
        }
        Err(e) => {
            error!("Failed to fetch user profile: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<UserInfo>::error("Failed to fetch profile")),
            )
        }
    }
}
