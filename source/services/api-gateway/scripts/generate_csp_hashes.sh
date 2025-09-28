#!/bin/bash
# Generate CSP Style Hashes for Production
# This script helps extract Angular Material style patterns and generate CSP hashes

set -e

echo "🔐 CSP Style Hash Generator for Financial Services Compliance"
echo "============================================================"

# Function to generate SHA256 hash in CSP format
generate_csp_hash() {
    local style="$1"
    echo -n "$style" | openssl dgst -sha256 -binary | base64
}

# Known Angular Material inline styles
declare -a ANGULAR_MATERIAL_STYLES=(
    # Ripple effect styles
    "position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; border-radius: inherit; overflow: hidden;"
    "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; border-radius: inherit; overflow: hidden;"
    
    # CDK overlay styles
    "position: fixed; top: 0; left: 0; height: 100%; width: 100%;"
    "position: fixed; top: 0; left: 0; width: 100%; height: 100%; -webkit-tap-highlight-color: transparent;"
    
    # Material button focus styles  
    "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: none;"
    
    # Dialog backdrop
    "position: fixed; top: 0; bottom: 0; left: 0; right: 0; z-index: 1000; background-color: rgba(0, 0, 0, 0.32);"
    
    # Tooltip positioning
    "position: absolute; pointer-events: none; z-index: 1500;"
    
    # Snackbar container
    "position: fixed; z-index: 1000; pointer-events: none;"
    
    # Menu positioning
    "position: absolute; top: 0; left: 0; transform-origin: top left;"
    
    # Select panel
    "max-height: 256px; overflow: auto; padding: 0;"
    
    # Progress spinner
    "display: inline-block; height: 100px; width: 100px;"
    
    # Slide toggle
    "display: inline-block; height: 24px; line-height: 24px; max-width: 100%; position: relative;"
)

echo "Generating CSP hashes for ${#ANGULAR_MATERIAL_STYLES[@]} known Angular Material styles..."
echo

# Generate output file
OUTPUT_FILE="csp_style_hashes.json"
echo "{" > "$OUTPUT_FILE"
echo '  "generated": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",' >> "$OUTPUT_FILE"
echo '  "style_hashes": [' >> "$OUTPUT_FILE"

# Process each style
for i in "${!ANGULAR_MATERIAL_STYLES[@]}"; do
    style="${ANGULAR_MATERIAL_STYLES[$i]}"
    hash=$(generate_csp_hash "$style")
    csp_hash="'sha256-$hash'"
    
    echo "Style: ${style:0:50}..."
    echo "Hash:  $csp_hash"
    echo
    
    # Add to JSON file
    if [ $i -eq $((${#ANGULAR_MATERIAL_STYLES[@]} - 1)) ]; then
        echo "    \"$csp_hash\"" >> "$OUTPUT_FILE"
    else
        echo "    \"$csp_hash\"," >> "$OUTPUT_FILE"
    fi
done

echo '  ],' >> "$OUTPUT_FILE"
echo '  "csp_directive": "style-src '\''self'\'' '$(cat "$OUTPUT_FILE" | grep sha256 | tr '\n' ' ' | sed 's/,//g' | sed 's/"//g')'https://cdn.tailwindcss.com https://fonts.googleapis.com;"' >> "$OUTPUT_FILE"
echo '}' >> "$OUTPUT_FILE"

echo "✅ Generated $OUTPUT_FILE with CSP hashes"
echo
echo "Production CSP directive:"
echo "------------------------"
cat "$OUTPUT_FILE" | grep csp_directive | cut -d'"' -f4
echo
echo "To use in production:"
echo "1. Copy the hashes to your Rust CSP configuration"
echo "2. Remove 'unsafe-inline' from style-src"
echo "3. Test thoroughly with your Angular application"
echo "4. Monitor CSP violations at /csp-report"