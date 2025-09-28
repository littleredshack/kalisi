#!/bin/bash

# MSDF Font Atlas Generation Script for Inter Font Family
# This script attempts to generate MSDF atlases using the Node.js tool
# If it fails due to GLIBC issues, use the web tool at https://msdf-bmfont.donmccurdy.com/

echo "🎯 MSDF Font Atlas Generation for Inter Font Family"
echo "=================================================="

# Check if we're in the right directory
if [ ! -f "charset.txt" ]; then
    echo "❌ Error: charset.txt not found. Please run this script from the fonts directory."
    exit 1
fi

# Check if font files exist
if [ ! -f "Inter-Regular.otf" ] || [ ! -f "Inter-Bold.otf" ] || [ ! -f "Inter-Light.otf" ]; then
    echo "❌ Error: Inter font files not found. Please ensure all three font weights are present."
    exit 1
fi

echo "✅ Found all required files"

# Function to generate MSDF for a single font
generate_msdf() {
    local font_file=$1
    local output_name=$2
    
    echo "🔄 Generating MSDF atlas for $font_file..."
    
    npx msdf-bmfont \
        --reuse \
        -o "${output_name}.png" \
        -f json \
        -m 512,512 \
        -s 42 \
        -r 3 \
        -p 1 \
        -t msdf \
        -i charset.txt \
        "$font_file"
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully generated ${output_name}.png and ${output_name}.json"
        return 0
    else
        echo "❌ Failed to generate MSDF for $font_file"
        return 1
    fi
}

echo ""
echo "🚀 Starting MSDF generation..."

# Try to generate all three font atlases
success_count=0

if generate_msdf "Inter-Regular.otf" "inter-regular-msdf"; then
    ((success_count++))
fi

if generate_msdf "Inter-Bold.otf" "inter-bold-msdf"; then
    ((success_count++))
fi

if generate_msdf "Inter-Light.otf" "inter-light-msdf"; then
    ((success_count++))
fi

echo ""
echo "📊 Generation Summary:"
echo "====================="
echo "Successfully generated: $success_count/3 font atlases"

if [ $success_count -eq 3 ]; then
    echo "🎉 All MSDF atlases generated successfully!"
    echo ""
    echo "Generated files:"
    ls -la inter-*-msdf.*
    echo ""
    echo "🔍 Verifying atlas dimensions..."
    for png_file in inter-*-msdf.png; do
        if [ -f "$png_file" ]; then
            dimensions=$(file "$png_file" | grep -o '[0-9]\+ x [0-9]\+' | head -1)
            if [ "$dimensions" = "512 x 512" ]; then
                echo "✅ $png_file: $dimensions (correct)"
            else
                echo "⚠️  $png_file: $dimensions (expected 512 x 512)"
            fi
        fi
    done
    
    echo ""
    echo "🎯 Next Steps:"
    echo "1. Test the atlases in your WebGL application"
    echo "2. Adjust smoothing parameters if needed"
    echo "3. Verify all characters render correctly"
    echo ""
    echo "📖 See webgl-integration-guide.md for implementation details"
    
elif [ $success_count -eq 0 ]; then
    echo "❌ All generations failed (likely GLIBC compatibility issue)"
    echo ""
    echo "🌐 Alternative Solution - Use Web Tool:"
    echo "1. Visit: https://msdf-bmfont.donmccurdy.com/"
    echo "2. Upload each font file (Inter-Regular.otf, Inter-Bold.otf, Inter-Light.otf)"
    echo "3. Use character set from charset.txt:"
    cat charset.txt
    echo "4. Set texture size to 512x512"
    echo "5. Download the generated PNG and JSON files"
    echo "6. Rename them to match the expected pattern:"
    echo "   - inter-regular-msdf.png / .json"
    echo "   - inter-bold-msdf.png / .json"  
    echo "   - inter-light-msdf.png / .json"
    echo ""
    echo "📖 See MSDF_GENERATION_GUIDE.md for detailed instructions"
    
else
    echo "⚠️  Partial success - some generations failed"
    echo ""
    echo "Please check the errors above and either:"
    echo "1. Fix the tool installation issues, or"
    echo "2. Use the web tool for the failed generations"
fi

echo ""
echo "📁 Current directory contents:"
ls -la