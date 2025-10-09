#![allow(dead_code)]
use axum::{
    body::Body,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use include_dir::{include_dir, Dir};
use mime_guess::from_path;

// Embed static files at compile time
static STATIC_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/static");

/// Serve static files from the embedded directory
pub async fn serve_static(path: &str) -> impl IntoResponse {
    let path = path.trim_start_matches('/');

    match STATIC_DIR.get_file(path) {
        Some(file) => {
            let mime_type = from_path(path).first_or_octet_stream();

            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime_type.as_ref())
                // Add security headers
                .header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")
                .header(header::X_FRAME_OPTIONS, "SAMEORIGIN")
                .header(header::REFERRER_POLICY, "strict-origin-when-cross-origin")
                .body(Body::from(file.contents().to_vec()))
                .unwrap()
        }
        None => {
            // File not found
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("404 Not Found"))
                .unwrap()
        }
    }
}
