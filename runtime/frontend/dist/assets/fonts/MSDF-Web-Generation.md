# MSDF Font Generation via Web Tool

## Step 1: Download Font Files

### Font Downloads (Google Fonts):
1. **Inter:** https://fonts.google.com/specimen/Inter
   - Download: Light 300, Regular 400, Bold 700
2. **Roboto:** https://fonts.google.com/specimen/Roboto  
   - Download: Light 300, Regular 400, Bold 700
3. **Open Sans:** https://fonts.google.com/specimen/Open+Sans
   - Download: Light 300, Regular 400, Bold 700

## Step 2: Generate MSDF Atlases

### Web Tool: https://msdf-bmfont.donmccurdy.com/

### For Each Font File (9 total):
1. Click "Upload a font"
2. Select TTF file
3. Enter character set: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-_()[]{}`
4. Select texture size: **512px**  
5. Click "Create MSDF"
6. Download **PNG texture** and **JSON metrics**

### Naming Convention:
- `inter-light.png` + `inter-light.json`
- `inter-regular.png` + `inter-regular.json`  
- `inter-bold.png` + `inter-bold.json`
- `roboto-light.png` + `roboto-light.json`
- `roboto-regular.png` + `roboto-regular.json`
- `roboto-bold.png` + `roboto-bold.json`
- `opensans-light.png` + `opensans-light.json`
- `opensans-regular.png` + `opensans-regular.json`
- `opensans-bold.png` + `opensans-bold.json`

## Step 3: Place Assets
Copy all 18 files (9 PNG + 9 JSON) to:
`/home/devuser/edt2/frontend/src/assets/fonts/`

## Result
Perfect quality MSDF font atlases ready for sharp WebGL text rendering at any zoom level.