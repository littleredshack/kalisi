/// CSP Style Collection Handler for Development
/// 
/// This module helps collect Angular Material's dynamic styles during development
/// to build a comprehensive hash allowlist for production.

use axum::{
    extract::State,
    response::IntoResponse,
    Json,
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use crate::state::AppState;
use crate::csp_styles;

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct CollectStylesRequest {
    styles: Vec<String>,
}

#[derive(Debug, Serialize)]
#[allow(dead_code)]
pub struct CollectStylesResponse {
    message: String,
    new_styles_count: usize,
    total_styles_count: usize,
}

/// Collect Angular Material styles during development
#[cfg(debug_assertions)]
pub async fn collect_styles(
    State(_state): State<AppState>,
    Json(request): Json<CollectStylesRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut registry = csp_styles::get_registry().write().unwrap();
    
    let mut new_styles_count = 0;
    
    for style in request.styles {
        // Normalize the style (trim whitespace, etc.)
        let normalized_style = style.trim();
        
        // Calculate hash
        let hash = csp_styles::StyleHashRegistry::calculate_style_hash(normalized_style);
        
        // Check if it's already in the registry
        if !registry.is_hash_allowed(&hash) {
            registry.add_style_hash(normalized_style);
            new_styles_count += 1;
            
            tracing::info!(
                "New Angular Material style discovered: {} -> {}",
                normalized_style,
                hash
            );
        }
    }
    
    let total_styles_count = registry.get_csp_hashes().len();
    
    let response = CollectStylesResponse {
        message: format!("Collected {} new styles", new_styles_count),
        new_styles_count,
        total_styles_count,
    };
    
    Ok(Json(response))
}

/// Export collected style hashes for production configuration
#[cfg(debug_assertions)]
pub async fn export_style_hashes(
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let registry = csp_styles::get_registry().read().unwrap();
    let hashes = registry.get_csp_hashes();
    
    let export_data = serde_json::json!({
        "style_hashes": hashes,
        "count": hashes.len(),
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "note": "Add these hashes to your production CSP configuration"
    });
    
    Ok(Json(export_data))
}

/// Get CSP violation statistics
#[allow(dead_code)]
pub async fn get_csp_stats(
    State(_state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let registry = csp_styles::get_registry().read().unwrap();
    let violations = registry.get_recent_violations(100);
    
    let stats = serde_json::json!({
        "total_allowed_hashes": registry.get_csp_hashes().len(),
        "recent_violations_count": violations.len(),
        "recent_violations": violations.iter().map(|v| {
            serde_json::json!({
                "timestamp": v.timestamp.to_rfc3339(),
                "style_content": v.style_content,
                "source": v.source,
                "user_agent": v.user_agent,
            })
        }).collect::<Vec<_>>(),
    });
    
    Ok(Json(stats))
}