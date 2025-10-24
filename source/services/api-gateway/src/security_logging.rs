use chrono::Utc;
use serde_json::json;
use std::net::IpAddr;
use tracing::{error, info, warn};

/// Security event types for comprehensive audit logging
#[derive(Debug, Clone)]
pub enum SecurityEventType {
    AuthFailure,
    AuthSuccess,
    UnauthorizedAccess,
    SuspiciousActivity,
    PrivilegedOperation,
    ConfigurationChange,
    DataAccess,
    SessionActivity,
}

impl SecurityEventType {
    fn severity(&self) -> &'static str {
        match self {
            SecurityEventType::AuthFailure
            | SecurityEventType::UnauthorizedAccess
            | SecurityEventType::SuspiciousActivity => "HIGH",

            SecurityEventType::PrivilegedOperation | SecurityEventType::ConfigurationChange => {
                "MEDIUM"
            }

            SecurityEventType::AuthSuccess
            | SecurityEventType::DataAccess
            | SecurityEventType::SessionActivity => "INFO",
        }
    }
}

/// Comprehensive security event logging for financial services compliance
pub struct SecurityLogger;

impl SecurityLogger {
    /// Log a security event with full audit trail information
    pub fn log_event(
        event_type: SecurityEventType,
        user_id: Option<&str>,
        ip_address: Option<IpAddr>,
        details: serde_json::Value,
        additional_context: Option<serde_json::Value>,
    ) {
        let log_entry = json!({
            "timestamp": Utc::now().to_rfc3339(),
            "event_type": format!("{:?}", event_type),
            "severity": event_type.severity(),
            "user_id": user_id.unwrap_or("anonymous"),
            "source_ip": ip_address.map(|ip| ip.to_string()).unwrap_or_else(|| "unknown".to_string()),
            "service": "edt-api-gateway",
            "version": env!("CARGO_PKG_VERSION"),
            "details": details,
            "context": additional_context.unwrap_or(json!({})),
            "compliance": {
                "sox_audit": true,
                "pci_logging": true,
                "gdpr_processing": true,
                "nist_detect": true
            }
        });

        // Log based on severity level
        match event_type.severity() {
            "HIGH" => error!(target: "security_audit", "{}", log_entry),
            "MEDIUM" => warn!(target: "security_audit", "{}", log_entry),
            "INFO" => info!(target: "security_audit", "{}", log_entry),
            _ => info!(target: "security_audit", "{}", log_entry),
        }

        // Additional processing for critical events
        if matches!(event_type.severity(), "HIGH") {
            Self::handle_critical_event(&log_entry);
        }
    }

    /// Handle critical security events with immediate response
    fn handle_critical_event(log_entry: &serde_json::Value) {
        // In production, this would trigger:
        // - SIEM alerts
        // - Incident response workflows
        // - Real-time notifications to security team

        error!(target: "critical_security", "CRITICAL SECURITY EVENT: {}", log_entry);

        // TODO: Implement in production:
        // - Send alert to monitoring system
        // - Trigger automatic containment if needed
        // - Log to separate high-priority security channel
    }

    /// Log authentication attempts
    pub fn log_auth_attempt(
        success: bool,
        email: &str,
        ip_address: Option<IpAddr>,
        method: &str,
        failure_reason: Option<&str>,
    ) {
        let event_type = if success {
            SecurityEventType::AuthSuccess
        } else {
            SecurityEventType::AuthFailure
        };

        let details = json!({
            "authentication_method": method,
            "email": Self::sanitize_email(email),
            "success": success,
            "failure_reason": failure_reason,
            "timestamp_unix": Utc::now().timestamp(),
        });

        Self::log_event(event_type, Some(email), ip_address, details, None);
    }

    /// Log privileged operations
    pub fn log_privileged_operation(
        user_id: &str,
        operation: &str,
        resource: &str,
        ip_address: Option<IpAddr>,
        success: bool,
    ) {
        let details = json!({
            "operation": operation,
            "resource": resource,
            "success": success,
            "requires_audit": true,
            "compliance_relevant": true,
        });

        Self::log_event(
            SecurityEventType::PrivilegedOperation,
            Some(user_id),
            ip_address,
            details,
            None,
        );
    }

    /// Log data access events for compliance
    pub fn log_data_access(
        user_id: &str,
        data_type: &str,
        operation: &str,
        record_count: Option<usize>,
        ip_address: Option<IpAddr>,
    ) {
        let details = json!({
            "data_type": data_type,
            "operation": operation,
            "record_count": record_count,
            "gdpr_relevant": Self::is_personal_data(data_type),
            "sox_relevant": Self::is_financial_data(data_type),
        });

        Self::log_event(
            SecurityEventType::DataAccess,
            Some(user_id),
            ip_address,
            details,
            None,
        );
    }

    /// Log suspicious activities
    pub fn log_suspicious_activity(
        description: &str,
        ip_address: Option<IpAddr>,
        severity_score: u8,
        indicators: Vec<String>,
    ) {
        let details = json!({
            "description": description,
            "severity_score": severity_score,
            "indicators": indicators,
            "auto_response_triggered": severity_score > 80,
            "investigation_required": true,
        });

        Self::log_event(
            SecurityEventType::SuspiciousActivity,
            None,
            ip_address,
            details,
            None,
        );
    }

    /// Sanitize email for logging (GDPR compliance)
    fn sanitize_email(email: &str) -> String {
        if email.contains('@') {
            let parts: Vec<&str> = email.split('@').collect();
            if parts.len() == 2 {
                let username = parts[0];
                let domain = parts[1];

                // Partially mask username for privacy
                if username.len() > 2 {
                    format!("{}***@{}", &username[..2], domain)
                } else {
                    format!("***@{}", domain)
                }
            } else {
                "invalid_email@unknown".to_string()
            }
        } else {
            "invalid_format".to_string()
        }
    }

    /// Check if data type contains personal information
    fn is_personal_data(data_type: &str) -> bool {
        matches!(
            data_type.to_lowercase().as_str(),
            "user" | "profile" | "contact" | "email" | "personal" | "identity"
        )
    }

    /// Check if data type contains financial information
    fn is_financial_data(data_type: &str) -> bool {
        matches!(
            data_type.to_lowercase().as_str(),
            "transaction" | "payment" | "account" | "financial" | "billing" | "revenue"
        )
    }
}

/// Convenience macros for common security logging operations
#[macro_export]
macro_rules! log_auth_success {
    ($email:expr, $ip:expr, $method:expr) => {
        $crate::security_logging::SecurityLogger::log_auth_attempt(true, $email, $ip, $method, None);
    };
}

#[macro_export]
macro_rules! log_auth_failure {
    ($email:expr, $ip:expr, $method:expr, $reason:expr) => {
        $crate::security_logging::SecurityLogger::log_auth_attempt(
            false,
            $email,
            $ip,
            $method,
            Some($reason),
        );
    };
}

#[macro_export]
macro_rules! log_suspicious {
    ($desc:expr, $ip:expr, $score:expr, $indicators:expr) => {
        $crate::security_logging::SecurityLogger::log_suspicious_activity(
            $desc,
            $ip,
            $score,
            $indicators,
        );
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv4Addr;

    #[test]
    fn test_email_sanitization() {
        assert_eq!(
            SecurityLogger::sanitize_email("john.doe@example.com"),
            "jo***@example.com"
        );
        assert_eq!(SecurityLogger::sanitize_email("a@test.com"), "***@test.com");
        assert_eq!(
            SecurityLogger::sanitize_email("invalid_email"),
            "invalid_format"
        );
    }

    #[test]
    fn test_data_type_classification() {
        assert!(SecurityLogger::is_personal_data("user"));
        assert!(SecurityLogger::is_financial_data("transaction"));
        assert!(!SecurityLogger::is_personal_data("system"));
    }

    #[test]
    fn test_security_logging() {
        let ip = Some(IpAddr::V4(Ipv4Addr::new(192, 168, 1, 1)));

        SecurityLogger::log_auth_attempt(true, "test@example.com", ip, "otp", None);

        SecurityLogger::log_suspicious_activity(
            "Multiple failed login attempts",
            ip,
            85,
            vec!["brute_force".to_string(), "rate_limit_exceeded".to_string()],
        );
    }
}
