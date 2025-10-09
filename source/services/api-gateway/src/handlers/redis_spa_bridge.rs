use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::Response,
};
use futures::StreamExt;
use redis::AsyncCommands;
use serde_json::Value;
use tracing::{debug, error, info};

use crate::state::AppState;

/// Pure SPA Redis bridge - handles direct Redis communication for frontend
pub async fn redis_spa_bridge(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_spa_redis_bridge(socket, state))
}

/// Handle SPA Redis bridge WebSocket connection
async fn handle_spa_redis_bridge(mut socket: WebSocket, _state: AppState) {
    info!("🔌 SPA Redis bridge connected");

    // Set up Redis connections
    let redis_url =
        std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

    // Redis client for sending requests with error handling
    let request_client = match redis::Client::open(redis_url.as_str()) {
        Ok(client) => client,
        Err(e) => {
            error!("Failed to create Redis request client: {}", e);
            return;
        }
    };

    let mut request_redis = match request_client.get_multiplexed_async_connection().await {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to Redis for requests: {}", e);
            return;
        }
    };

    // Redis connection for reading streams and pub/sub with error handling
    let response_client = match redis::Client::open(redis_url.as_str()) {
        Ok(client) => client,
        Err(e) => {
            error!("Failed to create Redis response client: {}", e);
            return;
        }
    };

    let mut response_redis = match response_client.get_multiplexed_async_connection().await {
        Ok(conn) => conn,
        Err(e) => {
            error!("Failed to connect to Redis for responses: {}", e);
            return;
        }
    };

    // Set up pub/sub for UI state updates with error handling
    let mut response_pubsub = match response_client.get_async_pubsub().await {
        Ok(pubsub) => pubsub,
        Err(e) => {
            error!("Failed to create Redis pubsub connection: {}", e);
            return;
        }
    };
    let _ = response_pubsub.subscribe("ui:logs_panel").await;

    // Create consumer group for reliable stream processing
    let consumer_group = "spa_bridge_group";
    let consumer_name = "spa_bridge_consumer";

    // Create consumer group and stream if they don't exist
    match response_redis
        .xgroup_create_mkstream::<_, _, _, String>("agent:responses", consumer_group, "0")
        .await
    {
        Ok(_) => {
            info!("✅ Created consumer group: {}", consumer_group);
        }
        Err(e) => {
            if e.to_string().contains("BUSYGROUP") {
                debug!("✅ Consumer group already exists: {}", consumer_group);
            } else {
                error!("Failed to create consumer group: {}", e);
                return;
            }
        }
    }

    info!(
        "📡 SPA bridge ready with consumer group: {}",
        consumer_group
    );

    let mut pubsub_stream = response_pubsub.on_message();

    loop {
        tokio::select! {
            // Handle Redis streams using consumer group - proper Redis mechanics
            result = async {
                redis::cmd("XREADGROUP")
                    .arg("GROUP")
                    .arg(consumer_group)
                    .arg(consumer_name)
                    .arg("BLOCK")
                    .arg(0)  // Wait indefinitely until messages arrive
                    .arg("COUNT")
                    .arg(10)
                    .arg("STREAMS")
                    .arg("agent:responses")
                    .arg(">")
                    .query_async::<redis::streams::StreamReadReply>(&mut response_redis)
                    .await
            } => {
                match result {
                    Ok(streams) => {
                        for stream in streams.keys {
                            for entry in stream.ids {
                                if let Some(redis::Value::BulkString(data)) = entry.map.get("data") {
                                    if let Ok(json_str) = String::from_utf8(data.clone()) {
                                        debug!("📤 Forwarding agent response: {}",
                                            json_str.chars().take(100).collect::<String>());

                                        let ws_message = serde_json::json!({
                                            "type": "agent_response",
                                            "channel": "agent:responses",
                                            "data": json_str
                                        });

                                        if let Ok(message_text) = serde_json::to_string(&ws_message) {
                                            if let Err(e) = socket.send(Message::Text(message_text.into())).await {
                                                // Handle broken pipe gracefully - client disconnected
                                                if e.to_string().contains("Broken pipe") || e.to_string().contains("Connection reset") {
                                                    info!("🔌 SPA client disconnected during response forward");
                                                } else {
                                                    error!("Failed to forward agent response: {}", e);
                                                }
                                                break;
                                            } else {
                                                // Acknowledge message processing
                                                let _: Result<i32, _> = response_redis.xack("agent:responses", consumer_group, &[&entry.id]).await;
                                                debug!("✅ Response forwarded and acknowledged");
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let error_msg = e.to_string();
                        if error_msg.contains("NOGROUP") {
                            // Stream or consumer group doesn't exist yet - this is normal during startup
                            // Silently continue without logging to prevent spam
                        } else {
                            debug!("⏳ No new responses (timeout): {}", e);
                        }
                    }
                }
            }

            // Handle Redis pub/sub (UI state updates)
            Some(msg) = pubsub_stream.next() => {
                if let Ok(payload) = msg.get_payload::<String>() {
                    let channel = msg.get_channel_name();

                    let ws_message = serde_json::json!({
                        "type": "agent_ui_state",
                        "channel": channel,
                        "data": payload
                    });

                    if let Ok(message_text) = serde_json::to_string(&ws_message) {
                        if let Err(e) = socket.send(Message::Text(message_text.into())).await {
                            // Handle broken pipe gracefully - client disconnected
                            if e.to_string().contains("Broken pipe") || e.to_string().contains("Connection reset") {
                                info!("🔌 SPA client disconnected normally");
                            } else {
                                error!("Failed to forward Redis UI state to SPA: {}", e);
                            }
                            break;
                        }
                    }
                }
            }

            // Handle messages from frontend SPA
            Some(msg) = socket.recv() => {
                match msg {
                    Ok(Message::Text(text)) => {
                        debug!("Received SPA message: {}", text);

                        if let Ok(spa_msg) = serde_json::from_str::<Value>(&text) {
                            match spa_msg.get("type").and_then(|t| t.as_str()) {
                                Some("agent_request") => {
                                    // Forward agent request to Redis with error handling
                                    if let Some(request_data) = spa_msg.get("data") {
                                        match serde_json::to_string(request_data) {
                                            Ok(request_json) => {
                                                match request_redis.xadd::<_, _, _, _, String>("agent:requests", "*", &[("data", &request_json)]).await {
                                                    Ok(_) => {
                                                        info!("📤 Forwarded SPA agent request to Redis");
                                                    }
                                                    Err(e) => {
                                                        error!("❌ Failed to forward agent request to Redis: {}", e);
                                                        // Send error back to SPA instead of crashing
                                                        let error_response = serde_json::json!({
                                                            "type": "agent_error",
                                                            "error": format!("Redis request failed: {}", e)
                                                        });
                                                        if let Ok(error_text) = serde_json::to_string(&error_response) {
                                                            let _ = socket.send(Message::Text(error_text.into())).await;
                                                        }
                                                    }
                                                }
                                            }
                                            Err(e) => {
                                                error!("❌ Failed to serialize agent request: {}", e);
                                            }
                                        }
                                    }
                                }
                                Some("subscribe_ui") => {
                                    // Handle UI subscription requests
                                    if let Some(channel) = spa_msg.get("channel").and_then(|c| c.as_str()) {
                                        info!("📡 SPA subscribing to UI channel: {}", channel);
                                        // Already subscribed to main channels above
                                    }
                                }
                                _ => {
                                    debug!("Unknown SPA message type: {:?}", spa_msg.get("type"));
                                }
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        info!("🔌 SPA Redis bridge connection closed");
                        break;
                    }
                    Ok(_) => {
                        // Ignore other message types
                    }
                    Err(e) => {
                        error!("SPA WebSocket error: {}", e);
                        break;
                    }
                }
            }
        }
    }

    info!("🔌 SPA Redis bridge disconnected");
}
