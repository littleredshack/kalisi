use edt_gateway::config::Config;
use std::env;

#[test]
fn test_config_basic_fields() {
    // Set required environment variables
    env::set_var("JWT_SECRET", "test-secret-key");
    env::set_var("REDIS_URL", "redis://localhost:6379");
    env::set_var("ENVIRONMENT", "test");
    env::set_var("NEO4J_URI", "bolt://localhost:7687");
    env::set_var("NEO4J_USERNAME", "neo4j");
    env::set_var("NEO4J_PASSWORD", "password");
    env::set_var("NEO4J_DATABASE", "neo4j");
    env::set_var("MFA_REQUIRED", "false");
    env::set_var("MFA_ISSUER", "EDT2-Test");

    let config = Config::from_env().expect("Config should load from env");

    // Check basic fields
    assert_eq!(config.jwt_secret, "test-secret-key");
    assert_eq!(config.redis_url, "redis://localhost:6379");
    assert_eq!(config.environment, "test");
    assert_eq!(config.neo4j_uri, "bolt://localhost:7687");
    assert_eq!(config.neo4j_username, "neo4j");
    assert_eq!(config.neo4j_password, "password");
    assert_eq!(config.neo4j_database, "neo4j");
    assert_eq!(config.mfa_required, false);
    assert_eq!(config.mfa_issuer, "EDT2-Test");

    // Clean up
    env::remove_var("JWT_SECRET");
    env::remove_var("REDIS_URL");
    env::remove_var("ENVIRONMENT");
    env::remove_var("NEO4J_URI");
    env::remove_var("NEO4J_USERNAME");
    env::remove_var("NEO4J_PASSWORD");
    env::remove_var("NEO4J_DATABASE");
    env::remove_var("MFA_REQUIRED");
    env::remove_var("MFA_ISSUER");
}

#[test]
fn test_config_optional_fields() {
    // Set required environment variables
    env::set_var("JWT_SECRET", "test-secret-key");
    env::set_var("REDIS_URL", "redis://localhost:6379");
    env::set_var("ENVIRONMENT", "test");
    env::set_var("NEO4J_URI", "bolt://localhost:7687");
    env::set_var("NEO4J_USERNAME", "neo4j");
    env::set_var("NEO4J_PASSWORD", "password");
    env::set_var("NEO4J_DATABASE", "neo4j");
    env::set_var("MFA_REQUIRED", "true");
    env::set_var("MFA_ISSUER", "EDT2-Test");

    // Set optional fields
    env::set_var("APPROVED_EMAILS", "test1@example.com,test2@example.com");
    env::set_var("RESEND_API_KEY", "test-api-key");
    env::set_var("EMAIL_OTP_ENABLED", "true");
    env::set_var("TOTP_ONLY_MODE", "false");

    let config = Config::from_env().expect("Config should load from env");

    // Verify optional fields were loaded
    assert_eq!(
        config.approved_emails,
        vec!["test1@example.com", "test2@example.com"]
    );
    assert_eq!(config.resend_api_key, Some("test-api-key".to_string()));
    assert_eq!(config.email_otp_enabled, true);
    assert_eq!(config.totp_only_mode, false);
    assert_eq!(config.mfa_required, true);

    // Clean up
    env::remove_var("JWT_SECRET");
    env::remove_var("REDIS_URL");
    env::remove_var("ENVIRONMENT");
    env::remove_var("NEO4J_URI");
    env::remove_var("NEO4J_USERNAME");
    env::remove_var("NEO4J_PASSWORD");
    env::remove_var("NEO4J_DATABASE");
    env::remove_var("MFA_REQUIRED");
    env::remove_var("MFA_ISSUER");
    env::remove_var("APPROVED_EMAILS");
    env::remove_var("RESEND_API_KEY");
    env::remove_var("EMAIL_OTP_ENABLED");
    env::remove_var("TOTP_ONLY_MODE");
}

#[test]
fn test_config_missing_required_field() {
    // Don't set JWT_SECRET to test error handling
    env::remove_var("JWT_SECRET");

    // This should panic because JWT_SECRET is required
    let result = std::panic::catch_unwind(|| Config::from_env());

    assert!(result.is_err());
}
