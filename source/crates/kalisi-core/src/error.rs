use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Authentication failed")]
    AuthenticationFailed,

    #[error("Invalid token")]
    InvalidToken,

    #[error("Token expired")]
    TokenExpired,

    #[error("Invalid OTP")]
    InvalidOTP,

    #[error("OTP expired")]
    OTPExpired,

    #[error("Too many requests")]
    RateLimitExceeded,

    #[error("Email not authorized")]
    EmailNotAuthorized,

    #[error("Database error: {0}")]
    Database(String),

    #[error("Redis error: {0}")]
    Redis(String),

    #[error("Internal server error")]
    Internal,

    #[error("Bad request: {0}")]
    BadRequest(String),
}

pub type Result<T> = std::result::Result<T, Error>;

// Implement conversions for common error types
// SQLx support removed - using Redis as primary database

#[cfg(feature = "redis-integration")]
impl From<redis::RedisError> for Error {
    fn from(err: redis::RedisError) -> Self {
        Error::Redis(err.to_string())
    }
}

impl From<jsonwebtoken::errors::Error> for Error {
    fn from(err: jsonwebtoken::errors::Error) -> Self {
        use jsonwebtoken::errors::ErrorKind;
        match err.kind() {
            ErrorKind::ExpiredSignature => Error::TokenExpired,
            _ => Error::InvalidToken,
        }
    }
}
