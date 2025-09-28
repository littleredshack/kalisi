use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub jwt_secret: String,
    pub redis_url: String,
    pub approved_emails: Vec<String>,
    pub environment: String,
    pub resend_api_key: Option<String>,
    #[allow(dead_code)]
    pub email_otp_enabled: bool,
    pub totp_only_mode: bool,
    // Neo4j configuration
    #[allow(dead_code)]
    pub neo4j_uri: String,
    #[allow(dead_code)]
    pub neo4j_username: String,
    #[allow(dead_code)]
    pub neo4j_password: String,
    #[allow(dead_code)]
    pub neo4j_database: String,
    // MFA configuration
    pub mfa_required: bool,
    pub mfa_issuer: String,
    // Authentication v2 (redesigned flow)
    #[allow(dead_code)]
    pub auth_v2_enabled: bool,
    // Content Security Policy
    #[allow(dead_code)]
    pub csp_report_endpoint: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let jwt_secret = env::var("JWT_SECRET")
            .expect("JWT_SECRET must be set in .env file - no defaults allowed");
        
        let approved_emails = env::var("APPROVED_EMAILS")
            .unwrap_or_default()
            .split(',')
            .filter(|s| !s.is_empty())
            .map(|s| s.trim().to_string())
            .collect();
        
        Ok(Config {
            jwt_secret,
            redis_url: env::var("REDIS_URL")
                .expect("REDIS_URL must be set in .env file"),
            approved_emails,
            environment: env::var("ENVIRONMENT")
                .expect("ENVIRONMENT must be set in .env file"),
            resend_api_key: env::var("RESEND_API_KEY").ok(),
            email_otp_enabled: env::var("EMAIL_OTP_ENABLED")
                .unwrap_or_else(|_| "false".to_string())
                .parse()
                .unwrap_or(false),
            totp_only_mode: env::var("TOTP_ONLY_MODE")
                .unwrap_or_else(|_| "false".to_string())
                .parse()
                .unwrap_or(false),
            neo4j_uri: env::var("NEO4J_URI")
                .expect("NEO4J_URI must be set in .env file"),
            neo4j_username: env::var("NEO4J_USERNAME")
                .unwrap_or_else(|_| env::var("NEO4J_USER").expect("NEO4J_USERNAME or NEO4J_USER must be set")),
            neo4j_password: env::var("NEO4J_PASSWORD")
                .expect("NEO4J_PASSWORD must be set in .env file"),
            neo4j_database: env::var("NEO4J_DATABASE")
                .expect("NEO4J_DATABASE must be set in .env file"),
            mfa_required: {
                let mfa_env = env::var("MFA_REQUIRED")
                    .expect("MFA_REQUIRED must be set in .env file");
                eprintln!("🔧 DEBUG: MFA_REQUIRED env var = '{}'", mfa_env);
                let parsed = mfa_env.parse()
                    .expect("MFA_REQUIRED must be 'true' or 'false'");
                eprintln!("🔧 DEBUG: MFA_REQUIRED parsed = {}", parsed);
                parsed
            },
            mfa_issuer: env::var("MFA_ISSUER")
                .expect("MFA_ISSUER must be set in .env file"),
            auth_v2_enabled: env::var("AUTH_V2_ENABLED")
                .unwrap_or_else(|_| "false".to_string())
                .parse()
                .unwrap_or(false),
            csp_report_endpoint: "/csp-report".to_string(),
        })
    }
}