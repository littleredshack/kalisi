# MSDF Font Atlas Generation Guide

## Overview
This guide explains how to generate MSDF (Multi-channel Signed Distance Field) font atlases for the EDT2 application using the Inter font family.

## Target Specifications
- **Font Family**: Inter (Regular, Bold, Light)
- **Character Set**: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-_()[]{}`
- **Atlas Size**: 512x512 pixels
- **Output Format**: PNG texture + JSON metrics
- **Field Type**: MSDF (Multi-channel Signed Distance Field)

## Method 1: Online MSDF Generator (Recommended)

### Step 1: Access the Web Tool
Visit: https://msdf-bmfont.donmccurdy.com/

### Step 2: Configure Settings for Each Font Weight

#### For Inter Regular:
1. Upload `Inter-Regular.otf`
2. Set Character Set: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-_()[]{}`
3. Set Texture Size: 512x512
4. Set Font Size: 42px
5. Set Distance Range: 3
6. Set Field Type: MSDF
7. Set Padding: 1px
8. Generate and download as:
   - `inter-regular-msdf.png`
   - `inter-regular-msdf.json`

#### For Inter Bold:
1. Upload `Inter-Bold.otf`
2. Use same settings as Regular
3. Generate and download as:
   - `inter-bold-msdf.png`
   - `inter-bold-msdf.json`

#### For Inter Light:
1. Upload `Inter-Light.otf`
2. Use same settings as Regular
3. Generate and download as:
   - `inter-light-msdf.png`
   - `inter-light-msdf.json`

## Method 2: Command Line (Alternative)

If you have a system with compatible GLIBC:

```bash
# Install the tool
npm install msdf-bmfont-xml

# Generate Regular
npx msdf-bmfont --reuse -o inter-regular-msdf.png -f json -m 512,512 -s 42 -r 3 -p 1 -t msdf -i charset.txt Inter-Regular.otf

# Generate Bold
npx msdf-bmfont --reuse -o inter-bold-msdf.png -f json -m 512,512 -s 42 -r 3 -p 1 -t msdf -i charset.txt Inter-Bold.otf

# Generate Light
npx msdf-bmfont --reuse -o inter-light-msdf.png -f json -m 512,512 -s 42 -r 3 -p 1 -t msdf -i charset.txt Inter-Light.otf
```

## Expected Output Files

After generation, you should have 6 files:

### Texture Atlases (PNG):
- `inter-regular-msdf.png` - 512x512 MSDF texture
- `inter-bold-msdf.png` - 512x512 MSDF texture  
- `inter-light-msdf.png` - 512x512 MSDF texture

### Metrics Files (JSON):
- `inter-regular-msdf.json` - Character metrics and UV coordinates
- `inter-bold-msdf.json` - Character metrics and UV coordinates
- `inter-light-msdf.json` - Character metrics and UV coordinates

## JSON Structure Example

The JSON metrics file contains:
```json
{
  "pages": ["inter-regular-msdf.png"],
  "chars": [
    {
      "id": 65,
      "index": 0,
      "char": "A",
      "width": 28,
      "height": 32,
      "xoffset": 0,
      "yoffset": 8,
      "xadvance": 28,
      "chnl": 15,
      "x": 0,
      "y": 0,
      "page": 0
    },
    // ... more characters
  ],
  "info": {
    "face": "Inter",
    "size": 42,
    "bold": 0,
    "italic": 0,
    "charset": "",
    "unicode": 1,
    "stretchH": 100,
    "smooth": 1,
    "aa": 1,
    "padding": [1,1,1,1],
    "spacing": [0,0],
    "outline": 0
  },
  "common": {
    "lineHeight": 51,
    "base": 40,
    "scaleW": 512,
    "scaleH": 512,
    "pages": 1,
    "packed": 0,
    "alphaChnl": 0,
    "redChnl": 0,
    "greenChnl": 0,
    "blueChnl": 0
  }
}
```

## WebGL Integration Notes

For WebGL text rendering with these MSDF atlases:

1. **Texture Loading**: Load the PNG as a WebGL texture
2. **Character Mapping**: Use the JSON to map characters to UV coordinates
3. **Shader Requirements**: Use MSDF fragment shader for proper rendering
4. **Distance Field Range**: Set to 3.0 in shader (matches generation parameter)
5. **Smoothing**: Apply proper antialiasing based on zoom level

## Quality Verification

After generation, verify:
- ✅ Atlas size is exactly 512x512
- ✅ All required characters are present
- ✅ Character spacing looks correct
- ✅ JSON contains valid UV coordinates
- ✅ Distance field rendering is smooth at all zoom levels

## File Organization

Place generated files in:
```
/home/devuser/edt2/frontend/src/assets/fonts/
├── inter-regular-msdf.png
├── inter-regular-msdf.json
├── inter-bold-msdf.png
├── inter-bold-msdf.json
├── inter-light-msdf.png
├── inter-light-msdf.json
├── Inter-Regular.otf
├── Inter-Bold.otf
├── Inter-Light.otf
└── charset.txt
```