use actix_web::{http::StatusCode, test, web, App};
use edt_gateway::{handlers::health::*, state::AppState, storage::Storage};
use std::sync::Arc;
use tokio::sync::RwLock;

async fn setup_test_state() -> web::Data<AppState> {
    let storage = Storage::new_test()
        .await
        .expect("Failed to create test storage");
    web::Data::new(AppState {
        storage: Arc::new(RwLock::new(storage)),
        neo4j_client: None,
    })
}

#[actix_web::test]
async fn test_health_check_endpoint() {
    let state = setup_test_state().await;
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .service(web::resource("/health").route(web::get().to(health_check))),
    )
    .await;

    let req = test::TestRequest::get().uri("/health").to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["status"], "ok");
    assert!(body["timestamp"].is_string());
    assert!(body["version"].is_string());
    assert!(body["uptime_seconds"].is_number());
}

#[actix_web::test]
async fn test_detailed_health_check() {
    let state = setup_test_state().await;
    let app =
        test::init_service(App::new().app_data(state.clone()).service(
            web::resource("/health/detailed").route(web::get().to(detailed_health_check)),
        ))
        .await;

    let req = test::TestRequest::get()
        .uri("/health/detailed")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["status"], "ok");
    assert!(body["components"].is_object());

    let components = body["components"].as_object().unwrap();
    assert!(components.contains_key("database"));
    assert!(components.contains_key("neo4j"));
    assert!(components.contains_key("memory"));

    // Check database component
    let db = &components["database"];
    assert!(db["status"].is_string());
    assert!(db["latency_ms"].is_number());

    // Check memory component
    let memory = &components["memory"];
    assert!(memory["status"].is_string());
    assert!(memory["used_mb"].is_number());
    assert!(memory["total_mb"].is_number());
}

#[actix_web::test]
async fn test_liveness_probe() {
    let state = setup_test_state().await;
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .service(web::resource("/health/live").route(web::get().to(liveness_probe))),
    )
    .await;

    let req = test::TestRequest::get().uri("/health/live").to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["status"], "alive");
}

#[actix_web::test]
async fn test_readiness_probe() {
    let state = setup_test_state().await;
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .service(web::resource("/health/ready").route(web::get().to(readiness_probe))),
    )
    .await;

    let req = test::TestRequest::get().uri("/health/ready").to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert_eq!(body["status"], "ready");
    assert!(body["checks"].is_object());

    let checks = body["checks"].as_object().unwrap();
    assert!(checks["database"].as_bool().unwrap());
    // Neo4j might be false in test environment
    assert!(checks.contains_key("neo4j"));
}

#[actix_web::test]
async fn test_health_metrics_endpoint() {
    let state = setup_test_state().await;
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .service(web::resource("/health/metrics").route(web::get().to(health_metrics))),
    )
    .await;

    let req = test::TestRequest::get().uri("/health/metrics").to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["cpu_usage"].is_number());
    assert!(body["memory_usage"].is_object());
    assert!(body["disk_usage"].is_object());
    assert!(body["network"].is_object());
    assert!(body["process"].is_object());

    // Check memory metrics
    let memory = &body["memory_usage"];
    assert!(memory["used_mb"].is_number());
    assert!(memory["total_mb"].is_number());
    assert!(memory["percentage"].is_number());

    // Check process metrics
    let process = &body["process"];
    assert!(process["pid"].is_number());
    assert!(process["threads"].is_number());
    assert!(process["start_time"].is_string());
}
