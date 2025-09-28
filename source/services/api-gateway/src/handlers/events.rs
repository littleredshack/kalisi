use axum::{
    extract::State,
    response::{IntoResponse, Response, Sse},
    http::{header, StatusCode},
};
use axum::response::sse::{Event, KeepAlive};
use serde::{Serialize};
use std::convert::Infallible;
use std::time::Duration;
use tokio_stream::{Stream, StreamExt};
use tracing::{info, error};

use crate::state::AppState;

/// SSE event types for Neo4j changes
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type")]
pub enum DomainEvent {
    #[serde(rename = "nodeChanged")]
    NodeChanged {
        id: String,
        timestamp: String,
        changes: Vec<String>,
    },
    #[serde(rename = "relChanged")]
    RelChanged {
        id: String,
        from_id: String,
        to_id: String,
        timestamp: String,
        changes: Vec<String>,
    },
    #[serde(rename = "heartbeat")]
    Heartbeat {
        timestamp: String,
        active_connections: usize,
    },
}

/// SSE stream for real-time domain events (FR-023)
pub async fn events_stream(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, StatusCode> {
    info!("Starting SSE events stream for domain updates");

    let stream = create_event_stream(state);
    
    Ok(Sse::new(stream)
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(30))
                .text("heartbeat")
        ))
}

/// Create the event stream
fn create_event_stream(
    _state: AppState,
) -> impl Stream<Item = Result<Event, Infallible>> {
    // For v0 implementation, simulate events with periodic heartbeats
    // Future: Replace with real Neo4j change detection
    
    tokio_stream::wrappers::IntervalStream::new(
        tokio::time::interval(Duration::from_secs(10))
    )
    .map(move |_| {
        let event = DomainEvent::Heartbeat {
            timestamp: chrono::Utc::now().to_rfc3339(),
            active_connections: 1, // Mock value
        };
        
        let event_json = match serde_json::to_string(&event) {
            Ok(json) => json,
            Err(e) => {
                error!(error = %e, "Failed to serialize SSE event");
                r#"{"type":"heartbeat","timestamp":"2025-08-26T00:00:00Z","active_connections":0}"#.to_string()
            }
        };

        Ok(Event::default()
            .event("domain-update")
            .data(event_json))
    })
}

/// Mock function to simulate node change events (for future implementation)
pub fn emit_node_changed(node_id: &str, changes: Vec<String>) -> DomainEvent {
    DomainEvent::NodeChanged {
        id: node_id.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        changes,
    }
}

/// Mock function to simulate relationship change events (for future implementation)  
pub fn emit_rel_changed(rel_id: &str, from_id: &str, to_id: &str, changes: Vec<String>) -> DomainEvent {
    DomainEvent::RelChanged {
        id: rel_id.to_string(),
        from_id: from_id.to_string(),
        to_id: to_id.to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
        changes,
    }
}