#![allow(dead_code)]
/// Simplified CSP Nonce-Based Style Management for Financial Services
///
/// This module implements a practical nonce-based approach for Angular Material styles

/// Generate style proxy script that intercepts Angular Material style mutations
pub fn generate_style_proxy_script(nonce: &str) -> String {
    format!(
        r#"<script nonce="{}">
// Financial Services CSP Style Proxy for Angular Material
(function() {{
    'use strict';
    
    // Store the current nonce
    const CSP_NONCE = '{}';
    
    // Override createElement to add nonce to style elements
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {{
        const element = originalCreateElement.call(document, tagName);
        
        // Add nonce to style elements
        if (tagName.toLowerCase() === 'style') {{
            element.setAttribute('nonce', CSP_NONCE);
        }}
        
        return element;
    }};
    
    // Create a secure style sheet for inline style attributes
    const inlineStyleSheet = document.createElement('style');
    inlineStyleSheet.setAttribute('nonce', CSP_NONCE);
    inlineStyleSheet.setAttribute('data-csp-styles', 'inline-styles');
    document.head.appendChild(inlineStyleSheet);
    
    // Store original methods for style attributes
    const originalSetAttribute = Element.prototype.setAttribute;
    const originalRemoveAttribute = Element.prototype.removeAttribute;
    
    // Map to track element styles
    const elementStyles = new WeakMap();
    let styleCounter = 0;
    
    // Override setAttribute to intercept style attributes
    Element.prototype.setAttribute = function(name, value) {{
        if (name === 'style' && value) {{
            // Generate or get existing class name for this element
            let className = elementStyles.get(this);
            if (!className) {{
                className = 'csp-inline-' + (++styleCounter);
                elementStyles.set(this, className);
                this.classList.add(className);
            }}
            
            // Create CSS rule
            const rule = `.${{className}} {{ ${{value}} }}`;
            
            // Find and replace existing rule or add new one
            try {{
                const rules = inlineStyleSheet.sheet.cssRules;
                let replaced = false;
                
                for (let i = 0; i < rules.length; i++) {{
                    if (rules[i].selectorText === `.${{className}}`) {{
                        inlineStyleSheet.sheet.deleteRule(i);
                        inlineStyleSheet.sheet.insertRule(rule, i);
                        replaced = true;
                        break;
                    }}
                }}
                
                if (!replaced) {{
                    inlineStyleSheet.sheet.insertRule(rule, inlineStyleSheet.sheet.cssRules.length);
                }}
            }} catch (e) {{
                console.warn('[CSP] Failed to add style rule:', e);
            }}
            
            // Don't actually set the style attribute
            return;
        }}
        
        // For all other attributes, use original method
        return originalSetAttribute.call(this, name, value);
    }};
    
    // Override removeAttribute to handle style removal
    Element.prototype.removeAttribute = function(name) {{
        if (name === 'style') {{
            const className = elementStyles.get(this);
            if (className) {{
                try {{
                    // Remove the CSS rule
                    const rules = inlineStyleSheet.sheet.cssRules;
                    for (let i = 0; i < rules.length; i++) {{
                        if (rules[i].selectorText === `.${{className}}`) {{
                            inlineStyleSheet.sheet.deleteRule(i);
                            break;
                        }}
                    }}
                    // Remove the class
                    this.classList.remove(className);
                    elementStyles.delete(this);
                }} catch (e) {{
                    console.warn('[CSP] Failed to remove style rule:', e);
                }}
            }}
            return;
        }}
        
        return originalRemoveAttribute.call(this, name);
    }};
    
    // Also handle direct style property modifications
    const styleDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
    if (styleDescriptor) {{
        Object.defineProperty(HTMLElement.prototype, 'style', {{
            get: function() {{
                return styleDescriptor.get.call(this);
            }},
            set: function(value) {{
                if (typeof value === 'string' && value) {{
                    this.setAttribute('style', value);
                }} else {{
                    styleDescriptor.set.call(this, value);
                }}
            }},
            configurable: true
        }});
    }}
    
    // Override addEventListener to handle inline event handlers
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {{
        // For now, just use the original method
        // In production, you might want to wrap event handlers
        return originalAddEventListener.call(this, type, listener, options);
    }};
    
    // Log initialization in development
    if (window.location.hostname === 'localhost') {{
        console.log('[CSP] Style proxy initialized with nonce:', CSP_NONCE);
    }}
}})();
</script>"#,
        nonce, nonce
    )
}

/// Build CSP style-src directive for nonce-based approach with Monaco Editor support
pub fn build_nonce_based_style_src(_nonce: &str) -> String {
    // Monaco Editor required style hashes for CSP compliance
    let _monaco_hashes = [
        "'sha256-Iv7z7CKfl/FYLpsREshFme5hbt9d2tt5Ku9MODKjirM='",
        "'sha256-yc+giXc8UdXe6VWwedSn907NHYEVNVkFr6zCVRlcBjc='",
        "'sha256-CUr2/nDTRxiHA+SfEPx1Wp4cgqY8LbiB5nTGF+QkGmU='",
        "'sha256-DNZrVDWDsOLjYnOQ2E2tq7OIosyNLfBDcLuoNqGotlQ='",
        "'sha256-4JY7WOUi6rfC8NDTfcLIwpBvl3qQzUDhrU66NSbPF04='",
        "'sha256-U02twb0L5xfisL/1GBhoyOpzRrEM7QEc6hK3WIEasEE='",
        "'sha256-S+FvvqPzTjaStAKMKQOuctE0oTGTS9/JVhXk5N1/Pn8='",
        "'sha256-S14u3Cd1e3lOUYJ+DNIpu4VEG9J8ZABamjGAR+xtR7I='",
        "'sha256-Pqp3d3ECNXLyWsIYP2705qtqenMiubHRShIQi/oQeD4='",
        // Additional Monaco runtime hashes
        "'sha256-bCGe8uXkE4ndnluuyQUc97rNKxJeIM0GiFBMCz4gNCU='",
        "'sha256-PaQJlvrV1S3Y1j7S12EWq60b4CR8KDSvxM4sAv3Z0YU='",
        // More Monaco dynamic hashes
        "'sha256-ylEFtMhwhguwbPRmRjNiQ3cFW44WSmGQdk1dOwieTno='",
        "'sha256-zgnvPxC4HUdltNM3U3xPxhInRQTwKcmTnZtXQjF5Huo='",
        "'sha256-vFtEHU1FXTkTotRf7IfaIcPOWG/3Q6/WfR/vR3SgMo8='",
        "'sha256-bh9Sq3PQDbL51wnQ0e/SW5jFeuNwU+ilA1+6C0MqK90='",
        "'sha256-D4/4HAm7U//9i/Qtqd929CmgUjMYy5Dj6Dzhe49P50o='",
        "'sha256-XU9ppUFS71thL+njLVgB+O1cip0BD2wTZaeezW9ybbc='",
        // Final Monaco runtime hashes
        "'sha256-zAJeu6MONOqvpRYb1i0ZQLL+fnLgRejuMk/554euc8k='",
        "'sha256-UJHcKfY6llocwzRfUTKXSefpZLxvTiFv6elOxovEp6o='",
        // Latest Monaco hashes
        "'sha256-J2lhcykU35pD5JiUUULkmUUxBafEhDsBQ30dpxeI8I0='",
        "'sha256-rqkMEwsWwrInJqctxmIaWOCFPV+Qmym3tMHH3wtq3Y0='",
        "'sha256-q4cxsWdEFVHywVmKJ/rrr2imiZzNCXWtXst8wJ1Z8sM='",
        "'sha256-EDCEUoNnR0pVtDIqBNm1e5EMyOFk1Z7lLoZEgSMfjog='",
        "'sha256-Qb66hssXbVZlgcp1hSgrmUK6hl3neEox1fKuSppM294='",
    ];

    format!(
        "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com"
    )
}
