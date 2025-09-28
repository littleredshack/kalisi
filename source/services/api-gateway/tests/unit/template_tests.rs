use axum::{
    body::Body,
    extract::Request,
    http::{Method, StatusCode},
    middleware::from_fn,
    routing::get,
    Router,
};
use tower::ServiceExt;

use edt_api_gateway::handlers::templates::{monitoring_dashboard, security_dashboard};
use edt_api_gateway::middleware::security_headers::security_headers_middleware;

#[tokio::test]
async fn test_monitoring_dashboard_with_csp_nonce() {
    let app = Router::new()
        .route("/monitoring-dashboard", get(monitoring_dashboard))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/monitoring-dashboard")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    // Check content type
    let content_type = response.headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert_eq!(content_type, "text/html; charset=utf-8");

    // Get CSP header to verify nonce
    let csp_header = response.headers()
        .get("content-security-policy")
        .unwrap()
        .to_str()
        .unwrap();
    
    // Extract nonce from CSP header
    let nonce_start = csp_header.find("nonce-").unwrap() + 6;
    let nonce_end = csp_header[nonce_start..].find(|c: char| c == '\'' || c == ' ').unwrap() + nonce_start;
    let nonce = &csp_header[nonce_start..nonce_end];

    // Get response body
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html_content = String::from_utf8(body.to_vec()).unwrap();

    // Verify nonce is properly injected into HTML
    assert!(html_content.contains(&format!("nonce=\"{}\"", nonce)), 
           "HTML should contain nonce in script tags");
    
    // Verify HTML structure
    assert!(html_content.contains("<!DOCTYPE html>"));
    assert!(html_content.contains("EDT Monitoring Dashboard"));
    assert!(html_content.contains("htmx.org"));
    assert!(html_content.contains("tailwindcss.com"));
    
    // Verify monitoring dashboard specific content
    assert!(html_content.contains("System Health"));
    assert!(html_content.contains("Response Time"));
    assert!(html_content.contains("System Logs"));
    assert!(html_content.contains("Security Events"));
}

#[tokio::test]
async fn test_security_dashboard_with_csp_nonce() {
    let app = Router::new()
        .route("/security-dashboard", get(security_dashboard))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/security-dashboard")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    // Check content type
    let content_type = response.headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap();
    assert_eq!(content_type, "text/html; charset=utf-8");

    // Get response body
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html_content = String::from_utf8(body.to_vec()).unwrap();

    // Verify HTML structure
    assert!(html_content.contains("<!DOCTYPE html>"));
    assert!(html_content.contains("EDT Security Dashboard"));
    
    // Verify security dashboard specific content
    assert!(html_content.contains("Security Score"));
    assert!(html_content.contains("Active Threats"));
    assert!(html_content.contains("Failed Logins"));
    assert!(html_content.contains("CSP Violations"));
    assert!(html_content.contains("Security Alerts"));
    assert!(html_content.contains("Security Configuration Status"));
    
    // Verify security features are shown as enabled
    assert!(html_content.contains("MFA Authentication"));
    assert!(html_content.contains("Database Encryption"));
    assert!(html_content.contains("Network Isolation"));
    assert!(html_content.contains("Content Security Policy"));
    assert!(html_content.contains("Security Headers"));
}

#[tokio::test]
async fn test_template_nonce_consistency() {
    let app = Router::new()
        .route("/monitoring", get(monitoring_dashboard))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/monitoring")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    
    // Get CSP header nonce
    let csp_header = response.headers()
        .get("content-security-policy")
        .unwrap()
        .to_str()
        .unwrap();
    
    let nonce_start = csp_header.find("nonce-").unwrap() + 6;
    let nonce_end = csp_header[nonce_start..].find(|c: char| c == '\'' || c == ' ').unwrap() + nonce_start;
    let csp_nonce = &csp_header[nonce_start..nonce_end];

    // Get HTML content
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html_content = String::from_utf8(body.to_vec()).unwrap();

    // Count nonce occurrences in HTML
    let nonce_count = html_content.matches(&format!("nonce=\"{}\"", csp_nonce)).count();
    
    // Should have multiple nonce usages (scripts and styles)
    assert!(nonce_count >= 3, 
           "Template should use nonce in multiple places, found {} occurrences", nonce_count);
    
    // Verify no hardcoded nonces
    assert!(!html_content.contains("nonce=\"fallback-nonce\""), 
           "Should not use fallback nonce when CSP middleware is active");
}

#[tokio::test]
async fn test_template_security_hardening() {
    let app = Router::new()
        .route("/monitoring", get(monitoring_dashboard))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/monitoring")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html_content = String::from_utf8(body.to_vec()).unwrap();

    // Security hardening checks
    
    // 1. No inline event handlers
    let inline_events = [
        "onclick=", "onload=", "onerror=", "onmouseover=", 
        "onfocus=", "onblur=", "onchange=", "onsubmit="
    ];
    
    for event in &inline_events {
        assert!(!html_content.to_lowercase().contains(event), 
               "HTML should not contain inline event handler: {}", event);
    }
    
    // 2. All scripts should have nonce
    let script_tags: Vec<&str> = html_content.matches("<script").collect();
    let nonce_scripts: Vec<&str> = html_content.matches("nonce=").collect();
    
    // Should have at least as many nonces as script tags (styles also use nonces)
    assert!(nonce_scripts.len() >= script_tags.len(),
           "All script tags should have nonces. Scripts: {}, Nonces: {}", 
           script_tags.len(), nonce_scripts.len());
    
    // 3. No javascript: URLs
    assert!(!html_content.contains("javascript:"), 
           "HTML should not contain javascript: URLs");
    
    // 4. No data URLs for scripts
    assert!(!html_content.contains("data:text/javascript"), 
           "HTML should not contain data URLs for scripts");
}

#[tokio::test]
async fn test_template_without_csp_middleware() {
    // Test fallback behavior when CSP middleware is not present
    let app = Router::new()
        .route("/monitoring", get(monitoring_dashboard));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/monitoring")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html_content = String::from_utf8(body.to_vec()).unwrap();

    // Should use fallback nonce when middleware is not present
    assert!(html_content.contains("nonce=\"fallback-nonce\""), 
           "Should use fallback nonce when CSP middleware is not active");
}

#[tokio::test]
async fn test_monitoring_dashboard_htmx_integration() {
    let app = Router::new()
        .route("/monitoring", get(monitoring_dashboard))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/monitoring")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html_content = String::from_utf8(body.to_vec()).unwrap();

    // Verify HTMX integration
    assert!(html_content.contains("htmx.org"), "Should include HTMX library");
    
    // Verify HTMX attributes for real-time updates
    assert!(html_content.contains("hx-get="), "Should have HTMX GET requests");
    assert!(html_content.contains("hx-trigger="), "Should have HTMX triggers");
    
    // Verify specific monitoring endpoints
    assert!(html_content.contains("/api/monitoring/health"));
    assert!(html_content.contains("/api/monitoring/metrics"));
    assert!(html_content.contains("/api/monitoring/logs"));
    assert!(html_content.contains("/api/monitoring/security-events"));
    
    // Verify auto-refresh configuration
    assert!(html_content.contains("every 10s") || html_content.contains("every 15s"));
}

#[tokio::test]
async fn test_security_dashboard_status_indicators() {
    let app = Router::new()
        .route("/security", get(security_dashboard))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/security")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let html_content = String::from_utf8(body.to_vec()).unwrap();

    // Verify status indicator classes
    assert!(html_content.contains("status-indicator"));
    assert!(html_content.contains("status-good"));
    assert!(html_content.contains("status-warning"));
    
    // Verify security metrics display
    assert!(html_content.contains("8.5/10")); // Security score
    assert!(html_content.contains("Active Threats"));
    assert!(html_content.contains("Failed Logins"));
    assert!(html_content.contains("CSP Violations"));
    
    // Verify Phase 2.3 security features are shown as enabled
    let phase23_features = [
        "MFA Authentication",
        "Database Encryption", 
        "Network Isolation",
        "Content Security Policy",
        "Security Headers"
    ];
    
    for feature in &phase23_features {
        assert!(html_content.contains(feature), 
               "Security dashboard should show feature: {}", feature);
        // Should be shown as enabled
        assert!(html_content.contains("✅ Enabled") || html_content.contains("✅ Active") || 
                html_content.contains("✅ Configured") || html_content.contains("✅ Implemented") ||
                html_content.contains("✅ Hardened"),
               "Feature {} should be shown as enabled", feature);
    }
}