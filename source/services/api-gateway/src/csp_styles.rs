#![allow(dead_code)]
use once_cell::sync::Lazy;
/// CSP Style Hash Management for Financial Services Compliance
///
/// This module provides a secure way to handle Angular Material's dynamic styles
/// while maintaining strict CSP compliance for financial services.
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::sync::RwLock;

/// Global registry of allowed style hashes
static STYLE_HASH_REGISTRY: Lazy<RwLock<StyleHashRegistry>> =
    Lazy::new(|| RwLock::new(StyleHashRegistry::new()));

/// Registry for managing allowed style hashes
#[derive(Debug, Clone)]
pub struct StyleHashRegistry {
    /// SHA-256 hashes of allowed inline styles
    allowed_hashes: HashSet<String>,
    /// Whether to allow Angular Material's known patterns
    #[allow(dead_code)]
    allow_material_patterns: bool,
    /// Violation tracking for monitoring
    violations: Vec<CspViolation>,
}

#[derive(Debug, Clone)]
pub struct CspViolation {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub style_content: String,
    pub source: String,
    pub user_agent: Option<String>,
}

impl StyleHashRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            allowed_hashes: HashSet::new(),
            allow_material_patterns: true,
            violations: Vec::new(),
        };

        // Pre-populate with known Angular Material style patterns
        registry.add_angular_material_hashes();

        registry
    }

    /// Add known Angular Material and Monaco Editor style hashes
    fn add_angular_material_hashes(&mut self) {
        // Common Angular Material inline styles (examples)
        let known_styles = vec![
            // Ripple effect styles
            "position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; border-radius: inherit; overflow: hidden;",
            // CDK overlay styles
            "position: fixed; top: 0; left: 0; height: 100%; width: 100%;",
            // Material button focus styles
            "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;",
            // Dialog backdrop
            "position: fixed; top: 0; bottom: 0; left: 0; right: 0; z-index: 1000; background-color: rgba(0, 0, 0, 0.32);",
            // Tooltip positioning
            "position: absolute; pointer-events: none; z-index: 1500;",
        ];

        for style in known_styles {
            self.add_style_hash(style);
        }

        // Add Monaco Editor required style hashes (extracted from CSP violations)
        self.add_monaco_editor_hashes();
    }

    /// Add Monaco Editor required style hashes for CSP compliance
    fn add_monaco_editor_hashes(&mut self) {
        // Monaco Editor specific style hashes extracted from browser CSP violations
        let monaco_hashes = vec![
            "sha256-Iv7z7CKfl/FYLpsREshFme5hbt9d2tt5Ku9MODKjirM=",
            "sha256-yc+giXc8UdXe6VWwedSn907NHYEVNVkFr6zCVRlcBjc=",
            "sha256-CUr2/nDTRxiHA+SfEPx1Wp4cgqY8LbiB5nTGF+QkGmU=",
            "sha256-DNZrVDWDsOLjYnOQ2E2tq7OIosyNLfBDcLuoNqGotlQ=",
            "sha256-4JY7WOUi6rfC8NDTfcLIwpBvl3qQzUDhrU66NSbPF04=",
            "sha256-U02twb0L5xfisL/1GBhoyOpzRrEM7QEc6hK3WIEasEE=",
            "sha256-S+FvvqPzTjaStAKMKQOuctE0oTGTS9/JVhXk5N1/Pn8=",
            "sha256-S14u3Cd1e3lOUYJ+DNIpu4VEG9J8ZABamjGAR+xtR7I=",
            "sha256-Pqp3d3ECNXLyWsIYP2705qtqenMiubHRShIQi/oQeD4=",
        ];

        let monaco_count = monaco_hashes.len();

        // Add Monaco hashes directly to registry
        for hash in monaco_hashes {
            self.allowed_hashes.insert(hash.to_string());
        }

        tracing::info!(
            "Added {} Monaco Editor style hashes to CSP registry",
            monaco_count
        );
    }

    /// Calculate SHA-256 hash for a style string
    pub fn calculate_style_hash(style: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(style.as_bytes());
        let result = hasher.finalize();
        use base64::Engine;
        format!(
            "sha256-{}",
            base64::engine::general_purpose::STANDARD.encode(result)
        )
    }

    /// Add a style hash to the registry
    pub fn add_style_hash(&mut self, style: &str) {
        let hash = Self::calculate_style_hash(style);
        self.allowed_hashes.insert(hash);
    }

    /// Check if a style hash is allowed
    pub fn is_hash_allowed(&self, hash: &str) -> bool {
        self.allowed_hashes.contains(hash)
    }

    /// Get all allowed hashes for CSP header
    pub fn get_csp_hashes(&self) -> Vec<String> {
        self.allowed_hashes
            .iter()
            .map(|h| format!("'{}'", h))
            .collect()
    }

    /// Record a CSP violation
    pub fn record_violation(&mut self, violation: CspViolation) {
        // Log for monitoring before moving the violation
        tracing::warn!(
            "CSP Style Violation: {} from {}",
            violation.style_content,
            violation.source
        );

        self.violations.push(violation);
    }

    /// Get recent violations for analysis
    pub fn get_recent_violations(&self, limit: usize) -> Vec<&CspViolation> {
        let len = self.violations.len();
        self.violations
            .iter()
            .skip(len.saturating_sub(limit))
            .collect()
    }
}

/// Get the global style hash registry
pub fn get_registry() -> &'static RwLock<StyleHashRegistry> {
    &STYLE_HASH_REGISTRY
}

/// Build CSP style-src directive with hashes
pub fn build_style_src_with_hashes(include_unsafe_hashes: bool) -> String {
    let registry = get_registry().read().unwrap();
    let mut sources = vec!["'self'".to_string()];

    // Add external style sources
    sources.push("https://cdn.tailwindcss.com".to_string());
    sources.push("https://fonts.googleapis.com".to_string());

    // Add all registered style hashes
    sources.extend(registry.get_csp_hashes());

    // In development or as fallback, include 'unsafe-hashes'
    // This allows event handler attributes but not style elements
    if include_unsafe_hashes {
        sources.push("'unsafe-hashes'".to_string());
    }

    format!("style-src {}", sources.join(" "))
}

/// Middleware to intercept and analyze Angular responses
pub async fn analyze_angular_styles(html: &str) -> HashSet<String> {
    let mut found_styles = HashSet::new();

    // Pattern to find inline styles in Angular components
    let style_regex = regex::Regex::new(r#"style="([^"]+)""#).unwrap();

    for cap in style_regex.captures_iter(html) {
        if let Some(style) = cap.get(1) {
            let style_content = style.as_str();
            let hash = StyleHashRegistry::calculate_style_hash(style_content);

            // Log discovered styles for development
            tracing::debug!("Found inline style: {} -> {}", style_content, &hash);

            found_styles.insert(hash);
        }
    }

    found_styles
}

/// CSP Report Handler Enhancement
#[derive(serde::Deserialize)]
pub struct EnhancedCspReport {
    #[serde(rename = "violated-directive")]
    pub violated_directive: String,
    #[serde(rename = "blocked-uri")]
    pub blocked_uri: Option<String>,
    #[serde(rename = "line-number")]
    pub line_number: Option<u32>,
    #[serde(rename = "column-number")]
    pub column_number: Option<u32>,
    #[serde(rename = "source-file")]
    pub source_file: Option<String>,
    #[serde(rename = "script-sample")]
    pub script_sample: Option<String>,
}

/// Process CSP violation reports and extract style patterns
pub fn process_csp_violation(report: &EnhancedCspReport, user_agent: Option<String>) {
    if report.violated_directive.starts_with("style-src") {
        if let Some(sample) = &report.script_sample {
            let mut registry = get_registry().write().unwrap();
            registry.record_violation(CspViolation {
                timestamp: chrono::Utc::now(),
                style_content: sample.clone(),
                source: report.source_file.clone().unwrap_or_default(),
                user_agent,
            });

            // In development, optionally auto-add new styles
            #[cfg(debug_assertions)]
            {
                tracing::info!("Auto-adding style hash for: {}", sample);
                registry.add_style_hash(sample);
            }
        }
    }
}

/// Generate CSP meta tag for Angular index.html
pub fn generate_csp_meta_tag(nonce: &str) -> String {
    let style_src = build_style_src_with_hashes(false);
    let script_src = format!(
        "script-src 'self' 'nonce-{}' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://unpkg.com https://d3js.org",
        nonce
    );

    format!(
        r#"<meta http-equiv="Content-Security-Policy" content="default-src 'self'; {}; {}; img-src 'self' data: https: http: https://api.qrserver.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss: ws:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; block-all-mixed-content; report-uri /csp-report; report-to csp-endpoint;">"#,
        script_src, style_src
    )
}

/// Build style extraction script for development
pub fn build_style_extractor_script() -> &'static str {
    r#"
    // Angular Material Style Extractor (Development Only)
    (function() {
        const styles = new Set();
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const style = mutation.target.getAttribute('style');
                    if (style) {
                        styles.add(style);
                        console.debug('[CSP] Found style:', style);
                    }
                }
            });
        });
        
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['style'],
            subtree: true
        });
        
        // Report collected styles periodically
        setInterval(() => {
            if (styles.size > 0) {
                fetch('/api/csp/collect-styles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ styles: Array.from(styles) })
                });
                styles.clear();
            }
        }, 5000);
    })();
    "#
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_style_hash_calculation() {
        let style = "color: red;";
        let hash = StyleHashRegistry::calculate_style_hash(style);
        assert!(hash.starts_with("sha256-"));
        assert!(hash.len() > 10);
    }

    #[test]
    fn test_registry_operations() {
        let mut registry = StyleHashRegistry::new();
        let style = "display: none;";

        registry.add_style_hash(style);
        let hash = StyleHashRegistry::calculate_style_hash(style);
        let hash_with_prefix = format!("'{}'", hash);

        assert!(registry.get_csp_hashes().contains(&hash_with_prefix));
    }

    #[test]
    fn test_style_src_generation() {
        let style_src = build_style_src_with_hashes(false);
        assert!(style_src.contains("'self'"));
        assert!(style_src.contains("https://fonts.googleapis.com"));
        assert!(!style_src.contains("'unsafe-inline'"));
    }
}
