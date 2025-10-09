use anyhow::Result;
use redis::aio::MultiplexedConnection;
use redis::{streams, AsyncCommands};
use tracing::info;

use crate::envelope::Envelope;

/// Message bus for agent communication using Redis Streams
pub struct RedisBus {
    redis: MultiplexedConnection,
    stream_prefix: String,
}

impl RedisBus {
    /// Create a new Redis-based message bus
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis = client.get_multiplexed_async_connection().await?;

        Ok(Self {
            redis,
            stream_prefix: "agent:stream:".to_string(),
        })
    }

    /// Publish a message to an agent's stream
    pub async fn publish(
        &mut self,
        envelope: &Envelope,
        payload: &serde_json::Value,
    ) -> Result<String> {
        let stream_key = format!("{}{}", self.stream_prefix, envelope.recipient);

        // Serialize envelope and payload
        let fields = vec![
            ("envelope", serde_json::to_string(&envelope)?),
            ("payload", serde_json::to_string(&payload)?),
        ];

        // Add to stream
        let message_id: String = self.redis.xadd(&stream_key, "*", &fields).await?;

        info!("Published message {} to stream {}", message_id, stream_key);

        // Also publish to audit stream for compliance
        let audit_key = format!("{}audit", self.stream_prefix);
        let _: String = self.redis.xadd(&audit_key, "*", &fields).await?;

        Ok(message_id)
    }

    /// Subscribe to an agent's stream
    pub async fn subscribe(
        &mut self,
        agent_id: &str,
        last_id: &str,
    ) -> Result<Vec<(Envelope, serde_json::Value)>> {
        let stream_key = format!("{}{}", self.stream_prefix, agent_id);

        // Read from stream
        let result: streams::StreamReadReply = self
            .redis
            .xread_options(
                &[&stream_key],
                &[last_id],
                &streams::StreamReadOptions::default()
                    .count(10) // Read up to 10 messages at a time
                    .block(1000), // Block for 1 second
            )
            .await?;

        let mut messages = Vec::new();

        for stream in result.keys {
            for message in stream.ids {
                // Extract envelope and payload
                if let Some(envelope_str) = message.map.get("envelope") {
                    if let Some(payload_str) = message.map.get("payload") {
                        if let redis::Value::BulkString(envelope_bytes) = envelope_str {
                            if let redis::Value::BulkString(payload_bytes) = payload_str {
                                let envelope_json = String::from_utf8_lossy(envelope_bytes);
                                let payload_json = String::from_utf8_lossy(payload_bytes);

                                if let Ok(envelope) =
                                    serde_json::from_str::<Envelope>(&envelope_json)
                                {
                                    if let Ok(payload) =
                                        serde_json::from_str::<serde_json::Value>(&payload_json)
                                    {
                                        messages.push((envelope, payload));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(messages)
    }

    /// Request-response pattern with timeout
    pub async fn request(
        &mut self,
        envelope: &Envelope,
        payload: &serde_json::Value,
        timeout_ms: u64,
    ) -> Result<(Envelope, serde_json::Value)> {
        // Create response stream for this request
        let response_stream = format!("{}response:{}", self.stream_prefix, envelope.message_id);

        // Publish the request
        self.publish(envelope, payload).await?;

        // Wait for response with timeout
        let start = std::time::Instant::now();
        let mut last_id = "$".to_string();

        while start.elapsed().as_millis() < timeout_ms as u128 {
            let result: streams::StreamReadReply = self
                .redis
                .xread_options(
                    &[&response_stream],
                    &[&last_id],
                    &streams::StreamReadOptions::default().count(1).block(100), // Check every 100ms
                )
                .await?;

            for stream in result.keys {
                for message in stream.ids {
                    // Extract response
                    if let Some(envelope_str) = message.map.get("envelope") {
                        if let Some(payload_str) = message.map.get("payload") {
                            if let redis::Value::BulkString(envelope_bytes) = envelope_str {
                                if let redis::Value::BulkString(payload_bytes) = payload_str {
                                    let envelope_json = String::from_utf8_lossy(envelope_bytes);
                                    let payload_json = String::from_utf8_lossy(payload_bytes);

                                    if let Ok(response_envelope) =
                                        serde_json::from_str::<Envelope>(&envelope_json)
                                    {
                                        if let Ok(response_payload) =
                                            serde_json::from_str::<serde_json::Value>(&payload_json)
                                        {
                                            // Clean up response stream
                                            let _: () = self.redis.del(&response_stream).await?;
                                            return Ok((response_envelope, response_payload));
                                        }
                                    }
                                }
                            }
                        }
                    }

                    last_id = message.id;
                }
            }
        }

        Err(anyhow::anyhow!("Request timeout after {}ms", timeout_ms))
    }

    /// Register an agent in the registry
    pub async fn register_agent(
        &mut self,
        agent_id: &str,
        capabilities: Vec<String>,
    ) -> Result<()> {
        let key = format!("agent:registry:{}", agent_id);

        let data = serde_json::json!({
            "id": agent_id,
            "capabilities": capabilities,
            "registered_at": chrono::Utc::now(),
            "status": "active"
        });

        self.redis
            .set::<_, _, ()>(&key, serde_json::to_string(&data)?)
            .await?;

        // Add to capabilities index
        for capability in capabilities {
            let cap_key = format!("agent:capability:{}", capability);
            self.redis.sadd::<_, _, ()>(&cap_key, agent_id).await?;
        }

        info!("Registered agent {} in registry", agent_id);
        Ok(())
    }

    /// Find agents by capability
    pub async fn find_agents_by_capability(&mut self, capability: &str) -> Result<Vec<String>> {
        let cap_key = format!("agent:capability:{}", capability);
        let agents: Vec<String> = self.redis.smembers(&cap_key).await?;
        Ok(agents)
    }
}
