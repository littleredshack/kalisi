use edt_gateway::{
    state::AppState,
    config::Config,
};
use std::env;

#[tokio::test]
async fn test_app_state_creation() {
    // Set up test environment variables
    env::set_var("ENVIRONMENT", "test");
    env::set_var("JWT_SECRET", "test-jwt-secret-key-for-testing-must-be-long-enough");
    env::set_var("REDIS_URL", "redis://localhost:6379/15");
    env::set_var("NEO4J_URI", "bolt://localhost:7687");
    env::set_var("NEO4J_USERNAME", "neo4j");
    env::set_var("NEO4J_PASSWORD", "password");
    env::set_var("NEO4J_DATABASE", "neo4j");
    env::set_var("MFA_REQUIRED", "true");
    env::set_var("MFA_ISSUER", "EDT Test System");
    env::set_var("TOTP_ONLY_MODE", "true");
    env::set_var("EMAIL_OTP_ENABLED", "false");
    env::set_var("APPROVED_EMAILS", "test@example.com,admin@test.com");
    
    let config = Config::from_env().expect("Failed to create test config");
    let state = AppState::new(config).await.expect("Failed to create AppState");
    
    // Verify we can access config
    assert_eq!(state.config.environment, "test");
    assert_eq!(state.config.mfa_required, true);
    
    // Clean up environment variables
    env::remove_var("ENVIRONMENT");
    env::remove_var("JWT_SECRET");
    env::remove_var("REDIS_URL");
    env::remove_var("NEO4J_URI");
    env::remove_var("NEO4J_USERNAME");
    env::remove_var("NEO4J_PASSWORD");
    env::remove_var("NEO4J_DATABASE");
    env::remove_var("MFA_REQUIRED");
    env::remove_var("MFA_ISSUER");
    env::remove_var("TOTP_ONLY_MODE");
    env::remove_var("EMAIL_OTP_ENABLED");
    env::remove_var("APPROVED_EMAILS");
}

#[tokio::test]
async fn test_approved_email_validation() {
    // Set up test environment variables
    env::set_var("ENVIRONMENT", "test");
    env::set_var("JWT_SECRET", "test-jwt-secret-key-for-testing-must-be-long-enough");
    env::set_var("REDIS_URL", "redis://localhost:6379/15");
    env::set_var("NEO4J_URI", "bolt://localhost:7687");
    env::set_var("NEO4J_USERNAME", "neo4j");
    env::set_var("NEO4J_PASSWORD", "password");
    env::set_var("NEO4J_DATABASE", "neo4j");
    env::set_var("MFA_REQUIRED", "true");
    env::set_var("MFA_ISSUER", "EDT Test System");
    env::set_var("TOTP_ONLY_MODE", "true");
    env::set_var("EMAIL_OTP_ENABLED", "false");
    env::set_var("APPROVED_EMAILS", "test@example.com,admin@test.com");
    
    let config = Config::from_env().expect("Failed to create test config");
    let state = AppState::new(config).await.expect("Failed to create AppState");
    
    // Test approved email
    assert!(state.is_approved_email("test@example.com"));
    assert!(state.is_approved_email("admin@test.com"));
    
    // Test unapproved email
    assert!(!state.is_approved_email("unauthorized@example.com"));
    
    // Clean up environment variables
    env::remove_var("ENVIRONMENT");
    env::remove_var("JWT_SECRET");
    env::remove_var("REDIS_URL");
    env::remove_var("NEO4J_URI");
    env::remove_var("NEO4J_USERNAME");
    env::remove_var("NEO4J_PASSWORD");
    env::remove_var("NEO4J_DATABASE");
    env::remove_var("MFA_REQUIRED");
    env::remove_var("MFA_ISSUER");
    env::remove_var("TOTP_ONLY_MODE");
    env::remove_var("EMAIL_OTP_ENABLED");
    env::remove_var("APPROVED_EMAILS");
}

#[tokio::test]
async fn test_config_from_env() {
    // Set up test environment variables
    env::set_var("ENVIRONMENT", "test");
    env::set_var("JWT_SECRET", "test-jwt-secret-key-for-testing-must-be-long-enough");
    env::set_var("REDIS_URL", "redis://localhost:6379/15");
    env::set_var("NEO4J_URI", "bolt://localhost:7687");
    env::set_var("NEO4J_USERNAME", "neo4j");
    env::set_var("NEO4J_PASSWORD", "password");
    env::set_var("NEO4J_DATABASE", "neo4j");
    env::set_var("MFA_REQUIRED", "true");
    env::set_var("MFA_ISSUER", "EDT Test System");
    env::set_var("TOTP_ONLY_MODE", "true");
    env::set_var("EMAIL_OTP_ENABLED", "false");
    env::set_var("APPROVED_EMAILS", "test@example.com,admin@test.com");
    
    let config = Config::from_env().expect("Failed to create test config");
    
    // Verify configuration values
    assert_eq!(config.environment, "test");
    assert_eq!(config.mfa_required, true);
    assert_eq!(config.totp_only_mode, true);
    assert_eq!(config.email_otp_enabled, false);
    assert_eq!(config.mfa_issuer, "EDT Test System");
    assert!(config.neo4j_uri.contains("localhost:7687"));
    assert!(config.redis_url.contains("localhost:6379"));
    
    // Verify approved emails
    assert_eq!(config.approved_emails.len(), 2);
    assert!(config.approved_emails.contains(&"test@example.com".to_string()));
    assert!(config.approved_emails.contains(&"admin@test.com".to_string()));
    
    // Clean up environment variables
    env::remove_var("ENVIRONMENT");
    env::remove_var("JWT_SECRET");
    env::remove_var("REDIS_URL");
    env::remove_var("NEO4J_URI");
    env::remove_var("NEO4J_USERNAME");
    env::remove_var("NEO4J_PASSWORD");
    env::remove_var("NEO4J_DATABASE");
    env::remove_var("MFA_REQUIRED");
    env::remove_var("MFA_ISSUER");
    env::remove_var("TOTP_ONLY_MODE");
    env::remove_var("EMAIL_OTP_ENABLED");
    env::remove_var("APPROVED_EMAILS");
}