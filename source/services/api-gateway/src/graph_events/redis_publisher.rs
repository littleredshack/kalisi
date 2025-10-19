use redis::aio::ConnectionManager;
use redis::AsyncCommands;
use tracing::{debug, error, info};

use super::GraphDelta;

const GRAPH_DELTA_STREAM: &str = "graph:delta";

/// Redis Stream publisher for graph deltas
/// Uses a dedicated ConnectionManager to avoid blocking other Redis operations
pub struct GraphDeltaPublisher {
    redis: ConnectionManager,
}

impl GraphDeltaPublisher {
    /// Creates a new GraphDeltaPublisher with a dedicated Redis connection
    pub async fn new(redis_url: &str) -> Result<Self, redis::RedisError> {
        let client = redis::Client::open(redis_url)?;
        let redis = ConnectionManager::new(client).await?;

        info!("GraphDeltaPublisher initialized with stream: {}", GRAPH_DELTA_STREAM);

        Ok(Self { redis })
    }

    /// Publishes a GraphDelta to the Redis stream
    /// Returns the message ID assigned by Redis
    pub async fn publish(&mut self, delta: &GraphDelta) -> Result<String, redis::RedisError> {
        // Serialize the delta to JSON
        let json = match serde_json::to_string(delta) {
            Ok(json) => json,
            Err(e) => {
                error!("Failed to serialize GraphDelta: {}", e);
                return Err(redis::RedisError::from((
                    redis::ErrorKind::IoError,
                    "Serialization failed",
                )));
            }
        };

        debug!(
            "Publishing delta to stream {}: view_node_id={}",
            GRAPH_DELTA_STREAM, delta.view_node_id
        );

        // Add to Redis stream with XADD
        // Format: XADD graph:delta * payload <json>
        let message_id: String = self
            .redis
            .xadd(
                GRAPH_DELTA_STREAM,
                "*", // Auto-generate ID
                &[("payload", json.as_str())],
            )
            .await?;

        info!(
            "Published delta to stream {}: message_id={}, view_node_id={}",
            GRAPH_DELTA_STREAM, message_id, delta.view_node_id
        );

        Ok(message_id)
    }

    /// Creates or ensures a consumer group exists for the stream
    /// This should be called by WebSocket handlers before consuming
    pub async fn ensure_consumer_group(
        &mut self,
        group_name: &str,
    ) -> Result<(), redis::RedisError> {
        match self
            .redis
            .xgroup_create_mkstream::<_, _, _, String>(GRAPH_DELTA_STREAM, group_name, "0")
            .await
        {
            Ok(_) => {
                info!(
                    "Created consumer group '{}' for stream {}",
                    group_name, GRAPH_DELTA_STREAM
                );
                Ok(())
            }
            Err(e) => {
                if e.to_string().contains("BUSYGROUP") {
                    debug!(
                        "Consumer group '{}' already exists for stream {}",
                        group_name, GRAPH_DELTA_STREAM
                    );
                    Ok(())
                } else {
                    error!("Failed to create consumer group '{}': {}", group_name, e);
                    Err(e)
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires Redis to be running
    async fn test_publisher_initialization() {
        let redis_url = "redis://127.0.0.1:6379";
        let result = GraphDeltaPublisher::new(redis_url).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    #[ignore] // Requires Redis to be running
    async fn test_publish_delta() {
        let redis_url = "redis://127.0.0.1:6379";
        let mut publisher = GraphDeltaPublisher::new(redis_url).await.unwrap();

        let delta = GraphDelta::new("test-view-node-123".to_string());
        let result = publisher.publish(&delta).await;

        assert!(result.is_ok());
        let message_id = result.unwrap();
        assert!(!message_id.is_empty());
    }
}
