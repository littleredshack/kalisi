use axum::{
    body::Body,
    http::{header, HeaderValue, Request, Response, StatusCode},
    middleware::Next,
};
use std::time::Duration;
use tower::ServiceBuilder;
use tower_http::cors::{Any, CorsLayer};

/// Security headers that should be applied to all responses
pub async fn security_headers_middleware(
    req: Request<Body>,
    next: Next,
) -> Result<Response<Body>, StatusCode> {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    
    // Strict Transport Security (HSTS) - enforce HTTPS for 1 year
    headers.insert(
        header::STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
    );
    
    // Prevent MIME type sniffing
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    
    // Prevent clickjacking
    headers.insert(
        header::X_FRAME_OPTIONS,
        HeaderValue::from_static("DENY"),
    );
    
    // XSS Protection (for older browsers)
    headers.insert(
        "X-XSS-Protection",
        HeaderValue::from_static("1; mode=block"),
    );
    
    // Content Security Policy - strict by default
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'self'; \
             script-src 'self' 'unsafe-inline' 'unsafe-eval'; \
             style-src 'self' 'unsafe-inline'; \
             img-src 'self' data: https:; \
             font-src 'self'; \
             connect-src 'self' wss: https:; \
             frame-ancestors 'none'; \
             base-uri 'self'; \
             form-action 'self'"
        ),
    );
    
    // Referrer Policy
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    
    // Permissions Policy (replaces Feature Policy)
    headers.insert(
        "Permissions-Policy",
        HeaderValue::from_static(
            "accelerometer=(), \
             camera=(), \
             geolocation=(), \
             gyroscope=(), \
             magnetometer=(), \
             microphone=(), \
             payment=(), \
             usb=()"
        ),
    );
    
    // Cache Control for security
    if !headers.contains_key(header::CACHE_CONTROL) {
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store, no-cache, must-revalidate, private"),
        );
    }
    
    // Remove server header to avoid information disclosure
    headers.remove(header::SERVER);
    
    // Add custom security header
    headers.insert(
        "X-EDT-Security",
        HeaderValue::from_static("enhanced"),
    );
    
    Ok(response)
}

/// Create a secure CORS configuration for production
pub fn create_cors_layer() -> CorsLayer {
    let allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| "https://localhost:3000,https://localhost:3001".to_string());
    
    let origins: Vec<HeaderValue> = allowed_origins
        .split(',')
        .filter_map(|origin| HeaderValue::from_str(origin.trim()).ok())
        .collect();
    
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::ORIGIN,
            header::X_REQUESTED_WITH,
        ])
        .allow_credentials(true)
        .max_age(Duration::from_secs(3600))
}

/// Content type validation middleware
pub async fn content_type_validation(
    req: Request<Body>,
    next: Next,
) -> Result<Response<Body>, StatusCode> {
    // Skip validation for GET, HEAD, OPTIONS
    if matches!(
        req.method(),
        &axum::http::Method::GET | &axum::http::Method::HEAD | &axum::http::Method::OPTIONS
    ) {
        return Ok(next.run(req).await);
    }
    
    // Check Content-Type header
    if let Some(content_type) = req.headers().get(header::CONTENT_TYPE) {
        let content_type_str = content_type.to_str().unwrap_or("");
        
        // Allow only specific content types
        let allowed_types = [
            "application/json",
            "application/x-www-form-urlencoded",
            "multipart/form-data",
        ];
        
        let is_allowed = allowed_types
            .iter()
            .any(|&allowed| content_type_str.starts_with(allowed));
            
        if !is_allowed {
            return Err(StatusCode::UNSUPPORTED_MEDIA_TYPE);
        }
    } else if req.body().size_hint().lower() > 0 {
        // Reject requests with body but no Content-Type
        return Err(StatusCode::BAD_REQUEST);
    }
    
    Ok(next.run(req).await)
}

/// Request size limiting middleware
pub async fn request_size_limit(
    req: Request<Body>,
    next: Next,
) -> Result<Response<Body>, StatusCode> {
    const MAX_BODY_SIZE: u64 = 10 * 1024 * 1024; // 10MB
    
    // Check Content-Length header
    if let Some(content_length) = req.headers().get(header::CONTENT_LENGTH) {
        if let Ok(length_str) = content_length.to_str() {
            if let Ok(length) = length_str.parse::<u64>() {
                if length > MAX_BODY_SIZE {
                    return Err(StatusCode::PAYLOAD_TOO_LARGE);
                }
            }
        }
    }
    
    Ok(next.run(req).await)
}

/// HTTPS enforcement middleware
pub async fn https_redirect(
    req: Request<Body>,
    next: Next,
) -> Result<Response<Body>, StatusCode> {
    // Skip in development
    if std::env::var("ENVIRONMENT").unwrap_or_default() == "development" {
        return Ok(next.run(req).await);
    }
    
    // Check if request is HTTPS
    let is_https = req
        .headers()
        .get("X-Forwarded-Proto")
        .and_then(|v| v.to_str().ok())
        .map(|proto| proto == "https")
        .unwrap_or(false);
        
    if !is_https {
        // Build HTTPS URL
        let host = req
            .headers()
            .get(header::HOST)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("localhost");
            
        let path = req.uri().path();
        let query = req.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
        
        let https_url = format!("https://{}{}{}", host, path, query);
        
        // Return redirect response
        return Ok(Response::builder()
            .status(StatusCode::MOVED_PERMANENTLY)
            .header(header::LOCATION, https_url)
            .body(Body::empty())
            .unwrap());
    }
    
    Ok(next.run(req).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;
    
    #[tokio::test]
    async fn test_security_headers_applied() {
        let app = axum::Router::new()
            .route("/", axum::routing::get(|| async { "OK" }))
            .layer(axum::middleware::from_fn(security_headers_middleware));
            
        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
            
        assert!(response.headers().contains_key(header::STRICT_TRANSPORT_SECURITY));
        assert!(response.headers().contains_key(header::X_CONTENT_TYPE_OPTIONS));
        assert!(response.headers().contains_key(header::X_FRAME_OPTIONS));
        assert!(response.headers().contains_key("X-XSS-Protection"));
        assert!(response.headers().contains_key(header::CONTENT_SECURITY_POLICY));
        assert!(response.headers().contains_key(header::REFERRER_POLICY));
        assert!(response.headers().contains_key("Permissions-Policy"));
        assert!(!response.headers().contains_key(header::SERVER));
    }
    
    #[tokio::test]
    async fn test_content_type_validation() {
        let app = axum::Router::new()
            .route("/", axum::routing::post(|| async { "OK" }))
            .layer(axum::middleware::from_fn(content_type_validation));
            
        // Valid content type
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .unwrap()
            )
            .await
            .unwrap();
            
        assert_eq!(response.status(), StatusCode::OK);
        
        // Invalid content type
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/")
                    .header(header::CONTENT_TYPE, "text/plain")
                    .body(Body::from("test"))
                    .unwrap()
            )
            .await
            .unwrap();
            
        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);
    }
}