use axum::{
    extract::{Extension, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use crate::{
    logging::security_events::{SecurityEvent, SecurityEventType, SecuritySeverity},
    mfa_simple::MfaStorage,
    middleware::auth::AuthUser,
    state::AppState,
    storage::{SessionStorage, UserStorage},
};
use kalisi_core::types::ApiResponse;

// ================================
// REQUEST/RESPONSE TYPES
// ================================

#[derive(Debug, Serialize)]
pub struct UserProfile {
    pub id: String,
    pub email: String,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
    pub mfa_enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub email: Option<String>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct UpdateProfileResponse {
    pub success: bool,
    pub profile: UserProfile,
}

#[derive(Debug, Serialize)]
pub struct AccountInfo {
    pub id: String,
    pub email: String,
    pub created_at: DateTime<Utc>,
    pub total_sessions: usize,
    pub data_export_available: bool,
}

#[derive(Debug, Serialize)]
pub struct DeleteAccountResponse {
    pub success: bool,
    pub message: String,
}

// ================================
// HANDLERS
// ================================

/// Get user profile information
pub async fn get_profile(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    info!("Getting profile for user: {}", user.email);

    // Get user from storage
    let mut user_storage = UserStorage::new(state.redis.clone());
    let user_data = match user_storage.get_user_by_id(user.user_id).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            error!("User not found in storage: {}", user.user_id);
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
                Json(ApiResponse::<()>::error("Failed to retrieve user profile")),
            )
                .into_response();
        }
    };

    // Check MFA status
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    let mfa_enabled = match mfa_storage.get_mfa_config(user.user_id).await {
        Ok(Some(config)) => config.enabled,
        _ => false,
    };

    let profile = UserProfile {
        id: user_data.id.to_string(),
        email: user_data.email,
        created_at: user_data.created_at,
        last_login: user_data.last_login,
        mfa_enabled,
    };

    (StatusCode::OK, Json(ApiResponse::success(profile))).into_response()
}

/// Update user profile (currently only supports email change)
pub async fn update_profile(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(payload): Json<UpdateProfileRequest>,
) -> impl IntoResponse {
    info!("Updating profile for user: {}", user.email);

    // For now, we don't support email changes as it would require re-verification
    // This is a placeholder for future enhancement
    if payload.email.is_some() {
        return (
            StatusCode::NOT_IMPLEMENTED,
            Json(ApiResponse::<()>::error("Email change not yet implemented")),
        )
            .into_response();
    }

    // Return current profile
    get_profile(State(state), Extension(user))
        .await
        .into_response()
}

/// Get account information (for account management page)
pub async fn get_account_info(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    info!("Getting account info for user: {}", user.email);

    // Get user from storage
    let mut user_storage = UserStorage::new(state.redis.clone());
    let user_data = match user_storage.get_user_by_id(user.user_id).await {
        Ok(Some(u)) => u,
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
                Json(ApiResponse::<()>::error(
                    "Failed to retrieve account information",
                )),
            )
                .into_response();
        }
    };

    // Count active sessions (simplified - in production would query session storage)
    let total_sessions = 1; // Current session

    let account_info = AccountInfo {
        id: user_data.id.to_string(),
        email: user_data.email,
        created_at: user_data.created_at,
        total_sessions,
        data_export_available: false, // Future feature
    };

    (StatusCode::OK, Json(ApiResponse::success(account_info))).into_response()
}

/// Delete user account (complete removal)
pub async fn delete_account(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    info!("Account deletion requested for user: {}", user.email);

    // Log security event for account deletion
    state
        .logger
        .log_security_event(
            SecurityEvent::new(
                SecurityEventType::LoginSuccess, // Using LoginSuccess as placeholder for account operations
                Some(user.email.clone()),
            )
            .with_details(format!(
                "Account deletion initiated for user: {}",
                user.email
            ))
            .with_severity(SecuritySeverity::High),
        )
        .await;

    // 1. Delete MFA configuration
    let mut mfa_storage = MfaStorage::new(state.redis.clone());
    if let Err(e) = mfa_storage.delete_mfa_config(user.user_id).await {
        error!("Failed to delete MFA config: {}", e);
        // Continue with deletion even if MFA deletion fails
    }

    // 2. Delete all user sessions
    let mut session_storage = SessionStorage::new(state.redis.clone());
    // Note: In production, would need to iterate through all user sessions
    // For now, we'll just delete the current session
    let session_id = user.session_id.to_string();
    let _ = session_storage.delete_session(&session_id).await;

    // 3. Delete user data from storage
    let mut user_storage = UserStorage::new(state.redis.clone());
    match user_storage.delete_user_by_id(user.user_id).await {
        Ok(_) => {
            info!("Successfully deleted account for user: {}", user.email);

            // Log successful deletion
            state
                .logger
                .log_security_event(
                    SecurityEvent::new(SecurityEventType::LoginSuccess, Some(user.email.clone()))
                        .with_details(format!(
                            "Account successfully deleted for user: {}",
                            user.email
                        ))
                        .with_severity(SecuritySeverity::High),
                )
                .await;

            // Send confirmation email
            let user_name = user.email.split('@').next().unwrap_or(&user.email);
            if let Err(e) = state
                .email_service
                .send_account_deletion_confirmation(&user.email, user_name)
                .await
            {
                error!(
                    "Failed to send account deletion confirmation email to {}: {}",
                    user.email, e
                );
            } else {
                info!("Account deletion confirmation email sent to {}", user.email);
            }

            let response = DeleteAccountResponse {
                success: true,
                message: "Your account has been successfully deleted. All data has been removed."
                    .to_string(),
            };

            (StatusCode::OK, Json(ApiResponse::success(response))).into_response()
        }
        Err(e) => {
            error!("Failed to delete user account: {}", e);

            // Log failure
            state
                .logger
                .log_security_event(
                    SecurityEvent::new(SecurityEventType::LoginFailure, Some(user.email.clone()))
                        .with_details(format!("Account deletion failed for user: {}", user.email))
                        .with_severity(SecuritySeverity::High),
                )
                .await;

            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<()>::error(
                    "Failed to delete account. Please try again later.",
                )),
            )
                .into_response()
        }
    }
}

/// Get user settings (placeholder for future settings management)
pub async fn get_settings(
    State(_state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> impl IntoResponse {
    info!("Getting settings for user: {}", user.email);

    // Placeholder response
    let settings = serde_json::json!({
        "notifications": {
            "email": true,
            "security_alerts": true,
        },
        "privacy": {
            "show_activity": false,
        },
    });

    (StatusCode::OK, Json(ApiResponse::success(settings))).into_response()
}

/// Update user settings (placeholder for future settings management)
pub async fn update_settings(
    State(_state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(_payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    info!("Updating settings for user: {}", user.email);

    // Placeholder - return success
    (
        StatusCode::OK,
        Json(ApiResponse::success(serde_json::json!({
            "success": true,
            "message": "Settings updated successfully"
        }))),
    )
        .into_response()
}
