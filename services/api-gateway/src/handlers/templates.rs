use axum::{
    extract::Request,
    http::HeaderValue,
    response::{Html, IntoResponse},
};
use crate::middleware::security_headers::CspNonce;

/// Serve MFA setup page with CSP nonce injection
pub async fn mfa_setup_page(request: Request) -> impl IntoResponse {
    let nonce = CspNonce::from_request(&request).unwrap_or_else(|| "fallback-nonce".to_string());
    
    let html_content = generate_mfa_setup_html(&nonce);
    
    let mut response = Html(html_content).into_response();
    
    // Set content type explicitly
    response.headers_mut().insert(
        "content-type",
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    
    response
}

/// Serve MFA reset page with CSP nonce injection
pub async fn mfa_reset_page(request: Request) -> impl IntoResponse {
    let nonce = CspNonce::from_request(&request).unwrap_or_else(|| "fallback-nonce".to_string());
    
    let html_content = generate_mfa_reset_html(&nonce);
    
    let mut response = Html(html_content).into_response();
    
    // Set content type explicitly
    response.headers_mut().insert(
        "content-type",
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    
    response
}

// All dashboard functionality removed - only MFA templates remain

fn generate_mfa_setup_html(nonce: &str) -> String {
    format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MFA Setup - EDT System</title>
    <style nonce="{}">
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
        .container {{ max-width: 400px; margin: 2rem auto; padding: 2rem; }}
        .form-group {{ margin-bottom: 1rem; }}
        label {{ display: block; margin-bottom: 0.5rem; font-weight: 600; }}
        input {{ width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; }}
        button {{ background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.375rem; cursor: pointer; }}
        button:hover {{ background: #2563eb; }}
        .qr-code {{ text-align: center; margin: 1rem 0; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Set Up Multi-Factor Authentication</h1>
        <div id="mfa-setup-form">
            <!-- MFA setup content will be loaded here -->
        </div>
    </div>
</body>
</html>"#, nonce)
}

fn generate_mfa_reset_html(nonce: &str) -> String {
    format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MFA Reset - EDT System</title>
    <style nonce="{}">
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
        .container {{ max-width: 400px; margin: 2rem auto; padding: 2rem; }}
        .form-group {{ margin-bottom: 1rem; }}
        label {{ display: block; margin-bottom: 0.5rem; font-weight: 600; }}
        input {{ width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; }}
        button {{ background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.375rem; cursor: pointer; }}
        button:hover {{ background: #2563eb; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Reset Multi-Factor Authentication</h1>
        <div id="mfa-reset-form">
            <!-- MFA reset content will be loaded here -->
        </div>
    </div>
</body>
</html>"#, nonce)
}