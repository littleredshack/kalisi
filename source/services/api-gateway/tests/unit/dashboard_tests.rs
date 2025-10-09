use actix_web::{http::StatusCode, test, web, App};
use edt_gateway::{handlers::dashboard::*, state::AppState, storage::Storage};
use serde_json::json;
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
async fn test_dashboard_page_loads() {
    let state = setup_test_state().await;
    let app = test::init_service(
        App::new()
            .app_data(state.clone())
            .service(web::resource("/dashboard").route(web::get().to(dashboard_page))),
    )
    .await;

    let req = test::TestRequest::get().uri("/dashboard").to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    // Check content type is HTML
    let content_type = resp.headers().get("Content-Type").unwrap();
    assert!(content_type.to_str().unwrap().contains("text/html"));
}

#[actix_web::test]
async fn test_dashboard_api_stats() {
    let state = setup_test_state().await;

    // Create test data
    {
        let mut storage = state.storage.write().await;
        let user_id = storage
            .create_user("stats@example.com", "Stats User")
            .await
            .expect("Failed to create user");

        // Log various auth events
        storage
            .log_auth_event(user_id, "login", true, Some("127.0.0.1".to_string()), None)
            .await
            .expect("Failed to log event");
        storage
            .log_auth_event(user_id, "login", false, Some("127.0.0.1".to_string()), None)
            .await
            .expect("Failed to log event");
    }

    let app =
        test::init_service(App::new().app_data(state.clone()).service(
            web::resource("/api/dashboard/stats").route(web::get().to(get_dashboard_stats)),
        ))
        .await;

    let req = test::TestRequest::get()
        .uri("/api/dashboard/stats")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["total_users"].is_number());
    assert!(body["active_sessions"].is_number());
    assert!(body["auth_events_today"].is_number());
    assert!(body["success_rate"].is_number());
}

#[actix_web::test]
async fn test_dashboard_recent_activity() {
    let state = setup_test_state().await;

    // Create test activity
    {
        let mut storage = state.storage.write().await;
        let user_id = storage
            .create_user("activity@example.com", "Activity User")
            .await
            .expect("Failed to create user");

        storage
            .create_session(user_id, "test-session")
            .await
            .expect("Failed to create session");

        storage
            .log_auth_event(
                user_id,
                "login",
                true,
                Some("192.168.1.1".to_string()),
                Some("Test Browser".to_string()),
            )
            .await
            .expect("Failed to log event");
    }

    let app = test::init_service(App::new().app_data(state.clone()).service(
        web::resource("/api/dashboard/activity").route(web::get().to(get_recent_activity)),
    ))
    .await;

    let req = test::TestRequest::get()
        .uri("/api/dashboard/activity")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["activities"].is_array());

    let activities = body["activities"].as_array().unwrap();
    assert!(!activities.is_empty());

    // Check activity structure
    let first_activity = &activities[0];
    assert!(first_activity["user_email"].is_string());
    assert!(first_activity["event_type"].is_string());
    assert!(first_activity["timestamp"].is_string());
}

#[actix_web::test]
async fn test_dashboard_system_health() {
    let state = setup_test_state().await;
    let app =
        test::init_service(App::new().app_data(state.clone()).service(
            web::resource("/api/dashboard/health").route(web::get().to(get_system_health)),
        ))
        .await;

    let req = test::TestRequest::get()
        .uri("/api/dashboard/health")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["database"].is_string());
    assert!(body["neo4j"].is_string());
    assert!(body["uptime"].is_number());
    assert!(body["memory_usage"].is_object());

    let memory = &body["memory_usage"];
    assert!(memory["used_mb"].is_number());
    assert!(memory["total_mb"].is_number());
    assert!(memory["percentage"].is_number());
}

#[actix_web::test]
async fn test_dashboard_user_sessions_list() {
    let state = setup_test_state().await;

    // Create test sessions
    {
        let mut storage = state.storage.write().await;
        let user_id = storage
            .create_user("sessions@example.com", "Session User")
            .await
            .expect("Failed to create user");

        for i in 0..3 {
            storage
                .create_session(user_id, &format!("session-{}", i))
                .await
                .expect("Failed to create session");
        }
    }

    let app = test::init_service(App::new().app_data(state.clone()).service(
        web::resource("/api/dashboard/sessions").route(web::get().to(get_active_sessions)),
    ))
    .await;

    let req = test::TestRequest::get()
        .uri("/api/dashboard/sessions")
        .to_request();

    let resp = test::call_service(&app, req).await;
    assert_eq!(resp.status(), StatusCode::OK);

    let body: serde_json::Value = test::read_body_json(resp).await;
    assert!(body["sessions"].is_array());

    let sessions = body["sessions"].as_array().unwrap();
    assert_eq!(sessions.len(), 3);

    // Check session structure
    for session in sessions {
        assert!(session["token"].is_string());
        assert!(session["user_email"].is_string());
        assert!(session["created_at"].is_string());
        assert!(session["expires_at"].is_string());
    }
}
