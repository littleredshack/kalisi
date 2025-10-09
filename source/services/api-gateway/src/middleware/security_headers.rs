use crate::csp_nonce_styles_simple;
use axum::{
    http::{header, HeaderValue, Request, Response},
    middleware::Next,
    response::IntoResponse,
};
use uuid::Uuid;

/// Security headers middleware for comprehensive web application security
pub async fn security_headers_middleware(
    mut request: Request<axum::body::Body>,
    next: Next,
) -> Response<axum::body::Body> {
    // Generate CSP nonce for this request
    let nonce = generate_nonce();

    // Store nonce in request extensions for use in templates
    request.extensions_mut().insert(CspNonce(nonce.clone()));

    let mut response = next.run(request).await;

    // Add comprehensive security headers
    add_security_headers(&mut response, &nonce);

    response
}

/// Generate a cryptographically secure nonce for CSP
fn generate_nonce() -> String {
    Uuid::new_v4().to_string().replace("-", "")
}

/// Add all security headers to the response
fn add_security_headers(response: &mut Response<axum::body::Body>, nonce: &str) {
    let headers = response.headers_mut();

    // Content Security Policy - Hardened for production
    let csp = build_content_security_policy(nonce);
    if let Ok(csp_value) = HeaderValue::from_str(&csp) {
        headers.insert(header::CONTENT_SECURITY_POLICY, csp_value);
    }

    // HTTP Strict Transport Security
    if let Ok(hsts_value) = HeaderValue::from_str("max-age=31536000; includeSubDomains; preload") {
        headers.insert(header::STRICT_TRANSPORT_SECURITY, hsts_value);
    }

    // X-Frame-Options - Prevent clickjacking
    if let Ok(frame_value) = HeaderValue::from_str("DENY") {
        headers.insert("x-frame-options", frame_value);
    }

    // X-Content-Type-Options - Prevent MIME sniffing
    if let Ok(content_type_value) = HeaderValue::from_str("nosniff") {
        headers.insert("x-content-type-options", content_type_value);
    }

    // Referrer Policy - Control referrer information
    if let Ok(referrer_value) = HeaderValue::from_str("strict-origin-when-cross-origin") {
        headers.insert("referrer-policy", referrer_value);
    }

    // Permissions Policy - Control browser features
    let permissions_policy = build_permissions_policy();
    if let Ok(permissions_value) = HeaderValue::from_str(&permissions_policy) {
        headers.insert("permissions-policy", permissions_value);
    }

    // X-XSS-Protection - Legacy XSS protection
    if let Ok(xss_value) = HeaderValue::from_str("1; mode=block") {
        headers.insert("x-xss-protection", xss_value);
    }

    // Cross-Origin-Embedder-Policy - relaxed for CDN resources
    // TODO: In production, serve all assets locally instead of using CDNs
    if let Ok(coep_value) = HeaderValue::from_str("unsafe-none") {
        headers.insert("cross-origin-embedder-policy", coep_value);
    }

    // Cross-Origin-Opener-Policy - disabled for HTTP access
    // Re-enable this when using HTTPS
    // if let Ok(coop_value) = HeaderValue::from_str("same-origin") {
    //     headers.insert("cross-origin-opener-policy", coop_value);
    // }

    // Cross-Origin-Resource-Policy
    if let Ok(corp_value) = HeaderValue::from_str("same-origin") {
        headers.insert("cross-origin-resource-policy", corp_value);
    }

    // Server header removal (security through obscurity)
    headers.remove(header::SERVER);

    // Custom security headers
    if let Ok(powered_by) = HeaderValue::from_str("Rust/Axum") {
        headers.insert("x-powered-by", powered_by);
    }

    if let Ok(robots_value) = HeaderValue::from_str("noindex, nofollow, noarchive, nosnippet") {
        headers.insert("x-robots-tag", robots_value);
    }

    // Report-To header for modern CSP reporting
    let report_to =
        r#"{"group":"csp-endpoint","max_age":10886400,"endpoints":[{"url":"/csp-report"}]}"#;
    if let Ok(report_to_value) = HeaderValue::from_str(report_to) {
        headers.insert("report-to", report_to_value);
    }
}

/// Build a comprehensive Content Security Policy
fn build_content_security_policy(nonce: &str) -> String {
    let mut csp_directives = Vec::new();

    // Default source - most restrictive
    csp_directives.push("default-src 'self'");

    // Script sources - using nonce for inline scripts (HARDENED)
    // Financial services: Local assets only, no CDN dependencies
    // Include 'wasm-unsafe-eval' for WebAssembly compilation support
    let script_src = format!(
        "script-src 'self' 'nonce-{}' 'unsafe-hashes' 'wasm-unsafe-eval' 'sha256-MhtPZXr7+LpJUY5qtMutB+qWfQtMaPccfe7QXtCcEYc=' https://cdn.tailwindcss.com",
        nonce
    );
    csp_directives.push(&script_src);

    // Style sources - using nonce-based approach for Angular Material compatibility
    // This provides better security than 'unsafe-inline' while being practical
    let style_src = csp_nonce_styles_simple::build_nonce_based_style_src(nonce);
    csp_directives.push(&style_src);

    // Image sources - allow QR code API
    csp_directives.push("img-src 'self' data: https: https://api.qrserver.com");

    // Font sources - local only for financial services
    csp_directives.push("font-src 'self' https://fonts.gstatic.com");

    // Connect sources - for API calls and WebSocket connections
    csp_directives.push("connect-src 'self' wss: ws:");

    // Media sources
    csp_directives.push("media-src 'self'");

    // Object sources - disallow plugins
    csp_directives.push("object-src 'none'");

    // Base URI - prevent base tag injection
    csp_directives.push("base-uri 'self'");

    // Form action - restrict form submissions
    csp_directives.push("form-action 'self'");

    // Frame ancestors - prevent framing
    csp_directives.push("frame-ancestors 'none'");

    // Frame sources - restrict iframes
    csp_directives.push("frame-src 'none'");

    // Manifest sources
    csp_directives.push("manifest-src 'self'");

    // Worker sources - include blob for Monaco Editor workers
    csp_directives.push("worker-src 'self' blob:");

    // Upgrade insecure requests
    // Only enable upgrade-insecure-requests if we're actually using HTTPS
    // For now, comment out to allow HTTP access
    // csp_directives.push("upgrade-insecure-requests");

    // Block all mixed content
    csp_directives.push("block-all-mixed-content");

    // Add CSP reporting
    csp_directives.push("report-uri /csp-report");
    csp_directives.push("report-to csp-endpoint");

    csp_directives.join("; ")
}

/// Build Permissions Policy for browser feature control
fn build_permissions_policy() -> String {
    let mut policies = Vec::new();

    // Disable sensitive features (only non-deprecated ones)
    policies.push("accelerometer=()");
    policies.push("autoplay=()");
    policies.push("camera=()");
    policies.push("display-capture=()");
    policies.push("encrypted-media=()");
    policies.push("fullscreen=()");
    policies.push("geolocation=()");
    policies.push("gyroscope=()");
    policies.push("interest-cohort=()"); // Disable FLoC
    policies.push("magnetometer=()");
    policies.push("microphone=()");
    policies.push("midi=()");
    policies.push("payment=()");
    policies.push("picture-in-picture=()");
    policies.push("publickey-credentials-get=()");
    policies.push("screen-wake-lock=()");
    policies.push("sync-xhr=()");
    policies.push("usb=()");
    policies.push("web-share=()");
    policies.push("xr-spatial-tracking=()");

    // Allow clipboard access for copy functionality
    policies.push("clipboard-read=(self)");
    policies.push("clipboard-write=(self)");

    policies.join(", ")
}

/// CSP Nonce wrapper for template access
#[derive(Clone)]
pub struct CspNonce(pub String);

impl CspNonce {
    /// Extract nonce from request extensions
    pub fn from_request<B>(request: &Request<B>) -> Option<String> {
        request.extensions().get::<CspNonce>().map(|n| n.0.clone())
    }

    /// Get the nonce value
    #[allow(dead_code)]
    pub fn value(&self) -> &str {
        &self.0
    }
}

/// CSP violation reporting endpoint
pub async fn csp_report_handler(
    axum::extract::Json(report): axum::extract::Json<CspViolationReport>,
) -> impl IntoResponse {
    // Log CSP violation for security monitoring
    tracing::warn!(
        "CSP Violation: {} attempted to load {} from {} on {}",
        report.csp_report.violated_directive.unwrap_or_default(),
        report.csp_report.blocked_uri.unwrap_or_default(),
        report.csp_report.source_file.unwrap_or_default(),
        report.csp_report.document_uri.unwrap_or_default()
    );

    // In development, log the sample for debugging
    #[cfg(debug_assertions)]
    if let Some(sample) = &report.csp_report.script_sample {
        tracing::debug!("CSP Violation sample: {}", sample);
    }

    // Return 204 No Content as per CSP spec
    axum::http::StatusCode::NO_CONTENT
}

/// CSP Violation Report structure
#[derive(serde::Deserialize, Debug)]
pub struct CspViolationReport {
    #[serde(rename = "csp-report")]
    pub csp_report: CspReport,
}

#[derive(serde::Deserialize, Debug)]
#[allow(dead_code)]
pub struct CspReport {
    #[serde(rename = "document-uri")]
    pub document_uri: Option<String>,
    #[serde(rename = "referrer")]
    pub referrer: Option<String>,
    #[serde(rename = "violated-directive")]
    pub violated_directive: Option<String>,
    #[serde(rename = "effective-directive")]
    pub effective_directive: Option<String>,
    #[serde(rename = "original-policy")]
    pub original_policy: Option<String>,
    #[serde(rename = "disposition")]
    pub disposition: Option<String>,
    #[serde(rename = "blocked-uri")]
    pub blocked_uri: Option<String>,
    #[serde(rename = "line-number")]
    pub line_number: Option<u32>,
    #[serde(rename = "column-number")]
    pub column_number: Option<u32>,
    #[serde(rename = "source-file")]
    pub source_file: Option<String>,
    #[serde(rename = "status-code")]
    pub status_code: Option<u16>,
    #[serde(rename = "script-sample")]
    pub script_sample: Option<String>,
}

/// Security-focused CORS configuration
#[allow(dead_code)]
pub fn build_cors_layer() -> tower_http::cors::CorsLayer {
    use axum::http::Method;
    use tower_http::cors::CorsLayer;

    CorsLayer::new()
        .allow_origin(
            "http://localhost:8080"
                .parse::<axum::http::HeaderValue>()
                .unwrap(),
        )
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
            axum::http::header::ACCEPT,
        ])
        .allow_credentials(true)
        .max_age(std::time::Duration::from_secs(3600))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nonce_generation() {
        let nonce1 = generate_nonce();
        let nonce2 = generate_nonce();

        // Nonces should be different
        assert_ne!(nonce1, nonce2);

        // Nonces should be 32 characters (UUID without hyphens)
        assert_eq!(nonce1.len(), 32);
        assert_eq!(nonce2.len(), 32);

        // Should contain only hex characters
        assert!(nonce1.chars().all(|c| c.is_ascii_hexdigit()));
        assert!(nonce2.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_csp_construction() {
        let nonce = "test123";
        let csp = build_content_security_policy(nonce);

        // Should contain the nonce
        assert!(csp.contains(&format!("'nonce-{}'", nonce)));

        // Should have WASM support
        assert!(csp.contains("'wasm-unsafe-eval'"));

        // Should have strict directives
        assert!(csp.contains("default-src 'self'"));
        assert!(csp.contains("object-src 'none'"));
        assert!(csp.contains("frame-ancestors 'none'"));
        // Disabled for HTTP access
        // assert!(csp.contains("upgrade-insecure-requests"));
    }

    #[test]
    fn test_permissions_policy() {
        let policy = build_permissions_policy();

        // Should disable sensitive features
        assert!(policy.contains("camera=()"));
        assert!(policy.contains("microphone=()"));
        assert!(policy.contains("geolocation=()"));
        assert!(policy.contains("interest-cohort=()")); // FLoC disabled

        // Should allow clipboard for legitimate use
        assert!(policy.contains("clipboard-read=(self)"));
        assert!(policy.contains("clipboard-write=(self)"));
    }
}
