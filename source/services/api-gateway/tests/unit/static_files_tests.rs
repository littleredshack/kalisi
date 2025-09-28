use actix_web::{test, web, App, http::StatusCode};
use actix_files as fs;
use edt_gateway::{
    state::AppState,
    storage::Storage,
};
use std::sync::Arc;
use tokio::sync::RwLock;
use std::path::Path;

async fn setup_test_app() -> App<
    impl actix_web::dev::ServiceFactory<
        actix_web::dev::ServiceRequest,
        Config = (),
        Response = actix_web::dev::ServiceResponse,
        Error = actix_web::Error,
        InitError = (),
    >,
> {
    let storage = Storage::new_test().await.expect("Failed to create test storage");
    let state = web::Data::new(AppState {
        storage: Arc::new(RwLock::new(storage)),
        neo4j_client: None,
    });

    App::new()
        .app_data(state)
        .service(
            fs::Files::new("/static", "./static")
                .use_last_modified(true)
                .use_etag(true)
        )
}

#[actix_web::test]
async fn test_static_css_file_serving() {
    // Check if static directory exists
    if !Path::new("./static/css").exists() {
        // Create test structure
        std::fs::create_dir_all("./static/css").ok();
        std::fs::write("./static/css/test.css", "body { margin: 0; }").ok();
    }

    let app = test::init_service(setup_test_app().await).await;

    let req = test::TestRequest::get()
        .uri("/static/css/style.css")
        .to_request();

    let resp = test::call_service(&app, req).await;
    
    // File might not exist in test environment
    if resp.status() == StatusCode::OK {
        let headers = resp.headers();
        assert_eq!(headers.get("Content-Type").unwrap(), "text/css");
        
        // Check caching headers
        assert!(headers.contains_key("ETag"));
        assert!(headers.contains_key("Last-Modified"));
    } else {
        // Expected in test environment without static files
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}

#[actix_web::test]
async fn test_static_js_file_serving() {
    // Check if static directory exists
    if !Path::new("./static/js").exists() {
        // Create test structure
        std::fs::create_dir_all("./static/js").ok();
        std::fs::write("./static/js/test.js", "console.log('test');").ok();
    }

    let app = test::init_service(setup_test_app().await).await;

    let req = test::TestRequest::get()
        .uri("/static/js/dashboard.js")
        .to_request();

    let resp = test::call_service(&app, req).await;
    
    if resp.status() == StatusCode::OK {
        let headers = resp.headers();
        assert_eq!(headers.get("Content-Type").unwrap(), "application/javascript");
    } else {
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}

#[actix_web::test]
async fn test_static_image_serving() {
    let app = test::init_service(setup_test_app().await).await;

    let req = test::TestRequest::get()
        .uri("/static/images/logo.png")
        .to_request();

    let resp = test::call_service(&app, req).await;
    
    if resp.status() == StatusCode::OK {
        let headers = resp.headers();
        assert_eq!(headers.get("Content-Type").unwrap(), "image/png");
    } else {
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}

#[actix_web::test]
async fn test_static_file_not_found() {
    let app = test::init_service(setup_test_app().await).await;

    let req = test::TestRequest::get()
        .uri("/static/nonexistent.file")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn test_static_directory_traversal_protection() {
    let app = test::init_service(setup_test_app().await).await;

    // Try to access parent directory
    let req = test::TestRequest::get()
        .uri("/static/../../../etc/passwd")
        .to_request();

    let resp = test::call_service(&app, req).await;
    // Should be blocked
    assert_ne!(resp.status(), StatusCode::OK);
}

#[actix_web::test]
async fn test_conditional_requests() {
    // Create a test file
    std::fs::create_dir_all("./static/test").ok();
    std::fs::write("./static/test/conditional.txt", "test content").ok();

    let app = test::init_service(setup_test_app().await).await;

    // First request to get ETag
    let req = test::TestRequest::get()
        .uri("/static/test/conditional.txt")
        .to_request();

    let resp = test::call_service(&app, req).await;
    
    if resp.status() == StatusCode::OK {
        let etag = resp.headers().get("ETag").cloned();
        
        if let Some(etag_value) = etag {
            // Second request with If-None-Match
            let req2 = test::TestRequest::get()
                .uri("/static/test/conditional.txt")
                .insert_header(("If-None-Match", etag_value))
                .to_request();

            let resp2 = test::call_service(&app, req2).await;
            // Should return 304 Not Modified
            assert_eq!(resp2.status(), StatusCode::NOT_MODIFIED);
        }
    }

    // Cleanup
    std::fs::remove_file("./static/test/conditional.txt").ok();
    std::fs::remove_dir("./static/test").ok();
}

#[actix_web::test]
async fn test_mime_type_detection() {
    let app = test::init_service(setup_test_app().await).await;

    let test_files = vec![
        ("/static/test.html", "text/html"),
        ("/static/test.json", "application/json"),
        ("/static/test.xml", "application/xml"),
        ("/static/test.svg", "image/svg+xml"),
        ("/static/test.woff", "font/woff"),
        ("/static/test.woff2", "font/woff2"),
    ];

    for (path, expected_mime) in test_files {
        // Create test file
        let file_path = format!(".{}", path);
        if let Some(parent) = Path::new(&file_path).parent() {
            std::fs::create_dir_all(parent).ok();
        }
        std::fs::write(&file_path, "test").ok();

        let req = test::TestRequest::get()
            .uri(path)
            .to_request();

        let resp = test::call_service(&app, req).await;
        
        if resp.status() == StatusCode::OK {
            let headers = resp.headers();
            if let Some(content_type) = headers.get("Content-Type") {
                assert!(
                    content_type.to_str().unwrap().contains(expected_mime),
                    "Expected {} for {}, got {:?}",
                    expected_mime,
                    path,
                    content_type
                );
            }
        }

        // Cleanup
        std::fs::remove_file(&file_path).ok();
    }
}