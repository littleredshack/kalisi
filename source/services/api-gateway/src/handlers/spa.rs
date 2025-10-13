use crate::handlers::CspNonce;
use axum::{
    extract::Request,
    http::{HeaderValue, StatusCode},
    response::{Html, IntoResponse},
    Json,
};
use once_cell::sync::Lazy;
use serde_json::json;

// Angular dev server URL - change this when switching between dev and production
static ANGULAR_DEV_SERVER: Lazy<Option<String>> =
    Lazy::new(|| match std::env::var("ANGULAR_DEV_PROXY") {
        Ok(val) if val.eq_ignore_ascii_case("true") => {
            tracing::info!("Angular dev proxy enabled via env");
            Some("http://localhost:4200".to_string())
        }
        Ok(val) => {
            tracing::info!("Angular dev proxy disabled via env: {}", val);
            None
        }
        Err(_) => None,
    });

/// Main SPA handler that serves the Angular application
pub async fn spa_page(request: Request) -> impl IntoResponse {
    // If Angular dev server is configured, proxy to it
    if let Some(dev_server_url) = ANGULAR_DEV_SERVER.as_ref() {
        tracing::debug!("Proxying SPA request to Angular dev server");

        match reqwest::get(dev_server_url).await {
            Ok(response) => {
                match response.text().await {
                    Ok(html) => {
                        // Get nonce for CSP
                        let nonce = CspNonce::from_request(&request)
                            .unwrap_or_else(|| "fallback-nonce".to_string());

                        // Inject CSP nonce into the HTML
                        let html_content = inject_csp_nonce_into_angular_html(html, &nonce);

                        let mut response = Html(html_content).into_response();
                        response.headers_mut().insert(
                            "content-type",
                            HeaderValue::from_static("text/html; charset=utf-8"),
                        );
                        return response;
                    }
                    Err(e) => {
                        tracing::error!("Failed to read HTML from dev server: {}", e);
                        return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read response")
                            .into_response();
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to proxy to Angular dev server: {}", e);
                return (StatusCode::BAD_GATEWAY, "Angular dev server not available")
                    .into_response();
            }
        }
    }

    // Fallback to serving from filesystem (production mode)
    let nonce = CspNonce::from_request(&request).unwrap_or_else(|| "fallback-nonce".to_string());

    // Try to read the Angular build index.html file (Docker container paths)
    let angular_paths = [
        "/app/frontend/dist/index.html",
        "frontend/dist/index.html",
        "../frontend/dist/index.html",
        "/home/devuser/edt2/frontend/dist/index.html",
    ];

    let mut html_content = None;
    for path in &angular_paths {
        if let Ok(content) = tokio::fs::read_to_string(path).await {
            html_content = Some(content);
            tracing::info!("Successfully loaded Angular SPA from: {}", path);
            break;
        } else {
            tracing::debug!("Angular not found at: {}", path);
        }
    }

    let html_content = html_content.unwrap_or_else(|| {
        tracing::error!("Angular SPA not found and no fallback available");
        "<html><body><h1>Error: Angular application not found</h1></body></html>".to_string()
    });

    // Inject nonce into Angular inline styles for CSP compatibility and rewrite asset paths
    let html_content = inject_csp_nonce_into_angular_html(html_content, &nonce);

    let mut response = Html(html_content).into_response();

    // Set content type explicitly
    response.headers_mut().insert(
        "content-type",
        HeaderValue::from_static("text/html; charset=utf-8"),
    );

    response
}

/// Inject CSP nonce into Angular HTML and add style proxy
fn inject_csp_nonce_into_angular_html(html: String, nonce: &str) -> String {
    // Add nonce to all <script> tags (both inline and external)
    let mut html = html.replace("<script ", &format!("<script nonce=\"{}\" ", nonce));
    html = html.replace("<script>", &format!("<script nonce=\"{}\">", nonce));

    // Add nonce to all <style> tags
    html = html.replace("<style ", &format!("<style nonce=\"{}\" ", nonce));
    html = html.replace("<style>", &format!("<style nonce=\"{}\">", nonce));

    // Use the comprehensive Angular CSP fix
    let angular_fix = crate::csp_angular_fix::generate_angular_csp_fix_script(nonce);

    // Insert fix script as the VERY FIRST thing in head, before anything else
    // This ensures all overrides are in place before Angular loads
    html = html.replace("<head>", &format!("<head>\n{}", angular_fix));

    // Debug: Log original HTML snippet to see what we're working with
    tracing::info!(
        "Original HTML snippet: {}",
        &html[html.len().saturating_sub(200)..]
    );

    // Don't rewrite paths - Angular files are served from root
    // The JS/CSS files are in the root of the dist folder, not in /assets/
    tracing::debug!("Serving Angular files from root path without rewriting");

    html
}

/// SPA-specific API routes for dynamic content loading
pub async fn get_spa_config() -> Json<serde_json::Value> {
    Json(json!({
        "features": {
            "monitoring": true,
            "security": true,
            "graph": true,
            "logs": true,
            "mfa": true
        },
        "refresh_intervals": {
            "health": 10000,
            "metrics": 15000,
            "logs": 30000,
            "activity": 30000,
            "security_events": 20000
        },
        "api_endpoints": {
            "auth": {
                "login": "/auth/direct-login",
                "mfa_setup": "/auth/mfa/setup",
                "mfa_enable": "/auth/mfa/enable",
                "mfa_verify": "/auth/mfa/verify",
                "logout": "/auth/logout",
                "profile": "/auth/profile"
            },
            "dashboard": {
                "stats": "/api/dashboard/stats",
                "activity": "/api/dashboard/activity",
                "health": "/api/dashboard/health"
            },
            "monitoring": {
                "health": "/api/monitoring/health",
                "logs": "/api/monitoring/logs",
                "metrics": "/api/monitoring/metrics",
                "security_events": "/api/monitoring/security-events"
            },
            "security": {
                "dashboard": "/api/security/dashboard",
                "events": "/api/security/events"
            },
            "graph": {
                "data": "/api/self-awareness/graph",
                "overview": "/api/self-awareness/overview"
            }
        }
    }))
}
