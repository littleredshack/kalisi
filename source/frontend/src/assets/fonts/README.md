# MSDF Font Assets for EDT2

This directory contains everything needed to generate and use MSDF (Multi-channel Signed Distance Field) font atlases for sharp WebGL text rendering in the EDT2 application.

## Directory Contents

### Font Files
- `Inter-Regular.otf` - Inter Regular weight font
- `Inter-Bold.otf` - Inter Bold weight font  
- `Inter-Light.otf` - Inter Light weight font
- `SIL Open Font License.txt` - Font license

### Configuration
- `charset.txt` - Character set for atlas generation
- `inter-regular-msdf.json.template` - Example JSON metrics structure

### Generation Tools
- `generate-msdf.sh` - Automated generation script (may have GLIBC issues)
- `MSDF_GENERATION_GUIDE.md` - Complete generation instructions

### Integration Guide
- `webgl-integration-guide.md` - WebGL implementation details

## Quick Start

### Option 1: Automated Generation (if compatible)
```bash
./generate-msdf.sh
```

### Option 2: Web Tool (Recommended)
1. Visit: https://msdf-bmfont.donmccurdy.com/
2. Upload each font file
3. Use character set: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-_()[]{}`
4. Set texture size: 512x512
5. Download PNG + JSON files

## Expected Output Files

After generation, you should have:
```
inter-regular-msdf.png    # 512x512 MSDF texture atlas
inter-regular-msdf.json   # Character metrics and UV coordinates
inter-bold-msdf.png       # 512x512 MSDF texture atlas
inter-bold-msdf.json      # Character metrics and UV coordinates
inter-light-msdf.png      # 512x512 MSDF texture atlas
inter-light-msdf.json     # Character metrics and UV coordinates
```

## WebGL Integration

See `webgl-integration-guide.md` for complete implementation details including:
- MSDF fragment shaders
- Texture loading code
- Text rendering classes
- Performance optimization tips

## Quality Verification

After generation, verify:
- ✅ Atlas size is exactly 512x512
- ✅ All required characters are present  
- ✅ Distance field renders sharp at all zoom levels
- ✅ JSON contains valid UV coordinates

## License

Inter font is licensed under SIL Open Font License v1.10 - see `SIL Open Font License.txt` for details.