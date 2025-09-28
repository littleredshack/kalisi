# MSDF WebGL Integration Guide

## Overview
This guide explains how to integrate MSDF font atlases for sharp text rendering in WebGL applications.

## WebGL Shader Implementation

### Vertex Shader Example
```glsl
attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute float a_charIndex;

uniform mat4 u_matrix;
uniform vec2 u_textureSize;

varying vec2 v_texCoord;
varying float v_charIndex;

void main() {
  gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
  v_charIndex = a_charIndex;
}
```

### MSDF Fragment Shader
```glsl
precision mediump float;

uniform sampler2D u_texture;
uniform vec3 u_color;
uniform float u_pxRange; // Distance field range (3.0)
uniform float u_smoothing; // Antialiasing smoothing

varying vec2 v_texCoord;

float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  // Sample the MSDF texture
  vec3 msd = texture2D(u_texture, v_texCoord).rgb;
  
  // Calculate the signed distance
  float sd = median(msd.r, msd.g, msd.b);
  
  // Convert to screen space
  float screenPxDistance = u_pxRange * (sd - 0.5);
  
  // Calculate opacity with antialiasing
  float opacity = clamp(screenPxDistance + 0.5, 0.0, 1.0);
  
  // Apply smoothing for better antialiasing
  if (u_smoothing > 0.0) {
    opacity = smoothstep(0.5 - u_smoothing, 0.5 + u_smoothing, sd);
  }
  
  gl_FragColor = vec4(u_color, opacity);
}
```

## JavaScript Integration

### Font Atlas Loader
```javascript
class MSDFFont {
  constructor() {
    this.texture = null;
    this.metrics = null;
    this.charMap = new Map();
  }

  async load(atlasPath, metricsPath) {
    // Load texture
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = atlasPath;
    });

    // Create WebGL texture
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Load metrics
    const response = await fetch(metricsPath);
    this.metrics = await response.json();

    // Build character map
    this.buildCharMap();
  }

  buildCharMap() {
    this.charMap.clear();
    for (const char of this.metrics.chars) {
      this.charMap.set(String.fromCharCode(char.id), char);
    }
  }

  getCharacterData(character) {
    return this.charMap.get(character);
  }

  getTextureSize() {
    return {
      width: this.metrics.common.scaleW,
      height: this.metrics.common.scaleH
    };
  }

  getLineHeight() {
    return this.metrics.common.lineHeight;
  }

  getBaseline() {
    return this.metrics.common.base;
  }
}
```

### Text Renderer
```javascript
class MSDFTextRenderer {
  constructor(gl, shader, font) {
    this.gl = gl;
    this.shader = shader;
    this.font = font;
    this.vertices = [];
    this.indices = [];
    this.vertexBuffer = null;
    this.indexBuffer = null;
  }

  renderText(text, x, y, fontSize = 16) {
    const gl = this.gl;
    const scale = fontSize / this.font.metrics.info.size;
    let currentX = x;
    const currentY = y;

    this.vertices = [];
    this.indices = [];

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const charData = this.font.getCharacterData(char);
      
      if (!charData) continue;

      // Calculate character quad
      const x1 = currentX + (charData.xoffset * scale);
      const y1 = currentY + (charData.yoffset * scale);
      const x2 = x1 + (charData.width * scale);
      const y2 = y1 + (charData.height * scale);

      // Calculate UV coordinates
      const textureSize = this.font.getTextureSize();
      const u1 = charData.x / textureSize.width;
      const v1 = charData.y / textureSize.height;
      const u2 = (charData.x + charData.width) / textureSize.width;
      const v2 = (charData.y + charData.height) / textureSize.height;

      // Add quad vertices
      const baseIndex = this.vertices.length / 4;
      
      // Top-left
      this.vertices.push(x1, y1, u1, v1);
      // Top-right
      this.vertices.push(x2, y1, u2, v1);
      // Bottom-right
      this.vertices.push(x2, y2, u2, v2);
      // Bottom-left
      this.vertices.push(x1, y2, u1, v2);

      // Add quad indices
      this.indices.push(
        baseIndex, baseIndex + 1, baseIndex + 2,
        baseIndex, baseIndex + 2, baseIndex + 3
      );

      // Advance cursor
      currentX += charData.xadvance * scale;
    }

    this.updateBuffers();
    this.draw();
  }

  updateBuffers() {
    const gl = this.gl;

    if (!this.vertexBuffer) {
      this.vertexBuffer = gl.createBuffer();
      this.indexBuffer = gl.createBuffer();
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.indices), gl.DYNAMIC_DRAW);
  }

  draw() {
    const gl = this.gl;
    
    gl.useProgram(this.shader.program);
    
    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.font.texture);
    gl.uniform1i(this.shader.uniforms.u_texture, 0);
    
    // Set uniforms
    gl.uniform1f(this.shader.uniforms.u_pxRange, 3.0); // Match generation parameter
    gl.uniform1f(this.shader.uniforms.u_smoothing, 0.1);
    gl.uniform3f(this.shader.uniforms.u_color, 1.0, 1.0, 1.0); // White text
    
    // Bind vertex buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    
    // Set vertex attributes
    const positionAttribute = this.shader.attributes.a_position;
    const texCoordAttribute = this.shader.attributes.a_texCoord;
    
    gl.enableVertexAttribArray(positionAttribute);
    gl.enableVertexAttribArray(texCoordAttribute);
    
    gl.vertexAttribPointer(positionAttribute, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(texCoordAttribute, 2, gl.FLOAT, false, 16, 8);
    
    // Enable blending for text transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Draw
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_SHORT, 0);
    
    // Cleanup
    gl.disableVertexAttribArray(positionAttribute);
    gl.disableVertexAttribArray(texCoordAttribute);
    gl.disable(gl.BLEND);
  }
}
```

## Usage Example

```javascript
async function initTextRendering() {
  // Load fonts
  const regularFont = new MSDFFont();
  await regularFont.load(
    '/assets/fonts/inter-regular-msdf.png',
    '/assets/fonts/inter-regular-msdf.json'
  );

  const boldFont = new MSDFFont();
  await boldFont.load(
    '/assets/fonts/inter-bold-msdf.png',
    '/assets/fonts/inter-bold-msdf.json'
  );

  const lightFont = new MSDFFont();
  await lightFont.load(
    '/assets/fonts/inter-light-msdf.png',
    '/assets/fonts/inter-light-msdf.json'
  );

  // Create renderer
  const textRenderer = new MSDFTextRenderer(gl, textShader, regularFont);

  // Render text
  textRenderer.renderText("Hello, World!", 100, 100, 24);
}
```

## Performance Considerations

1. **Batch Rendering**: Combine multiple text draws into single draw calls
2. **Texture Atlas**: Use the largest practical atlas size to minimize texture switches
3. **Dynamic Text**: Update vertex buffers efficiently for changing text
4. **Distance Range**: Keep consistent with generation parameters (3.0)
5. **Mipmaps**: Consider for very small text, but may reduce sharpness

## Quality Optimization

1. **Antialiasing**: Adjust smoothing based on text size and zoom level
2. **Sub-pixel Positioning**: For crisp text alignment
3. **Gamma Correction**: Apply appropriate gamma for target display
4. **Zoom Handling**: MSDF maintains sharpness at any zoom level automatically

## Debugging Tips

1. **Texture Inspection**: Verify atlas generation with browser dev tools
2. **UV Coordinates**: Check character mapping in metrics JSON
3. **Distance Field**: Visualize the distance field by rendering the raw texture
4. **Shader Parameters**: Adjust pxRange and smoothing for different effects