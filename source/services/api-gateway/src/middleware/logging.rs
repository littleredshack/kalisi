use axum::{extract::Request, http::HeaderMap, middleware::Next, response::Response};
use std::time::Instant;

use crate::{
    logging::{LogCategory, LogLevel},
    state::AppState,
};

/// Middleware to log all HTTP requests and responses
pub async fn logging_middleware(
    state: axum::extract::State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    // Extract IP address from headers if available, otherwise use unknown
    let addr = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|hv| hv.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    let start = Instant::now();
    let method = request.method().clone();
    let uri = request.uri().clone();
    let path = uri.path().to_string();
    let query = uri.query().map(|q| q.to_string());

    // Extract headers for logging (excluding sensitive ones)
    let headers = extract_safe_headers(request.headers());

    // Generate request ID
    let request_id = uuid::Uuid::new_v4().to_string();

    // Log request
    let mut request_context = std::collections::HashMap::new();
    request_context.insert(
        "request_id".to_string(),
        serde_json::json!(request_id.clone()),
    );
    request_context.insert("method".to_string(), serde_json::json!(method.to_string()));
    request_context.insert("path".to_string(), serde_json::json!(path.clone()));
    request_context.insert("remote_addr".to_string(), serde_json::json!(addr));

    if let Some(q) = &query {
        request_context.insert("query".to_string(), serde_json::json!(q));
    }

    for (key, value) in headers {
        request_context.insert(format!("header_{}", key), serde_json::json!(value));
    }

    state
        .logger
        .log_with_context(
            LogLevel::Info,
            LogCategory::Api,
            &format!("{} {} - Request received", method, path),
            request_context.clone(),
        )
        .await;

    // Process request
    let response = next.run(request).await;

    // Calculate duration
    let duration = start.elapsed();
    let duration_ms = duration.as_millis() as u64;

    // Log response
    let status = response.status();
    let mut response_context = request_context;
    response_context.insert("status".to_string(), serde_json::json!(status.as_u16()));
    response_context.insert("duration_ms".to_string(), serde_json::json!(duration_ms));

    let level = if status.is_server_error() {
        LogLevel::Error
    } else if status.is_client_error() {
        LogLevel::Warn
    } else {
        LogLevel::Info
    };

    state
        .logger
        .log_with_context(
            level,
            LogCategory::Api,
            &format!(
                "{} {} - {} in {}ms",
                method,
                path,
                status.as_u16(),
                duration_ms
            ),
            response_context,
        )
        .await;

    // Log slow requests
    if duration_ms > 1000 {
        let mut slow_context = std::collections::HashMap::new();
        slow_context.insert("request_id".to_string(), serde_json::json!(request_id));
        slow_context.insert("duration_ms".to_string(), serde_json::json!(duration_ms));
        slow_context.insert("path".to_string(), serde_json::json!(path));

        state
            .logger
            .log_with_context(
                LogLevel::Warn,
                LogCategory::Performance,
                &format!("Slow request: {} {} took {}ms", method, path, duration_ms),
                slow_context,
            )
            .await;
    }

    response
}

/// Extract headers that are safe to log (excluding sensitive ones)
fn extract_safe_headers(headers: &HeaderMap) -> Vec<(String, String)> {
    let sensitive_headers = [
        "authorization",
        "cookie",
        "x-auth-token",
        "x-api-key",
        "x-csrf-token",
    ];

    headers
        .iter()
        .filter_map(|(name, value)| {
            let name_str = name.as_str().to_lowercase();

            // Skip sensitive headers
            if sensitive_headers.contains(&name_str.as_str()) {
                return None;
            }

            // Try to convert value to string
            value.to_str().ok().map(|v| {
                // Truncate very long header values
                let truncated = if v.len() > 200 {
                    format!("{}...", &v[..200])
                } else {
                    v.to_string()
                };
                (name_str, truncated)
            })
        })
        .collect()
}

/// Middleware for logging errors
pub async fn error_logging_middleware(
    state: axum::extract::State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, Response> {
    let path = request.uri().path().to_string();
    let method = request.method().clone();

    let response = next.run(request).await;

    // Check if response is an error
    if response.status().is_server_error() {
        let mut context = std::collections::HashMap::new();
        context.insert("method".to_string(), serde_json::json!(method.to_string()));
        context.insert("path".to_string(), serde_json::json!(path));
        context.insert(
            "status".to_string(),
            serde_json::json!(response.status().as_u16()),
        );

        state
            .logger
            .log_with_context(
                LogLevel::Error,
                LogCategory::System,
                &format!("Server error on {} {}: {}", method, path, response.status()),
                context,
            )
            .await;
    }

    Ok(response)
}
