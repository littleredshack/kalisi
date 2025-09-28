use axum::{
    extract::{State, Form, Query},
    response::{IntoResponse, Response, Redirect},
    http::{StatusCode, header, HeaderMap},
};
use askama::Template;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{Utc, Duration};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite, time};
use crate::{
    state::AppState,
    storage::{OtpStorage, OtpPurpose, SessionStorage, UserStorage},
};
use tracing::{info, warn, error};

// Template structs
#[derive(Template)]
#[template(path = "pages/login.html")]
struct LoginTemplate {
    csrf_token: String,
    email: String,
    otp_sent: bool,
    error: Option<String>,
}

#[derive(Template)]
#[template(path = "pages/dashboard.html")]
struct DashboardTemplate {
    user_email: String,
    neo4j_enabled: bool,
    realtime_enabled: bool,
}

// Form structs
#[derive(Debug, Deserialize)]
pub struct LoginForm {
    pub email: String,
    pub csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyForm {
    pub email: String,
    pub otp: String,
    pub csrf_token: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginQuery {
    pub error: Option<String>,
}

// CSRF token generation
fn generate_csrf_token() -> String {
    Uuid::new_v4().to_string()
}

// Session cookie configuration for financial services
fn create_session_cookie(session_id: &str) -> Cookie<'static> {
    Cookie::build("edt_session", session_id)
        .secure(true) // Always use HTTPS in production
        .http_only(true) // Prevent JS access
        .same_site(SameSite::Strict) // CSRF protection
        .path("/")
        .max_age(time::Duration::minutes(30)) // 30 min timeout
        .finish()
}

// Show login page
pub async fn show_login(
    Query(query): Query<LoginQuery>,
    jar: CookieJar,
) -> impl IntoResponse {
    // Check if already authenticated
    if let Some(_session_cookie) = jar.get("edt_session") {
        // TODO: Validate session in Redis
        return Redirect::to("/dashboard").into_response();
    }
    
    let template = LoginTemplate {
        csrf_token: generate_csrf_token(),
        email: String::new(),
        otp_sent: false,
        error: query.error,
    };
    
    axum::response::Html(template.render().unwrap()).into_response()
}

// Handle login form (send OTP)
pub async fn handle_login(
    State(state): State<AppState>,
    jar: CookieJar,
    Form(form): Form<LoginForm>,
) -> impl IntoResponse {
    // Validate CSRF token
    // In production, store CSRF tokens in Redis with expiry
    
    // Normalize email
    let email = form.email.trim().to_lowercase();
    
    // Validate email format
    if !email.contains('@') || !email.contains('.') {
        let template = LoginTemplate {
            csrf_token: generate_csrf_token(),
            email,
            otp_sent: false,
            error: Some("Please enter a valid email address".to_string()),
        };
        return axum::response::Html(template.render().unwrap()).into_response();
    }
    
    // Check if user exists or auto-register for allowed domains
    let mut user_storage = UserStorage::new(state.redis.clone());
    let user = match user_storage.get_user_by_email(&email).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            // Auto-register for allowed emails
            if state.config.approved_emails.contains(&email) {
                let new_user = edt_core::types::User {
                    id: Uuid::new_v4(),
                    email: email.clone(),
                    is_verified: true,
                    created_at: Utc::now(),
                    last_login: None,
                };
                
                match user_storage.store_user(&new_user).await {
                    Ok(_) => {
                        info!("Auto-registered user: {}", email);
                        new_user
                    }
                    Err(e) => {
                        error!("Failed to auto-register user: {}", e);
                        let template = LoginTemplate {
                            csrf_token: generate_csrf_token(),
                            email,
                            otp_sent: false,
                            error: Some("System error. Please try again.".to_string()),
                        };
                        return axum::response::Html(template.render().unwrap()).into_response();
                    }
                }
            } else {
                let template = LoginTemplate {
                    csrf_token: generate_csrf_token(),
                    email,
                    otp_sent: false,
                    error: Some("Access denied. Please contact your administrator.".to_string()),
                };
                return axum::response::Html(template.render().unwrap()).into_response();
            }
        }
        Err(e) => {
            error!("Database error: {}", e);
            let template = LoginTemplate {
                csrf_token: generate_csrf_token(),
                email,
                otp_sent: false,
                error: Some("System error. Please try again.".to_string()),
            };
            return axum::response::Html(template.render().unwrap()).into_response();
        }
    };
    
    // Generate OTP
    let otp_code = edt_core::auth::generate_otp();
    let mut otp_storage = OtpStorage::new(state.redis.clone());
    
    // Store OTP with 5 minute expiry
    if let Err(e) = otp_storage.store_otp(&email, &otp_code, OtpPurpose::Login).await {
        error!("Failed to store OTP: {}", e);
        let template = LoginTemplate {
            csrf_token: generate_csrf_token(),
            email,
            otp_sent: false,
            error: Some("Failed to generate security code. Please try again.".to_string()),
        };
        return axum::response::Html(template.render().unwrap()).into_response();
    }
    
    // Send email
    match state.email_service.send_otp(&email, &otp_code).await {
        Ok(_) => {
            info!("OTP sent to {}", email);
            
            // TODO: Log auth event
            
            // Show OTP entry form
            let template = LoginTemplate {
                csrf_token: generate_csrf_token(),
                email,
                otp_sent: true,
                error: None,
            };
            axum::response::Html(template.render().unwrap()).into_response()
        }
        Err(e) => {
            error!("Failed to send email: {}", e);
            let template = LoginTemplate {
                csrf_token: generate_csrf_token(),
                email,
                otp_sent: false,
                error: Some("Failed to send security code. Please check your email address.".to_string()),
            };
            axum::response::Html(template.render().unwrap()).into_response()
        }
    }
}

// Handle OTP verification
pub async fn handle_verify(
    State(state): State<AppState>,
    jar: CookieJar,
    Form(form): Form<VerifyForm>,
) -> impl IntoResponse {
    let email = form.email.trim().to_lowercase();
    let otp = form.otp.trim();
    
    // Verify OTP
    let mut otp_storage = OtpStorage::new(state.redis.clone());
    match otp_storage.verify_otp(&email, otp).await {
        Ok(true) => {
            // Get user
            let mut user_storage = UserStorage::new(state.redis.clone());
            let user = match user_storage.get_user_by_email(&email).await {
                Ok(Some(user)) => user,
                _ => {
                    return Redirect::to("/auth/login?error=User%20not%20found").into_response();
                }
            };
            
            // Create session
            let session_id = Uuid::new_v4().to_string();
            let mut session_storage = SessionStorage::new(state.redis.clone());
            
            if let Err(e) = session_storage.store_session(
                &session_id,
                user.id,
                &user.email,
            ).await {
                error!("Failed to create session: {}", e);
                return Redirect::to("/auth/login?error=Session%20creation%20failed").into_response();
            }
            
            // Set secure session cookie and redirect
            let cookie = create_session_cookie(&session_id);
            info!("User {} logged in successfully", email);
            
            // TODO: Log successful login
            
            return (jar.add(cookie), Redirect::to("/dashboard")).into_response();
        }
        _ => {
            warn!("Invalid OTP for {}", email);
            let template = LoginTemplate {
                csrf_token: generate_csrf_token(),
                email,
                otp_sent: true,
                error: Some("Invalid or expired security code. Please try again.".to_string()),
            };
            axum::response::Html(template.render().unwrap()).into_response()
        }
    }
}

// Handle logout
pub async fn handle_logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> impl IntoResponse {
    // Get session cookie
    if let Some(session_cookie) = jar.get("edt_session") {
        let session_id = session_cookie.value();
        
        // Delete session from Redis
        let mut session_storage = SessionStorage::new(state.redis.clone());
        let _ = session_storage.delete_session(session_id).await;
        
        // Remove cookie
        let cookie = Cookie::build("edt_session", "")
            .path("/")
            .max_age(time::Duration::seconds(-1))
            .finish();
        return jar.add(cookie).into_response();
    }
    
    Redirect::to("/auth/login")
}

// Show dashboard (protected route)
pub async fn show_dashboard(
    axum::Extension(user): axum::Extension<crate::middleware::SessionUser>,
) -> impl IntoResponse {
    let template = DashboardTemplate {
        user_email: user.email,
        neo4j_enabled: true,
        realtime_enabled: true,
    };
    
    axum::response::Html(template.render().unwrap())
}