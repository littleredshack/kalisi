use axum::{
    http::StatusCode,
    middleware as axum_middleware,
    routing::{delete, get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::{compression::CompressionLayer, cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod crypto;
mod csp_angular_fix;
mod csp_nonce_styles_simple;
mod csp_styles;
mod database;
mod handlers;
mod logging;
mod mfa_simple;
mod middleware;
mod runtime;
// mod secure_config;
mod email;
mod security_metrics;
mod state;
mod static_files;
mod storage;
mod websocket;
// mod validation;
// mod vault;

#[cfg(test)]
mod test_helpers;

use crate::state::AppState;

// Serve Angular build assets with proper headers
#[allow(dead_code)]
async fn serve_angular_asset(filename: &str) -> axum::response::Response<axum::body::Body> {
    // Inside Docker container, the project is mounted at /app
    let file_path = format!("dist/frontend/browser/{}", filename);

    match tokio::fs::read(&file_path).await {
        Ok(contents) => {
            let (content_type, cache_control) = match filename.split('.').last() {
                Some("js") => (
                    "application/javascript",
                    "public, max-age=31536000, immutable",
                ),
                Some("css") => ("text/css", "public, max-age=31536000, immutable"),
                Some("ico") => ("image/x-icon", "public, max-age=86400"),
                _ => ("application/octet-stream", "public, max-age=3600"),
            };

            axum::response::Response::builder()
                .header("content-type", content_type)
                .header("cache-control", cache_control)
                .header("access-control-allow-origin", "*")
                .status(StatusCode::OK)
                .body(axum::body::Body::from(contents))
                .unwrap()
        }
        Err(e) => {
            tracing::error!("Failed to serve asset {}: {}", filename, e);
            axum::response::Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header("content-type", "text/plain")
                .body(axum::body::Body::from(format!(
                    "File not found: {}",
                    filename
                )))
                .unwrap()
        }
    }
}

// Individual asset handlers
#[allow(dead_code)]
async fn serve_main_js() -> axum::response::Response<axum::body::Body> {
    serve_angular_asset("main-XLWHOHBM.js").await
}

#[allow(dead_code)]
async fn serve_polyfills_js() -> axum::response::Response<axum::body::Body> {
    serve_angular_asset("polyfills-FFHMD2TL.js").await
}

#[allow(dead_code)]
async fn serve_styles_css() -> axum::response::Response<axum::body::Body> {
    serve_angular_asset("styles-IKLLN2TE.css").await
}

#[allow(dead_code)]
async fn serve_favicon() -> axum::response::Response<axum::body::Body> {
    serve_angular_asset("favicon.ico").await
}

use crate::middleware::{
    auth_middleware,
    csp_report_handler,
    // build_cors_layer,
    // content_type_validation,
    // request_size_limit,
    // https_redirect,
    // rate_limit_middleware,
    // IpRateLimiter,
    // DDoSProtection,
    error_logging_middleware,
    logging_middleware,
    security_headers_middleware,
};

use axum_server::tls_rustls::RustlsConfig;
use std::path::PathBuf;

fn main() -> anyhow::Result<()> {
    // Initialize rustls crypto provider before tokio runtime
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    // Now start the tokio runtime
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async_main())
}

async fn async_main() -> anyhow::Result<()> {
    // Initialize tracing
    println!("🔧 About to initialize tracing...");

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "kalisi_gateway::handlers::redis_spa_bridge=debug,kalisi_gateway=warn,tower_http=warn".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    println!("✅ Tracing initialized");

    info!("🔧 Starting async_main...");

    // Load configuration from .env file (search up directory tree)
    info!("🔧 Loading dotenv...");
    dotenv::dotenv().ok();
    info!("🔧 Parsing config...");
    let config = config::Config::from_env()?;
    info!("✅ Config loaded successfully");

    // Initialize application state
    info!("🔧 Initializing AppState...");
    let state = AppState::new(config).await?;
    info!("✅ AppState initialized successfully");

    // Public routes
    #[allow(unused_mut)]
    let mut public_routes = Router::new()
        // Root page (SPA) - now serves the unified single page application
        .route("/", get(handlers::spa::spa_page))
        // Authentication routes
        .route("/auth/request-otp", post(handlers::auth::request_otp))
        .route("/auth/verify-otp", post(handlers::auth::verify_otp))
        .route("/auth/direct-login", post(handlers::auth::direct_login))
        .route(
            "/auth/complete-mfa",
            post(handlers::mfa_simple::complete_mfa_login),
        )
        // WebSocket for real-time updates (includes log streaming)
        .route("/ws", get(crate::websocket::websocket_handler))
        // Pure SPA Redis bridge (no HTTP APIs)
        .route(
            "/redis-ws",
            get(handlers::redis_spa_bridge::redis_spa_bridge),
        )
        // Static files for auth pages
        .route(
            "/clear-storage.html",
            get(|| async { static_files::serve_static("clear-storage.html").await }),
        )
        .route("/mfa-setup", get(handlers::templates::mfa_setup_page))
        .route("/mfa-setup.html", get(handlers::templates::mfa_setup_page)) // Keep for backward compatibility
        .route(
            "/mfa-verify.html",
            get(|| async { static_files::serve_static("mfa-verify.html").await }),
        )
        .route("/mfa-reset", get(handlers::templates::mfa_reset_page))
        // Template-based pages with CSP nonce support (Phase 2.3)
        // Unified SPA interface
        .route("/app", get(handlers::spa::spa_page))
        .route("/api/spa/config", get(handlers::spa::get_spa_config))
        // CSP violation reporting endpoint
        .route("/csp-report", post(csp_report_handler))
        // Chat removed - pure SPA uses Redis directly
        // FR-027 ChatGPT API proxy (anonymous access)
        .route(
            "/api/v1/chat/gpt",
            post(handlers::chatgpt::handle_chat_request),
        )
        // FR-027 Unified Cypher endpoint - THE ONLY Cypher endpoint for entire app
        .route(
            "/v0/cypher/unified",
            post(handlers::cypher_unified::execute_unified_cypher),
        )
        .route(
            "/runtime/canvas/data",
            post(handlers::runtime::fetch_canvas_data),
        );

    // Add development-only routes
    #[cfg(debug_assertions)]
    {
        public_routes = public_routes
            .route(
                "/api/csp/collect-styles",
                post(handlers::csp::collect_styles),
            )
            .route(
                "/api/csp/export-hashes",
                get(handlers::csp::export_style_hashes),
            )
            .route("/api/csp/stats", get(handlers::csp::get_csp_stats));
    }

    // MFA routes with partial authentication (for MFA setup flow)
    let partial_auth_routes = Router::new()
        .route(
            "/auth/mfa/setup",
            post(handlers::mfa_simple_partial::setup_mfa_partial),
        )
        .route(
            "/auth/mfa/enable",
            post(handlers::mfa_simple_partial::enable_mfa_partial),
        )
        .route("/auth/mfa/verify", post(handlers::mfa_simple::verify_mfa))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::partial_auth_middleware,
        ));

    // V2 Authentication routes (redesigned flow)
    let auth_v2_public_routes = Router::new()
        .route("/v2/auth/login", post(handlers::auth_v2::login))
        .route("/v2/auth/register", post(handlers::auth_v2::register))
        .route("/v2/auth/time", get(handlers::auth_v2::time_sync))
        .route(
            "/v2/auth/mfa/reset/confirm",
            post(handlers::auth_v2::mfa_reset_confirm),
        );

    let auth_v2_partial_routes = Router::new()
        .route("/v2/auth/mfa/status", get(handlers::auth_v2::mfa_status))
        .route("/v2/auth/mfa/reset", post(handlers::auth_v2::mfa_reset))
        .route(
            "/v2/auth/mfa/reset/request",
            post(handlers::auth_v2::mfa_reset_request),
        )
        .route(
            "/v2/auth/mfa/setup/init",
            post(handlers::auth_v2::mfa_setup_init),
        )
        .route(
            "/v2/auth/mfa/setup/complete",
            post(handlers::auth_v2::mfa_setup_complete),
        )
        .route("/v2/auth/mfa/verify", post(handlers::auth_v2::mfa_verify))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::partial_auth_middleware,
        ));

    // Protected routes
    let protected_routes = Router::new()
        .route("/auth/logout", post(handlers::auth::logout))
        .route("/auth/profile", get(handlers::auth::get_profile))
        // MFA routes (for authenticated users)
        // Note: /auth/mfa/setup, /auth/mfa/enable, and /auth/mfa/verify are handled by partial_auth_routes
        .route(
            "/auth/mfa/status",
            get(handlers::mfa_simple::get_mfa_status),
        )
        // Dashboard removed completely
        // Self-awareness removed completely
        // Security monitoring removed
        // Neo4j routes removed - use unified /v0/cypher/unified endpoint
        // User management API routes (V2)
        .route("/v2/user/profile", get(handlers::user::get_profile))
        .route("/v2/user/profile", post(handlers::user::update_profile))
        .route("/v2/user/account", get(handlers::user::get_account_info))
        .route("/v2/user/account", delete(handlers::user::delete_account))
        .route("/v2/user/settings", get(handlers::user::get_settings))
        .route("/v2/user/settings", post(handlers::user::update_settings))
        // ViewNode functionality uses existing /v0/cypher/unified endpoint (FR-030)
        // Logging API routes (read-only for financial services compliance)
        .route("/api/logs", get(handlers::logs::get_logs))
        .route("/api/logs/stats", get(handlers::logs::get_log_stats))
        .route("/api/logs/clear", post(handlers::logs::clear_old_logs))
        // Add auth middleware to all protected routes
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    // Build main application routes with full middleware stack
    let main_app = Router::new()
        // Merge all routes
        .merge(public_routes)
        .merge(partial_auth_routes)
        .merge(auth_v2_public_routes)
        .merge(auth_v2_partial_routes)
        .merge(protected_routes)
        // Add fallback that handles both static files and SPA routing
        .fallback(handlers::static_files::handle_static_file)
        // Add state
        .with_state(state.clone())
        // Add security headers middleware (Phase 2.3 - applied first for security)
        .layer(axum_middleware::from_fn(security_headers_middleware))
        // Add logging middleware
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            logging_middleware,
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            error_logging_middleware,
        ))
        // Add basic CORS for development (simplified)
        .layer(CorsLayer::permissive())
        // Add compression and tracing
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http());

    // The app is just main_app now (static assets are included)
    let app = main_app;

    // Start server
    let port = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
        .parse::<u16>()
        .unwrap_or(8080);
    let bind_address = std::env::var("BIND_ADDRESS").unwrap_or_else(|_| "0.0.0.0".to_string());
    let enable_https =
        std::env::var("ENABLE_HTTPS").unwrap_or_else(|_| "false".to_string()) == "true";
    let https_port = std::env::var("HTTPS_PORT")
        .unwrap_or_else(|_| "443".to_string())
        .parse::<u16>()
        .unwrap_or(443);

    if enable_https {
        // Check if certificates exist - use the valid Let's Encrypt certificates
        let cert_path = PathBuf::from("certs/fullchain.pem");
        let key_path = PathBuf::from("certs/privkey.pem");

        if cert_path.exists() && key_path.exists() {
            info!("🔐 HTTPS enabled, loading certificates...");

            // Load certificates
            let config = RustlsConfig::from_pem_file(cert_path, key_path).await?;

            // Start both HTTP and HTTPS servers
            let http_addr = format!("{}:{}", bind_address, port);
            let https_addr = format!("{}:{}", bind_address, https_port);

            info!("🚀 Kalisi Gateway starting:");
            info!("   HTTP:  http://{}", http_addr);
            info!("   HTTPS: https://{}", https_addr);

            // Spawn HTTP server
            let http_app = app.clone();
            tokio::spawn(async move {
                let listener = tokio::net::TcpListener::bind(&http_addr).await.unwrap();
                axum::serve(listener, http_app).await.unwrap();
            });

            // Run HTTPS server
            let https_socket_addr: SocketAddr = https_addr.parse()?;
            info!("🔐 Binding HTTPS to {}", https_socket_addr);

            match axum_server::bind_rustls(https_socket_addr, config)
                .serve(app.into_make_service_with_connect_info::<SocketAddr>())
                .await
            {
                Ok(_) => info!("✅ HTTPS server completed"),
                Err(e) => {
                    error!("❌ HTTPS server failed: {}", e);
                    return Err(e.into());
                }
            }
        } else {
            info!("⚠️  HTTPS enabled but certificates not found at certs/server.crt and certs/server.key");
            info!("   Run ./generate-certs.sh to create self-signed certificates");
            info!("   Starting HTTP only...");

            let addr = SocketAddr::from(([0, 0, 0, 0], port));
            info!("🚀 Kalisi Gateway (HTTP only) listening on {}", addr);

            let listener = tokio::net::TcpListener::bind(addr).await?;
            axum::serve(listener, app).await?;
        }
    } else {
        // HTTP only
        let addr: SocketAddr = format!("{}:{}", bind_address, port).parse()?;
        info!("🚀 Kalisi Gateway (HTTP) listening on {}", addr);

        let listener = tokio::net::TcpListener::bind(addr).await?;
        axum::serve(listener, app).await?;
    }

    Ok(())
}
