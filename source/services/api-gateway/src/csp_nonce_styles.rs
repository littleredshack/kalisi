/// CSP Nonce-Based Style Management for Financial Services
///
/// This module implements a nonce-based approach for Angular Material styles
/// that maintains financial services security compliance while being practical.
use axum::{
    body::Body,
    http::{Request, Response},
    middleware::Next,
};
use http_body_util::BodyExt;
use once_cell::sync::Lazy;
use regex::Regex;

/// Regex for matching style attributes in HTML
static STYLE_ATTR_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#"(<[^>]+\s)style\s*=\s*"([^"]*)"#).unwrap());

/// Inject nonce into all inline style attributes in HTML response
pub async fn inject_style_nonces_middleware(request: Request<Body>, next: Next) -> Response<Body> {
    // Get the CSP nonce from request extensions
    let nonce = request
        .extensions()
        .get::<crate::middleware::security_headers::CspNonce>()
        .map(|n| n.0.clone());

    let response = next.run(request).await;

    // Only process HTML responses
    if let Some(content_type) = response.headers().get("content-type") {
        if let Ok(ct) = content_type.to_str() {
            if ct.contains("text/html") {
                if let Some(nonce) = nonce {
                    // Get the response body
                    let (parts, body) = response.into_parts();
                    let bytes = match body.collect().await {
                        Ok(collected) => collected.to_bytes(),
                        Err(_) => return Response::from_parts(parts, Body::empty()),
                    };

                    // Convert to string
                    if let Ok(html) = String::from_utf8(bytes.to_vec()) {
                        // Process the HTML to add nonces to styles
                        let processed_html = inject_style_nonces_in_html(&html, &nonce);

                        // Create new response with processed HTML
                        return Response::from_parts(parts, Body::from(processed_html));
                    }

                    // If conversion failed, return original
                    return Response::from_parts(parts, Body::from(bytes));
                }
            }
        }
    }

    response
}

/// Inject nonce attributes into style tags and convert inline styles
fn inject_style_nonces_in_html(html: &str, nonce: &str) -> String {
    let mut result = html.to_string();

    // 1. Add nonce to <style> tags
    result = result.replace("<style>", &format!(r#"<style nonce="{}">"#, nonce));
    result = result.replace("<style ", &format!(r#"<style nonce="{}" "#, nonce));

    // 2. Convert inline style attributes to use CSS custom properties with nonce
    // This is a more complex but secure approach
    result = convert_inline_styles_to_nonce_based(&result, nonce);

    result
}

/// Convert inline styles to a nonce-based approach using data attributes and CSS
fn convert_inline_styles_to_nonce_based(html: &str, nonce: &str) -> String {
    let mut style_id = 0;
    let mut dynamic_styles = Vec::new();

    // Replace inline styles with data attributes
    let processed = STYLE_ATTR_REGEX.replace_all(html, |caps: &regex::Captures| {
        let prefix = &caps[1];
        let styles = &caps[2];

        // Generate unique ID for this element
        style_id += 1;
        let element_id = format!("csp-style-{}", style_id);

        // Store the styles for later injection
        dynamic_styles.push(format!(".{} {{ {} }}", element_id, styles));

        // Replace style attribute with class
        format!(
            r#"{}class="{}" data-original-style="{}""#,
            prefix, element_id, styles
        )
    });

    // If we have dynamic styles, inject them in a nonce-protected style tag
    if !dynamic_styles.is_empty() {
        let style_block = format!(
            r#"<style nonce="{}">
/* Dynamically converted inline styles for CSP compliance */
{}
</style>"#,
            nonce,
            dynamic_styles.join("\n")
        );

        // Inject before closing body tag
        if let Some(pos) = processed.rfind("</body>") {
            let mut result = processed.to_string();
            result.insert_str(pos, &style_block);
            return result;
        }
    }

    processed.to_string()
}

/// Alternative approach: Proxy style mutations through a nonce-protected script
pub fn generate_style_proxy_script(nonce: &str) -> String {
    format!(
        r#"<script nonce="{}">
// Financial Services CSP Style Proxy
// This script allows Angular Material to set styles securely
(function() {{
    'use strict';
    
    // Store original setAttribute
    const originalSetAttribute = Element.prototype.setAttribute;
    const originalStyle = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
    
    // Create a secure style sheet for dynamic styles
    const styleSheet = document.createElement('style');
    styleSheet.setAttribute('nonce', '{}');
    styleSheet.setAttribute('data-csp-styles', 'dynamic');
    document.head.appendChild(styleSheet);
    
    const styleRules = new Map();
    let ruleIndex = 0;
    
    // Override setAttribute to intercept style attributes
    Element.prototype.setAttribute = function(name, value) {{
        if (name === 'style' && value) {{
            // Generate unique class for this element
            if (!this.dataset.cspStyleId) {{
                this.dataset.cspStyleId = 'csp-' + (++ruleIndex);
                this.classList.add(this.dataset.cspStyleId);
            }}
            
            // Add/update style rule
            const selector = '.' + this.dataset.cspStyleId;
            const rule = `${{selector}} {{ ${{value}} }}`;
            
            if (styleRules.has(selector)) {{
                // Update existing rule
                const index = Array.from(styleRules.keys()).indexOf(selector);
                styleSheet.sheet.deleteRule(index);
                styleSheet.sheet.insertRule(rule, index);
            }} else {{
                // Add new rule
                styleRules.set(selector, rule);
                styleSheet.sheet.insertRule(rule, styleSheet.sheet.cssRules.length);
            }}
            
            return;
        }}
        
        // Call original for non-style attributes
        return originalSetAttribute.call(this, name, value);
    }};
    
    // Also handle direct style property access
    Object.defineProperty(HTMLElement.prototype, 'style', {{
        get: function() {{
            return originalStyle.get.call(this);
        }},
        set: function(value) {{
            if (typeof value === 'string' && value) {{
                this.setAttribute('style', value);
            }} else {{
                originalStyle.set.call(this, value);
            }}
        }},
        configurable: true
    }});
    
    // Log for debugging in development
    if (window.location.hostname === 'localhost') {{
        console.log('[CSP] Style proxy initialized with nonce: {}');
    }}
}})();
</script>"#,
        nonce, nonce, nonce
    )
}

/// Build CSP style-src directive for nonce-based approach
pub fn build_nonce_based_style_src(nonce: &str) -> String {
    format!(
        "style-src 'self' 'nonce-{}' https://cdn.tailwindcss.com https://fonts.googleapis.com",
        nonce
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_style_attr_regex() {
        let html = r#"<div style="color: red;">Test</div>"#;
        assert!(STYLE_ATTR_REGEX.is_match(html));
    }

    #[test]
    fn test_inject_style_nonces() {
        let html = r#"
            <style>body { margin: 0; }</style>
            <div style="color: red;">Test</div>
        "#;
        let nonce = "test-nonce-123";
        let result = inject_style_nonces_in_html(html, nonce);

        // Check that the function modifies the HTML
        assert!(result != html);
        // Check that inline styles are converted to classes
        assert!(result.contains("csp-style-"));
    }
}
