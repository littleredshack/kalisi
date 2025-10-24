use axum::{
    body::Body,
    extract::Request,
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use once_cell::sync::Lazy;
use std::path::PathBuf;

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

/// Get MIME type from file extension
fn get_mime_type(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("");
    match ext.to_lowercase().as_str() {
        "js" | "mjs" => "application/javascript",
        "css" => "text/css",
        "html" => "text/html",
        "json" => "application/json",
        "wasm" => "application/wasm",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
}

/// Proxy request to Angular dev server
async fn proxy_to_angular_dev_server(uri: Uri) -> impl IntoResponse {
    let dev_server_url = ANGULAR_DEV_SERVER
        .as_ref()
        .expect("ANGULAR_DEV_SERVER not set");
    let path = uri.path();
    let query = uri.query().map(|q| format!("?{}", q)).unwrap_or_default();
    let url = format!("{}{}{}", dev_server_url, path, query);

    tracing::debug!("Proxying to Angular dev server: {}", url);

    match reqwest::get(&url).await {
        Ok(response) => {
            let status_code = response.status().as_u16();
            let mut builder = Response::builder().status(status_code);

            // Copy relevant headers
            for (name, value) in response.headers() {
                if name != "content-encoding" && name != "transfer-encoding" {
                    if let Ok(value_str) = value.to_str() {
                        builder = builder.header(name.as_str(), value_str);
                    }
                }
            }

            match response.bytes().await {
                Ok(bytes) => builder.body(Body::from(bytes)).unwrap().into_response(),
                Err(e) => {
                    tracing::error!("Failed to read response body from dev server: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read response").into_response()
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to proxy to Angular dev server: {}", e);
            (StatusCode::BAD_GATEWAY, "Angular dev server not available").into_response()
        }
    }
}

/// Handle static file requests that don't match specific routes
pub async fn handle_static_file(uri: Uri, req: Request) -> impl IntoResponse {
    let path = uri.path();

    // If Angular dev server is configured, proxy all requests to it
    if ANGULAR_DEV_SERVER.is_some() {
        // Strip query parameters for file path checking
        let path_without_query = path.split('?').next().unwrap_or(path);

        // Check if this looks like a static file (has extension)
        if !path_without_query.contains('.') || path_without_query.ends_with('/') {
            // Not a static file, let it fall through to SPA handler
            return crate::handlers::spa::spa_page(req).await.into_response();
        }

        // Proxy to Angular dev server
        return proxy_to_angular_dev_server(uri).await.into_response();
    }

    // Fallback to serving from filesystem (production mode)
    let path_without_query = path.split('?').next().unwrap_or(path);

    // Check if this looks like a static file (has extension)
    if !path_without_query.contains('.') || path_without_query.ends_with('/') {
        // Not a static file, let it fall through to SPA handler
        return crate::handlers::spa::spa_page(req).await.into_response();
    }

    // Determine base directory based on path (use path without query parameters)
    let (base_dir, file_path) = if let Some(stripped) = path_without_query.strip_prefix("/assets/") {
        ("frontend/dist/assets", stripped)
    } else if let Some(stripped) = path_without_query.strip_prefix("/lib/") {
        ("frontend/dist/lib", stripped)
    } else {
        // Root-level files (main.js, styles.css, etc.)
        ("frontend/dist", &path_without_query[1..])
    };

    let full_path = PathBuf::from(base_dir).join(file_path);

    // Security: Prevent path traversal
    if file_path.contains("..") {
        return (StatusCode::FORBIDDEN, "Invalid path").into_response();
    }

    // Try to read the file
    match tokio::fs::read(&full_path).await {
        Ok(contents) => {
            let mime_type = get_mime_type(file_path);

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime_type)
                .header(
                    header::CACHE_CONTROL,
                    if file_path.contains('-')
                        && (file_path.ends_with(".js") || file_path.ends_with(".css"))
                    {
                        "public, max-age=31536000, immutable"
                    } else if file_path.ends_with(".wasm") {
                        // Force WASM files to bypass cache for development/debugging
                        "no-cache, no-store, must-revalidate, max-age=0"
                    } else {
                        "no-cache, must-revalidate"
                    },
                )
                .body(contents.into())
                .unwrap()
        }
        Err(_) => {
            // File not found, fall back to SPA handler for client-side routing
            crate::handlers::spa::spa_page(req).await.into_response()
        }
    }
}
