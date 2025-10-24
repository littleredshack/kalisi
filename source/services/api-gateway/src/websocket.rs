use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use redis::AsyncCommands;
use std::collections::HashMap;
use tokio::sync::broadcast;
use tokio::time::{interval, Duration};
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::logging::{LogCategory, LogLevel};
use crate::AppState;

const GRAPH_DELTA_STREAM: &str = "graph:delta";

/// WebSocket connection handler for real-time updates
pub async fn websocket_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Handle individual WebSocket connection
async fn handle_socket(mut socket: WebSocket, state: AppState) {
    // Create a broadcast receiver for updates
    let mut update_rx = state.update_channel.subscribe();

    // Optional graph delta receiver (created when client subscribes)
    let mut graph_delta_rx: Option<tokio::sync::mpsc::Receiver<String>> = None;

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
                                Some("subscribe_graph_changes") => {
                                    // Handle graph delta subscription
                                    if let Some(view_node_id) = msg_data.get("viewNodeId").and_then(|v| v.as_str()) {
                                        info!("Client subscribing to graph changes for ViewNode: {}", view_node_id);

                                        // Start the graph delta consumer
                                        match start_graph_delta_consumer(
                                            view_node_id.to_string(),
                                            state.config.redis_url.clone(),
                                        ).await {
                                            Ok(rx) => {
                                                graph_delta_rx = Some(rx);

                                                // Send acknowledgment
                                                let ack = serde_json::json!({
                                                    "type": "graph_subscription_ack",
                                                    "viewNodeId": view_node_id,
                                                    "timestamp": chrono::Utc::now()
                                                });
                                                if let Ok(ack_text) = serde_json::to_string(&ack) {
                                                    let _ = socket.send(Message::Text(ack_text.into())).await;
                                                }
                                                info!("Graph delta subscription active for ViewNode: {}", view_node_id);
                                            }
                                            Err(e) => {
                                                error!("Failed to start graph delta consumer: {}", e);
                                                let error_msg = serde_json::json!({
                                                    "type": "graph_subscription_error",
                                                    "error": e,
                                                    "timestamp": chrono::Utc::now()
                                                });
                                                if let Ok(error_text) = serde_json::to_string(&error_msg) {
                                                    let _ = socket.send(Message::Text(error_text.into())).await;
                                                }
                                            }
                                        }
                                    } else {
                                        warn!("subscribe_graph_changes message missing viewNodeId");
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

            // Handle graph delta updates (if subscribed)
            Some(delta_json) = async {
                if let Some(rx) = graph_delta_rx.as_mut() {
                    rx.recv().await
                } else {
                    // Return pending if no subscription active
                    std::future::pending().await
                }
            } => {
                debug!("Sending graph delta to client");
                if let Err(e) = socket.send(Message::Text(delta_json.into())).await {
                    error!("Failed to send graph delta: {}", e);
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

/// Handle console log messages from browser
async fn handle_console_log(msg_data: serde_json::Value, _state: &AppState) {
    if let Some(message) = msg_data.get("message").and_then(|m| m.as_str()) {
        // Write to stderr which goes to gateway-debug.log
        eprintln!("[BROWSER] {}", message);
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

/// Spawns a Redis stream consumer that reads graph deltas and sends them to a channel
/// Returns a receiver channel that the WebSocket handler can read from
async fn start_graph_delta_consumer(
    view_node_id: String,
    redis_url: String,
) -> Result<tokio::sync::mpsc::Receiver<String>, String> {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(100);

    // Spawn the consumer task
    tokio::spawn(async move {
        if let Err(e) = consume_graph_deltas(view_node_id.clone(), redis_url, tx).await {
            error!("Graph delta consumer error for ViewNode {}: {}", view_node_id, e);
        }
    });

    Ok(rx)
}

/// Consumes graph deltas from Redis stream and sends them to the channel
async fn consume_graph_deltas(
    view_node_id: String,
    redis_url: String,
    tx: tokio::sync::mpsc::Sender<String>,
) -> Result<(), String> {
    // Create Redis client
    let redis_client = redis::Client::open(redis_url.as_str())
        .map_err(|e| format!("Failed to create Redis client: {}", e))?;

    let mut redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| format!("Failed to connect to Redis: {}", e))?;

    // Create consumer group and name
    let consumer_group = format!("ws_graph_delta_{}", Uuid::new_v4());
    let consumer_name = "consumer";

    // Ensure consumer group exists - start from $ (now) to skip old messages
    match redis_conn
        .xgroup_create_mkstream::<_, _, _, String>(GRAPH_DELTA_STREAM, &consumer_group, "$")
        .await
    {
        Ok(_) => {
            info!("Created consumer group: {}", consumer_group);
        }
        Err(e) => {
            if e.to_string().contains("BUSYGROUP") {
                debug!("Consumer group already exists: {}", consumer_group);
            } else {
                return Err(format!("Failed to create consumer group: {}", e));
            }
        }
    }

    info!(
        "Starting graph delta consumer for ViewNode: {} (group: {})",
        view_node_id, consumer_group
    );

    // Read from stream using XREADGROUP
    loop {
        // XREADGROUP GROUP <group> <consumer> BLOCK 5000 COUNT 10 STREAMS <stream> >
        let opts = redis::streams::StreamReadOptions::default()
            .group(&consumer_group, consumer_name)
            .block(5000) // Block for 5 seconds
            .count(10);

        let result: Result<redis::streams::StreamReadReply, redis::RedisError> = redis_conn
            .xread_options(&[GRAPH_DELTA_STREAM], &[">"], &opts)
            .await;

        match result {
            Ok(reply) => {
                for stream_key in &reply.keys {
                    for stream_id in &stream_key.ids {
                        // Extract the payload
                        if let Some(redis::Value::BulkString(bytes)) = stream_id.map.get("payload") {
                            if let Ok(json_str) = String::from_utf8(bytes.clone()) {
                                // Parse to check if it matches our view_node_id
                                if let Ok(delta) = serde_json::from_str::<serde_json::Value>(&json_str) {
                                    if let Some(delta_view_node_id) = delta.get("viewNodeId").and_then(|v| v.as_str()) {
                                        if delta_view_node_id == view_node_id {
                                            // Send to WebSocket
                                            if tx.send(json_str.clone()).await.is_err() {
                                                warn!("WebSocket channel closed, stopping consumer");
                                                return Ok(());
                                            }
                                            debug!("Forwarded delta to WebSocket: {}", stream_id.id);
                                        }
                                    }
                                }
                            }
                        }

                        // Acknowledge the message
                        let _: Result<(), redis::RedisError> = redis_conn
                            .xack(GRAPH_DELTA_STREAM, &consumer_group, &[&stream_id.id])
                            .await;
                    }
                }
            }
            Err(e) => {
                if !e.to_string().contains("nil") {
                    error!("Error reading from stream: {}", e);
                }
                // Continue even on error
            }
        }

        // Check if the channel is still open
        if tx.is_closed() {
            info!("WebSocket channel closed, stopping consumer");
            break;
        }
    }

    Ok(())
}
