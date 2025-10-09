use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
    middleware::from_fn,
    response::Response,
    routing::get,
    Router,
};
use tower::ServiceExt;

use edt_api_gateway::middleware::security_headers::{
    csp_report_handler, security_headers_middleware, CspNonce,
};

#[tokio::test]
async fn test_security_headers_applied() {
    let app = Router::new()
        .route("/test", get(|| async { "test response" }))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    let headers = response.headers();

    // Test Content Security Policy header
    assert!(headers.contains_key("content-security-policy"));
    let csp = headers
        .get("content-security-policy")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(csp.contains("default-src 'self'"));
    assert!(!csp.contains("unsafe-inline")); // Should not contain unsafe directives
    assert!(!csp.contains("unsafe-eval")); // Should not contain unsafe directives
    assert!(csp.contains("nonce-")); // Should contain nonce

    // Test HSTS header
    assert!(headers.contains_key("strict-transport-security"));
    let hsts = headers
        .get("strict-transport-security")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(hsts.contains("max-age=31536000"));
    assert!(hsts.contains("includeSubDomains"));

    // Test X-Frame-Options
    assert!(headers.contains_key("x-frame-options"));
    assert_eq!(headers.get("x-frame-options").unwrap(), "DENY");

    // Test X-Content-Type-Options
    assert!(headers.contains_key("x-content-type-options"));
    assert_eq!(headers.get("x-content-type-options").unwrap(), "nosniff");

    // Test Referrer Policy
    assert!(headers.contains_key("referrer-policy"));
    assert_eq!(
        headers.get("referrer-policy").unwrap(),
        "strict-origin-when-cross-origin"
    );

    // Test Permissions Policy
    assert!(headers.contains_key("permissions-policy"));
    let permissions = headers.get("permissions-policy").unwrap().to_str().unwrap();
    assert!(permissions.contains("camera=()"));
    assert!(permissions.contains("microphone=()"));
    assert!(permissions.contains("geolocation=()"));

    // Test Cross-Origin headers
    assert!(headers.contains_key("cross-origin-embedder-policy"));
    assert!(headers.contains_key("cross-origin-opener-policy"));
    assert!(headers.contains_key("cross-origin-resource-policy"));

    // Test server header removal
    assert!(!headers.contains_key("server"));
}

#[tokio::test]
async fn test_csp_nonce_generation() {
    let app = Router::new()
        .route(
            "/test",
            get(|request: Request<Body>| async move {
                let nonce = CspNonce::from_request(&request);
                match nonce {
                    Some(nonce_value) => {
                        assert!(!nonce_value.is_empty());
                        assert!(nonce_value.len() >= 16); // Should be reasonably long
                        format!("nonce: {}", nonce_value)
                    }
                    None => "no nonce found".to_string(),
                }
            }),
        )
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body_str = String::from_utf8(body.to_vec()).unwrap();
    assert!(body_str.starts_with("nonce: "));
    assert!(!body_str.contains("no nonce found"));
}

#[tokio::test]
async fn test_csp_nonce_uniqueness() {
    let app = Router::new()
        .route(
            "/test",
            get(|request: Request<Body>| async move {
                CspNonce::from_request(&request).unwrap_or_else(|| "none".to_string())
            }),
        )
        .layer(from_fn(security_headers_middleware));

    // Make multiple requests and verify nonces are unique
    let mut nonces = Vec::new();

    for _ in 0..5 {
        let request = Request::builder()
            .method(Method::GET)
            .uri("/test")
            .body(Body::empty())
            .unwrap();

        let response = app.clone().oneshot(request).await.unwrap();
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let nonce = String::from_utf8(body.to_vec()).unwrap();

        assert!(
            !nonces.contains(&nonce),
            "Nonce should be unique: {}",
            nonce
        );
        nonces.push(nonce);
    }
}

#[tokio::test]
async fn test_csp_hardened_directives() {
    let app = Router::new()
        .route("/test", get(|| async { "test" }))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    let csp = response
        .headers()
        .get("content-security-policy")
        .unwrap()
        .to_str()
        .unwrap();

    // Test hardened CSP directives
    assert!(csp.contains("default-src 'self'"));
    assert!(csp.contains("object-src 'none'"));
    assert!(csp.contains("base-uri 'self'"));
    assert!(csp.contains("frame-ancestors 'none'"));
    assert!(csp.contains("form-action 'self'"));
    assert!(csp.contains("upgrade-insecure-requests"));
    assert!(csp.contains("block-all-mixed-content"));

    // Ensure no unsafe directives (Phase 2.3 hardening)
    assert!(
        !csp.contains("unsafe-inline"),
        "CSP should not contain unsafe-inline"
    );
    assert!(
        !csp.contains("unsafe-eval"),
        "CSP should not contain unsafe-eval"
    );

    // Should use nonces instead
    assert!(
        csp.contains("nonce-"),
        "CSP should use nonces instead of unsafe directives"
    );
}

#[tokio::test]
async fn test_permissions_policy_restrictive() {
    let app = Router::new()
        .route("/test", get(|| async { "test" }))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    let permissions = response
        .headers()
        .get("permissions-policy")
        .unwrap()
        .to_str()
        .unwrap();

    // Test that sensitive features are disabled
    let sensitive_features = [
        "accelerometer=()",
        "camera=()",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=()",
        "payment=()",
        "usb=()",
        "interest-cohort=()", // Disable FLoC
    ];

    for feature in &sensitive_features {
        assert!(
            permissions.contains(feature),
            "Permissions policy should disable {}",
            feature
        );
    }

    // Test that some features are allowed for self
    assert!(permissions.contains("clipboard-read=(self)"));
    assert!(permissions.contains("clipboard-write=(self)"));
}

#[tokio::test]
async fn test_security_headers_comprehensive_coverage() {
    let app = Router::new()
        .route("/test", get(|| async { "test" }))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    let headers = response.headers();

    // Comprehensive security headers checklist
    let required_headers = [
        "content-security-policy",
        "strict-transport-security",
        "x-frame-options",
        "x-content-type-options",
        "referrer-policy",
        "permissions-policy",
        "x-xss-protection",
        "cross-origin-embedder-policy",
        "cross-origin-opener-policy",
        "cross-origin-resource-policy",
        "x-robots-tag",
    ];

    let mut missing_headers = Vec::new();
    for header_name in &required_headers {
        if !headers.contains_key(*header_name) {
            missing_headers.push(*header_name);
        }
    }

    assert!(
        missing_headers.is_empty(),
        "Missing security headers: {:?}",
        missing_headers
    );
}

#[tokio::test]
async fn test_csp_violation_reporting() {
    use serde_json::json;

    let app = Router::new().route("/csp-report", axum::routing::post(csp_report_handler));

    let violation_report = json!({
        "csp-report": {
            "document-uri": "https://example.com/page",
            "violated-directive": "script-src",
            "blocked-uri": "https://evil.com/script.js",
            "source-file": "https://example.com/page",
            "line-number": 10,
            "column-number": 5
        }
    });

    let request = Request::builder()
        .method(Method::POST)
        .uri("/csp-report")
        .header("content-type", "application/json")
        .body(Body::from(violation_report.to_string()))
        .unwrap();

    let response = app.oneshot(request).await.unwrap();

    // CSP violation reports should return 204 No Content
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn test_security_headers_production_ready() {
    let app = Router::new()
        .route("/test", get(|| async { "production test" }))
        .layer(from_fn(security_headers_middleware));

    let request = Request::builder()
        .method(Method::GET)
        .uri("/test")
        .body(Body::empty())
        .unwrap();

    let response = app.oneshot(request).await.unwrap();
    let headers = response.headers();

    // Production-ready security validation

    // HSTS should have long max-age and include subdomains
    let hsts = headers
        .get("strict-transport-security")
        .unwrap()
        .to_str()
        .unwrap();
    assert!(hsts.contains("max-age=31536000")); // 1 year
    assert!(hsts.contains("includeSubDomains"));
    assert!(hsts.contains("preload"));

    // Frame options should deny all framing
    assert_eq!(headers.get("x-frame-options").unwrap(), "DENY");

    // Referrer policy should be strict
    assert_eq!(
        headers.get("referrer-policy").unwrap(),
        "strict-origin-when-cross-origin"
    );

    // Cross-origin policies should be restrictive
    assert_eq!(
        headers.get("cross-origin-embedder-policy").unwrap(),
        "require-corp"
    );
    assert_eq!(
        headers.get("cross-origin-opener-policy").unwrap(),
        "same-origin"
    );
    assert_eq!(
        headers.get("cross-origin-resource-policy").unwrap(),
        "same-origin"
    );

    // Robots should prevent indexing
    let robots = headers.get("x-robots-tag").unwrap().to_str().unwrap();
    assert!(robots.contains("noindex"));
    assert!(robots.contains("nofollow"));
    assert!(robots.contains("noarchive"));
    assert!(robots.contains("nosnippet"));
}
