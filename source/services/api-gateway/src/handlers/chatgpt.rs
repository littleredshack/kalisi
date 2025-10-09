use axum::{extract::State, http::StatusCode, response::Json, Json as JsonExtractor};
use serde::{Deserialize, Serialize};
use std::env;
use tracing::{error, info, warn};

use crate::logging::LogCategory;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i32>,
    #[allow(dead_code)] // Stream support for future phases
    pub stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub content: String,
    pub full_content: Option<String>,
    pub done: bool,
    pub error: Option<String>,
    pub model: String,
    pub tokens_used: Option<i32>,
}

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f64,
    max_tokens: i32,
    #[allow(dead_code)] // Stream support for future phases
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
    usage: Option<OpenAIUsage>,
    model: String,
}

#[derive(Debug, Deserialize)]
struct OpenAIChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct OpenAIUsage {
    total_tokens: i32,
}

pub async fn handle_chat_request(
    State(app_state): State<AppState>,
    JsonExtractor(request): JsonExtractor<ChatRequest>,
) -> Result<Json<ChatResponse>, StatusCode> {
    info!("🔥 CHATGPT HANDLER CALLED - Request received");
    info!("🔥 Request details: {:?}", request);

    // Get ChatGPT configuration from environment
    let api_key = match env::var("CHATGPT_API_KEY") {
        Ok(key) if !key.is_empty() => key,
        _ => {
            error!("CHATGPT_API_KEY not configured");
            return Ok(Json(ChatResponse {
                content: String::new(),
                full_content: None,
                done: true,
                error: Some(
                    "ChatGPT API key not configured. Please set CHATGPT_API_KEY in .env"
                        .to_string(),
                ),
                model: "none".to_string(),
                tokens_used: None,
            }));
        }
    };

    let model = env::var("CHATGPT_MODEL").unwrap_or_else(|_| "gpt-4o".to_string());
    let api_url = env::var("CHATGPT_API_URL")
        .unwrap_or_else(|_| "https://api.openai.com/v1/chat/completions".to_string());

    // Validate request
    if request.messages.is_empty() {
        warn!("Empty message list in chat request");
        return Ok(Json(ChatResponse {
            content: String::new(),
            full_content: None,
            done: true,
            error: Some("No messages provided".to_string()),
            model: model.clone(),
            tokens_used: None,
        }));
    }

    // Log chat request (without sensitive content)
    app_state
        .logger
        .info(
            LogCategory::Api,
            &format!(
                "ChatGPT request: model={}, messages={}",
                model,
                request.messages.len()
            ),
            std::collections::HashMap::new(),
        )
        .await;

    // Prepare OpenAI request
    let openai_request = OpenAIRequest {
        model: model.clone(),
        messages: request.messages,
        temperature: request.temperature.unwrap_or(0.7),
        max_tokens: request.max_tokens.unwrap_or(1000),
        stream: false, // For now, implement non-streaming first
    };

    // Create HTTP client
    let client = reqwest::Client::new();

    // Make request to OpenAI API
    let response = match client
        .post(&api_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&openai_request)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            error!("Failed to send request to OpenAI: {}", e);
            return Ok(Json(ChatResponse {
                content: String::new(),
                full_content: None,
                done: true,
                error: Some(format!("Failed to connect to ChatGPT: {}", e)),
                model: model.clone(),
                tokens_used: None,
            }));
        }
    };

    // Check response status
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        error!("OpenAI API error {}: {}", status, error_text);

        return Ok(Json(ChatResponse {
            content: String::new(),
            full_content: None,
            done: true,
            error: Some(format!("ChatGPT API error {}: {}", status, error_text)),
            model: model.clone(),
            tokens_used: None,
        }));
    }

    // Parse response
    let openai_response: OpenAIResponse = match response.json().await {
        Ok(resp) => resp,
        Err(e) => {
            error!("Failed to parse OpenAI response: {}", e);
            return Ok(Json(ChatResponse {
                content: String::new(),
                full_content: None,
                done: true,
                error: Some("Failed to parse ChatGPT response".to_string()),
                model: model.clone(),
                tokens_used: None,
            }));
        }
    };

    // Extract response content
    let response_content = openai_response
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .unwrap_or_else(|| "No response content".to_string());

    let tokens_used = openai_response.usage.map(|u| u.total_tokens);

    info!("ChatGPT response received, tokens: {:?}", tokens_used);

    // Log successful response
    app_state
        .logger
        .info(
            LogCategory::Api,
            &format!(
                "ChatGPT response: model={}, tokens={:?}, length={}",
                openai_response.model,
                tokens_used,
                response_content.len()
            ),
            std::collections::HashMap::new(),
        )
        .await;

    Ok(Json(ChatResponse {
        content: response_content.clone(),
        full_content: Some(response_content),
        done: true,
        error: None,
        model: openai_response.model,
        tokens_used,
    }))
}
