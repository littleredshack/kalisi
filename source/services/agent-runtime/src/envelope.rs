use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Authority levels for agent operations
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, PartialOrd)]
pub enum AuthorityLevel {
    None = 0,
    ReadOnly = 1,
    Limited = 2,
    Standard = 3,
    Elevated = 4,
    Admin = 5,
}

/// Audit information for compliance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditInfo {
    pub user_id: Option<String>,
    pub session_id: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub tags: HashMap<String, String>,
}

/// Message envelope for agent communication
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    /// Unique message ID
    pub message_id: String,

    /// Correlation ID for tracing conversations
    pub correlation_id: String,

    /// Sender agent ID
    pub sender: String,

    /// Recipient agent ID or broadcast
    pub recipient: String,

    /// Protocol being used (e.g., "security.logs.query.v1")
    pub protocol: String,

    /// Message verb (e.g., "Query", "Response", "Error")
    pub verb: String,

    /// Timestamp
    pub timestamp: DateTime<Utc>,

    /// Resource limits for this operation
    pub resource_limits: crate::agent::ResourceLimits,

    /// Authority level required
    pub authority_required: AuthorityLevel,

    /// Audit metadata for compliance
    pub audit: AuditInfo,

    /// Priority (0-10, higher = more important)
    pub priority: u8,

    /// Deadline for response (optional)
    pub deadline: Option<DateTime<Utc>>,
}

impl Envelope {
    /// Create a new envelope with defaults
    pub fn new(protocol: String, verb: String) -> Self {
        Self {
            message_id: uuid::Uuid::new_v4().to_string(),
            correlation_id: uuid::Uuid::new_v4().to_string(),
            sender: "system".to_string(),
            recipient: "broadcast".to_string(),
            protocol,
            verb,
            timestamp: Utc::now(),
            resource_limits: crate::agent::ResourceLimits::default(),
            authority_required: AuthorityLevel::ReadOnly,
            audit: AuditInfo {
                user_id: None,
                session_id: None,
                ip_address: None,
                user_agent: None,
                tags: HashMap::new(),
            },
            priority: 5,
            deadline: None,
        }
    }

    /// Set correlation ID for conversation tracking
    pub fn with_correlation(mut self, correlation_id: String) -> Self {
        self.correlation_id = correlation_id;
        self
    }

    /// Set sender
    pub fn from(mut self, sender: String) -> Self {
        self.sender = sender;
        self
    }

    /// Set recipient
    pub fn to(mut self, recipient: String) -> Self {
        self.recipient = recipient;
        self
    }

    /// Set audit info
    pub fn with_audit(mut self, audit: AuditInfo) -> Self {
        self.audit = audit;
        self
    }
}

/// Message types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Message<T> {
    Request(T),
    Response(T),
    Event(T),
    Error(ErrorMessage),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorMessage {
    pub code: String,
    pub message: String,
    pub details: Option<serde_json::Value>,
}
