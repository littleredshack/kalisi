# MSDF Font Asset Generation Instructions

## Required MSDF Assets for EDT2

Generate 9 MSDF atlases using https://msdf-bmfont.donmccurdy.com/

### Font Families & Weights:
1. **Inter Regular** (inter-regular)
2. **Inter Bold** (inter-bold)  
3. **Inter Light** (inter-light)
4. **Roboto Regular** (roboto-regular)
5. **Roboto Bold** (roboto-bold)
6. **Roboto Light** (roboto-light)
7. **Open Sans Regular** (opensans-regular)
8. **Open Sans Bold** (opensans-bold)
9. **Open Sans Light** (opensans-light)

### Generation Settings:
- **Character Set:** `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-_()[]{}`
- **Texture Size:** 512px
- **Output Format:** JSON + PNG

### Font Downloads:
- **Inter:** https://fonts.google.com/specimen/Inter
- **Roboto:** https://fonts.google.com/specimen/Roboto  
- **Open Sans:** https://fonts.google.com/specimen/Open+Sans

### Expected Output Files:
```
frontend/src/assets/fonts/
├── inter-regular.png + inter-regular.json
├── inter-bold.png + inter-bold.json
├── inter-light.png + inter-light.json
├── roboto-regular.png + roboto-regular.json
├── roboto-bold.png + roboto-bold.json
├── roboto-light.png + roboto-light.json
├── opensans-regular.png + opensans-regular.json
├── opensans-bold.png + opensans-bold.json
└── opensans-light.png + opensans-light.json
```

### Usage:
1. Visit https://msdf-bmfont.donmccurdy.com/
2. Upload TTF file for each font/weight
3. Enter character set above
4. Select 512px texture size
5. Generate and download PNG + JSON
6. Rename files with naming convention above
7. Place in fonts directory

Once assets are generated, the WebGL system will load them for perfect sharp text rendering.