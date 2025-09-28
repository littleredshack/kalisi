use axum::{
    extract::Request,
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use std::path::PathBuf;

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

/// Handle static file requests that don't match specific routes
pub async fn handle_static_file(uri: Uri, req: Request) -> impl IntoResponse {
    let path = uri.path();
    
    // Strip query parameters for file path checking
    let path_without_query = path.split('?').next().unwrap_or(path);
    
    // Check if this looks like a static file (has extension)
    if !path_without_query.contains('.') || path_without_query.ends_with('/') {
        // Not a static file, let it fall through to SPA handler
        return crate::handlers::spa::spa_page(req).await.into_response();
    }
    
    // Determine base directory based on path (use path without query parameters)
    let (base_dir, file_path) = if path_without_query.starts_with("/assets/") {
        ("frontend/dist/assets", &path_without_query[8..])
    } else if path_without_query.starts_with("/lib/") {
        ("frontend/dist/lib", &path_without_query[5..])
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
                    if file_path.contains('-') && (file_path.ends_with(".js") || file_path.ends_with(".css")) {
                        "public, max-age=31536000, immutable"
                    } else if file_path.ends_with(".wasm") {
                        // Force WASM files to bypass cache for development/debugging
                        "no-cache, no-store, must-revalidate, max-age=0"
                    } else {
                        "no-cache, must-revalidate"
                    }
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