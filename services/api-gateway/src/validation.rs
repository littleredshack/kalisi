use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use validator::{Validate, ValidationError, ValidationErrors};

#[derive(Error, Debug)]
pub enum ValidationError {
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("SQL injection detected")]
    SqlInjectionDetected,
    
    #[error("XSS attempt detected")]
    XssDetected,
    
    #[error("Path traversal attempt detected")]
    PathTraversalDetected,
    
    #[error("Invalid characters in input")]
    InvalidCharacters,
    
    #[error("Input too long: max {max} characters, got {actual}")]
    InputTooLong { max: usize, actual: usize },
    
    #[error("Validation failed: {0}")]
    ValidationFailed(#[from] validator::ValidationErrors),
}

/// Security validator for detecting malicious patterns
pub struct SecurityValidator {
    sql_patterns: Vec<Regex>,
    xss_patterns: Vec<Regex>,
    path_patterns: Vec<Regex>,
}

impl Default for SecurityValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl SecurityValidator {
    pub fn new() -> Self {
        // SQL injection patterns
        let sql_patterns = vec![
            r"(?i)(union\s+select|select\s+.*\s+from|insert\s+into|delete\s+from|drop\s+table|update\s+.*\s+set)",
            r"(?i)(exec\s*\(|execute\s+|xp_cmdshell|sp_executesql)",
            r"(?i)(script\s*>|<\s*script|javascript:|vbscript:|onload\s*=|onerror\s*=|onclick\s*=)",
            r"(--|#|/\*|\*/|;|\||&&|\|\|)",
            r"(?i)(char\s*\(|concat\s*\(|chr\s*\(|ascii\s*\(|substring\s*\()",
        ];
        
        // XSS patterns
        let xss_patterns = vec![
            r"<\s*script[^>]*>.*?<\s*/\s*script\s*>",
            r"(?i)(javascript|vbscript|onload|onerror|onclick|onmouseover|onfocus|onblur)\s*[:=]",
            r"<\s*iframe[^>]*>",
            r"<\s*object[^>]*>",
            r"<\s*embed[^>]*>",
            r"<\s*img[^>]*src[^>]*>",
            r"(?i)(document\.|window\.|eval\s*\(|expression\s*\()",
        ];
        
        // Path traversal patterns
        let path_patterns = vec![
            r"\.\./?",
            r"\.\.\\",
            r"%2e%2e[/\\]",
            r"%252e%252e[/\\]",
            r"(?i)(etc/passwd|boot\.ini|win\.ini)",
        ];
        
        Self {
            sql_patterns: sql_patterns.iter().map(|p| Regex::new(p).unwrap()).collect(),
            xss_patterns: xss_patterns.iter().map(|p| Regex::new(p).unwrap()).collect(),
            path_patterns: path_patterns.iter().map(|p| Regex::new(p).unwrap()).collect(),
        }
    }
    
    /// Check for SQL injection patterns
    pub fn check_sql_injection(&self, input: &str) -> Result<(), ValidationError> {
        for pattern in &self.sql_patterns {
            if pattern.is_match(input) {
                return Err(ValidationError::SqlInjectionDetected);
            }
        }
        Ok(())
    }
    
    /// Check for XSS patterns
    pub fn check_xss(&self, input: &str) -> Result<(), ValidationError> {
        for pattern in &self.xss_patterns {
            if pattern.is_match(input) {
                return Err(ValidationError::XssDetected);
            }
        }
        Ok(())
    }
    
    /// Check for path traversal patterns
    pub fn check_path_traversal(&self, input: &str) -> Result<(), ValidationError> {
        for pattern in &self.path_patterns {
            if pattern.is_match(input) {
                return Err(ValidationError::PathTraversalDetected);
            }
        }
        Ok(())
    }
    
    /// Comprehensive security check
    pub fn validate_input(&self, input: &str) -> Result<(), ValidationError> {
        self.check_sql_injection(input)?;
        self.check_xss(input)?;
        self.check_path_traversal(input)?;
        Ok(())
    }
}

/// Input sanitizer for cleaning user input
pub struct InputSanitizer;

impl InputSanitizer {
    /// Remove dangerous HTML tags and attributes
    pub fn sanitize_html(input: &str) -> String {
        let dangerous_tags = Regex::new(r"<\s*/?(?:script|iframe|object|embed|form|input|button|select|textarea|style|link|meta|base)[^>]*>").unwrap();
        let dangerous_attrs = Regex::new(r"\s*(?:on\w+|style|javascript:|vbscript:)[^>\s]*").unwrap();
        
        let cleaned = dangerous_tags.replace_all(input, "");
        dangerous_attrs.replace_all(&cleaned, "").to_string()
    }
    
    /// Escape special characters for safe display
    pub fn escape_html(input: &str) -> String {
        input
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&#x27;")
            .replace('/', "&#x2F;")
    }
    
    /// Clean and validate file paths
    pub fn sanitize_path(input: &str) -> Result<String, ValidationError> {
        // Remove any path traversal attempts
        if input.contains("..") || input.contains("~") {
            return Err(ValidationError::PathTraversalDetected);
        }
        
        // Remove any non-alphanumeric characters except specific allowed ones
        let clean_path = Regex::new(r"[^a-zA-Z0-9\-_./]")
            .unwrap()
            .replace_all(input, "");
            
        Ok(clean_path.to_string())
    }
    
    /// Validate and clean email addresses
    pub fn sanitize_email(input: &str) -> Result<String, ValidationError> {
        let email_regex = Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap();
        
        let trimmed = input.trim().to_lowercase();
        if !email_regex.is_match(&trimmed) {
            return Err(ValidationError::InvalidInput("Invalid email format".to_string()));
        }
        
        Ok(trimmed)
    }
    
    /// Validate and clean phone numbers
    pub fn sanitize_phone(input: &str) -> Result<String, ValidationError> {
        let cleaned = input.chars()
            .filter(|c| c.is_numeric() || *c == '+' || *c == '-' || *c == ' ')
            .collect::<String>();
            
        if cleaned.len() < 10 || cleaned.len() > 15 {
            return Err(ValidationError::InvalidInput("Invalid phone number".to_string()));
        }
        
        Ok(cleaned)
    }
}

/// Common validation rules
#[derive(Debug, Deserialize, Serialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email format"))]
    #[validate(length(max = 255, message = "Email too long"))]
    pub email: String,
}

#[derive(Debug, Deserialize, Serialize, Validate)]
pub struct VerifyOtpRequest {
    #[validate(email(message = "Invalid email format"))]
    pub email: String,
    
    #[validate(regex(path = "OTP_REGEX", message = "Invalid OTP format"))]
    #[validate(length(equal = 6, message = "OTP must be 6 digits"))]
    pub otp: String,
}

lazy_static::lazy_static! {
    static ref OTP_REGEX: Regex = Regex::new(r"^\d{6}$").unwrap();
}

/// Request validator with rate limiting awareness
pub struct RequestValidator {
    security_validator: SecurityValidator,
    field_limits: HashMap<String, usize>,
}

impl Default for RequestValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl RequestValidator {
    pub fn new() -> Self {
        let mut field_limits = HashMap::new();
        
        // Define field length limits
        field_limits.insert("email".to_string(), 255);
        field_limits.insert("name".to_string(), 100);
        field_limits.insert("password".to_string(), 128);
        field_limits.insert("description".to_string(), 1000);
        field_limits.insert("url".to_string(), 2048);
        field_limits.insert("phone".to_string(), 20);
        
        Self {
            security_validator: SecurityValidator::new(),
            field_limits,
        }
    }
    
    /// Validate a field with security checks
    pub fn validate_field(&self, field_name: &str, value: &str) -> Result<String, ValidationError> {
        // Check field length
        if let Some(&max_length) = self.field_limits.get(field_name) {
            if value.len() > max_length {
                return Err(ValidationError::InputTooLong {
                    max: max_length,
                    actual: value.len(),
                });
            }
        }
        
        // Security validation
        self.security_validator.validate_input(value)?;
        
        // Field-specific validation
        match field_name {
            "email" => InputSanitizer::sanitize_email(value),
            "phone" => InputSanitizer::sanitize_phone(value),
            "path" => InputSanitizer::sanitize_path(value),
            _ => Ok(InputSanitizer::escape_html(value)),
        }
    }
    
    /// Validate JSON request body
    pub fn validate_json<T: Validate>(&self, data: &T) -> Result<(), ValidationError> {
        data.validate()?;
        Ok(())
    }
}

/// Validate UUID format
pub fn validate_uuid(uuid: &str) -> Result<(), ValidationError> {
    let uuid_regex = Regex::new(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").unwrap();
    
    if !uuid_regex.is_match(uuid) {
        return Err(ValidationError::InvalidInput("Invalid UUID format".to_string()));
    }
    
    Ok(())
}

/// Custom validation functions for use with validator derive
pub fn validate_no_sql_injection(value: &str) -> Result<(), ValidationError> {
    let validator = SecurityValidator::new();
    validator.check_sql_injection(value)
        .map_err(|_| ValidationError::new("sql_injection_detected"))
}

pub fn validate_no_xss(value: &str) -> Result<(), ValidationError> {
    let validator = SecurityValidator::new();
    validator.check_xss(value)
        .map_err(|_| ValidationError::new("xss_detected"))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_sql_injection_detection() {
        let validator = SecurityValidator::new();
        
        assert!(validator.check_sql_injection("SELECT * FROM users").is_err());
        assert!(validator.check_sql_injection("1; DROP TABLE users--").is_err());
        assert!(validator.check_sql_injection("normal input").is_ok());
    }
    
    #[test]
    fn test_xss_detection() {
        let validator = SecurityValidator::new();
        
        assert!(validator.check_xss("<script>alert('xss')</script>").is_err());
        assert!(validator.check_xss("javascript:alert(1)").is_err());
        assert!(validator.check_xss("normal input").is_ok());
    }
    
    #[test]
    fn test_path_traversal_detection() {
        let validator = SecurityValidator::new();
        
        assert!(validator.check_path_traversal("../../etc/passwd").is_err());
        assert!(validator.check_path_traversal("..\\windows\\system32").is_err());
        assert!(validator.check_path_traversal("normal/path").is_ok());
    }
    
    #[test]
    fn test_html_sanitization() {
        let input = "<script>alert('xss')</script><p>Hello</p>";
        let sanitized = InputSanitizer::sanitize_html(input);
        assert!(!sanitized.contains("<script>"));
        assert!(sanitized.contains("<p>Hello</p>"));
    }
    
    #[test]
    fn test_email_validation() {
        assert!(InputSanitizer::sanitize_email("test@example.com").is_ok());
        assert!(InputSanitizer::sanitize_email("invalid-email").is_err());
    }
}