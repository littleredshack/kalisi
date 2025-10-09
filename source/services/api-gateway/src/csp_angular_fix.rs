/// Angular-specific CSP fixes for financial services compliance
///
/// This module provides a comprehensive solution for Angular's style injection patterns

/// Generate a comprehensive Angular CSP fix script
pub fn generate_angular_csp_fix_script(nonce: &str) -> String {
    format!(
        r#"<script nonce="{}">
// Angular CSP Fix for Financial Services Compliance
(function() {{
    'use strict';
    
    const CSP_NONCE = '{}';
    
    // Fix 1: Override createElement before anything else loads
    const originalCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName, options) {{
        const element = originalCreateElement(tagName, options);
        
        if (tagName && tagName.toLowerCase() === 'style') {{
            element.setAttribute('nonce', CSP_NONCE);
        }}
        
        return element;
    }};
    
    // Fix 2: Override insertBefore to catch dynamic style insertions
    const originalInsertBefore = Node.prototype.insertBefore;
    Node.prototype.insertBefore = function(newNode, referenceNode) {{
        if (newNode && newNode.tagName === 'STYLE' && !newNode.hasAttribute('nonce')) {{
            newNode.setAttribute('nonce', CSP_NONCE);
        }}
        return originalInsertBefore.call(this, newNode, referenceNode);
    }};
    
    // Fix 3: Override appendChild to catch style appends
    const originalAppendChild = Node.prototype.appendChild;
    Node.prototype.appendChild = function(node) {{
        if (node && node.tagName === 'STYLE' && !node.hasAttribute('nonce')) {{
            node.setAttribute('nonce', CSP_NONCE);
        }}
        return originalAppendChild.call(this, node);
    }};
    
    // Fix 4: Intercept CSSStyleSheet.insertRule for dynamic rules
    if (window.CSSStyleSheet && CSSStyleSheet.prototype.insertRule) {{
        const originalInsertRule = CSSStyleSheet.prototype.insertRule;
        CSSStyleSheet.prototype.insertRule = function(rule, index) {{
            // If this is from a style element without nonce, add it
            if (this.ownerNode && this.ownerNode.tagName === 'STYLE' && !this.ownerNode.hasAttribute('nonce')) {{
                this.ownerNode.setAttribute('nonce', CSP_NONCE);
            }}
            return originalInsertRule.call(this, rule, index);
        }};
    }}
    
    // Fix 5: Handle inline style attributes by converting to classes
    const inlineStyleSheet = document.createElement('style');
    inlineStyleSheet.setAttribute('nonce', CSP_NONCE);
    inlineStyleSheet.setAttribute('data-csp', 'inline-styles');
    
    // Wait for DOM to be ready before appending
    if (document.head) {{
        document.head.appendChild(inlineStyleSheet);
    }} else {{
        document.addEventListener('DOMContentLoaded', function() {{
            document.head.appendChild(inlineStyleSheet);
        }});
    }}
    
    // Map to track inline styles
    const inlineStyleMap = new WeakMap();
    let inlineStyleCounter = 0;
    
    // Override setAttribute for style attributes
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {{
        if (name === 'style' && value && value.trim()) {{
            // Skip if it's already a converted element
            if (this.hasAttribute('data-csp-style')) {{
                return;
            }}
            
            let className = inlineStyleMap.get(this);
            if (!className) {{
                className = 'csp-s-' + (++inlineStyleCounter);
                inlineStyleMap.set(this, className);
                this.classList.add(className);
                this.setAttribute('data-csp-style', className);
            }}
            
            // Add rule to our style sheet
            try {{
                const rule = `.${{className}} {{ ${{value}} }}`;
                const rules = inlineStyleSheet.sheet.cssRules || inlineStyleSheet.sheet.rules;
                let found = false;
                
                // Look for existing rule
                for (let i = 0; i < rules.length; i++) {{
                    if (rules[i].selectorText === `.${{className}}`) {{
                        inlineStyleSheet.sheet.deleteRule(i);
                        inlineStyleSheet.sheet.insertRule(rule, i);
                        found = true;
                        break;
                    }}
                }}
                
                if (!found) {{
                    inlineStyleSheet.sheet.insertRule(rule, rules.length);
                }}
            }} catch (e) {{
                // Fallback: just log the error
                console.warn('[CSP] Could not convert inline style:', e);
            }}
            
            return;
        }}
        
        return originalSetAttribute.call(this, name, value);
    }};
    
    // Handle direct style property access
    try {{
        const originalStyleDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style') 
            || Object.getOwnPropertyDescriptor(Element.prototype, 'style');
            
        if (originalStyleDescriptor) {{
            Object.defineProperty(HTMLElement.prototype, 'style', {{
                get: function() {{
                    return originalStyleDescriptor.get.call(this);
                }},
                set: function(value) {{
                    if (typeof value === 'string') {{
                        this.setAttribute('style', value);
                    }} else {{
                        originalStyleDescriptor.set.call(this, value);
                    }}
                }},
                configurable: true
            }});
        }}
    }} catch (e) {{
        console.warn('[CSP] Could not override style property:', e);
    }}
    
    console.log('[CSP] Angular style fixes loaded with nonce:', CSP_NONCE);
}})();
</script>"#,
        nonce, nonce
    )
}
