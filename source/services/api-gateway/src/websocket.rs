use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use std::collections::HashMap;
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};
use tracing::{debug, error, info};

use crate::logging::{LogCategory, LogLevel};
use crate::AppState;

/// WebSocket connection handler for real-time updates
pub async fn websocket_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Handle individual WebSocket connection
async fn handle_socket(mut socket: WebSocket, state: AppState) {
    // Create a broadcast receiver for updates
    let mut update_rx = state.update_channel.subscribe();

    // Send initial security metrics
    if let Ok(monitor) = state.security_monitor.try_read() {
        let dashboard_data = monitor.get_dashboard_data().await;
        let message = serde_json::json!({
            "type": "security_update",
            "data": dashboard_data,
        });

        if let Ok(text) = serde_json::to_string(&message) {
            let _ = socket.send(Message::Text(text.into())).await;
        }
    }

    // Set up periodic updates (every 10 seconds to reduce flooding)
    let mut interval = interval(Duration::from_secs(10));

    loop {
        tokio::select! {

            // Handle incoming messages from client
            Some(msg) = socket.recv() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        debug!("Received WebSocket message: {}", text);

                        // Parse the message as JSON to handle different message types
                        if let Ok(msg_data) = serde_json::from_str::<serde_json::Value>(&text) {
                            match msg_data.get("type").and_then(|t| t.as_str()) {
                                Some("console_log") => {
                                    // Handle console log from browser
                                    handle_console_log(msg_data, &state).await;
                                }
                                Some("ping") => {
                                    let pong = serde_json::json!({
                                        "type": "pong",
                                        "timestamp": chrono::Utc::now()
                                    });
                                    if let Ok(pong_text) = serde_json::to_string(&pong) {
                                        let _ = socket.send(Message::Text(pong_text.into())).await;
                                    }
                                }
                                _ => {
                                    debug!("Unknown message type: {:?}", msg_data.get("type"));
                                }
                            }
                        } else {
                            // Handle legacy plain text messages
                            if text == "ping" {
                                let _ = socket.send(Message::Text("pong".into())).await;
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        info!("WebSocket connection closed by client");

                        // Log WebSocket close event
                        let mut context = HashMap::new();
                        context.insert("event".to_string(), serde_json::Value::String("client_close".to_string()));
                        state.logger.info(
                            LogCategory::WebSocket,
                            "WebSocket connection closed by client",
                            context
                        ).await;
                        break;
                    }
                    Ok(_) => {},
                    Err(e) => {
                        error!("WebSocket error: {}", e);

                        // Log WebSocket error
                        let mut error_context = HashMap::new();
                        error_context.insert("error_type".to_string(), serde_json::Value::String("receive_error".to_string()));
                        error_context.insert("error_message".to_string(), serde_json::Value::String(e.to_string()));

                        state.logger.log_with_context(
                            LogLevel::Error,
                            LogCategory::WebSocket,
                            &format!("WebSocket receive error: {}", e),
                            error_context
                        ).await;
                        break;
                    }
                }
            }

            // Send periodic updates
            _ = interval.tick() => {
                if let Ok(monitor) = state.security_monitor.try_read() {
                    let dashboard_data = monitor.get_dashboard_data().await;
                    let message = serde_json::json!({
                        "type": "security_update",
                        "data": dashboard_data,
                        "timestamp": chrono::Utc::now(),
                    });

                    if let Ok(text) = serde_json::to_string(&message) {
                        if let Err(e) = socket.send(Message::Text(text.into())).await {
                            error!("Failed to send WebSocket message: {}", e);

                            // Log WebSocket send error
                            let mut context = HashMap::new();
                            context.insert("error_type".to_string(), serde_json::Value::String("send_error".to_string()));
                            context.insert("error_message".to_string(), serde_json::Value::String(e.to_string()));
                            state.logger.error(
                                LogCategory::WebSocket,
                                &format!("Failed to send periodic update: {}", e),
                                context
                            ).await;
                            break;
                        }
                    }
                }
            }

            // Handle broadcast updates (instant updates for events)
            Ok(update) = update_rx.recv() => {
                if let Err(e) = socket.send(Message::Text(update.into())).await {
                    error!("Failed to send broadcast update: {}", e);

                    // Log WebSocket broadcast error
                    let mut context = HashMap::new();
                    context.insert("error_type".to_string(), serde_json::Value::String("broadcast_error".to_string()));
                    context.insert("error_message".to_string(), serde_json::Value::String(e.to_string()));
                    state.logger.error(
                        LogCategory::WebSocket,
                        &format!("Failed to send broadcast update: {}", e),
                        context
                    ).await;
                    break;
                }
            }
        }
    }

    info!("WebSocket connection closed");

    // Log WebSocket disconnection
    let mut context = HashMap::new();
    context.insert(
        "event".to_string(),
        serde_json::Value::String("connection_closed".to_string()),
    );
    state
        .logger
        .info(
            LogCategory::WebSocket,
            "WebSocket connection closed",
            context,
        )
        .await;
}

/// Handle console log messages from browser - FILTERED FOR LAYOUT DEBUGGING
async fn handle_console_log(msg_data: serde_json::Value, _state: &AppState) {
    // Only process messages from RuntimeNormalizer, ContainmentRuntime, HierarchicalPrimitive, RuntimeRenderer, LayoutGraphUtils, PresentationFrame, LayoutRuntime, and LayoutOrchestrator
    if let Some(message) = msg_data.get("message").and_then(|m| m.as_str()) {
        if message.starts_with("[RuntimeNormalizer]")
            || message.starts_with("[ContainmentRuntime]")
            || message.starts_with("[HierarchicalPrimitive]")
            || message.starts_with("[ClippedHierarchicalPrimitive]")
            || message.starts_with("[RuntimeRenderer]")
            || message.starts_with("[RuntimeContainmentRenderer]")
            || message.starts_with("[ComposableHierarchicalRenderer]")
            || message.starts_with("[ComponentFactory]")
            || message.starts_with("[LayoutGraphUtils]")
            || message.starts_with("[PresentationFrame]")
            || message.starts_with("[LayoutRuntime]")
            || message.starts_with("[LayoutOrchestrator]")
            || message.starts_with("[FINAL DATA]") {
            // Write to stderr which goes to gateway-debug.log
            eprintln!("[BROWSER] {}", message);
        }
    }
}

/// Broadcast channel for instant updates
#[derive(Clone)]
pub struct UpdateChannel {
    tx: broadcast::Sender<String>,
}

impl UpdateChannel {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100);
        Self { tx }
    }

    #[allow(dead_code)]
    pub fn send_update(&self, update: serde_json::Value) {
        if let Ok(text) = serde_json::to_string(&update) {
            let _ = self.tx.send(text);
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.tx.subscribe()
    }
}

impl Default for UpdateChannel {
    fn default() -> Self {
        Self::new()
    }
}
