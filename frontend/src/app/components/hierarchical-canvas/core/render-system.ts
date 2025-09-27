/**
 * Kalisi Hierarchical Canvas - Render System
 * 
 * Canvas 2D rendering pipeline with hierarchical transform inheritance.
 * Optimized for performance with dirty region tracking and render culling.
 */

import { SceneNode, NodeType, Viewport, Bounds, Point } from './scene-graph';
import { TransformSystem } from './transform-system';

/**
 * Render context with performance optimization flags
 */
export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  viewport: Viewport;
  enableCulling: boolean;
  enableDirtyRegions: boolean;
  debugMode: boolean;
  renderStats: RenderStats;
}

/**
 * Rendering performance statistics
 */
export interface RenderStats {
  nodesRendered: number;
  nodesCulled: number;
  renderTime: number;
  transformUpdates: number;
  lastFrameTime: number;
}

/**
 * Dirty region for optimized rendering
 */
interface DirtyRegion {
  bounds: Bounds;
  nodes: Set<SceneNode>;
}

/**
 * Render queue item for batched rendering
 */
interface RenderItem {
  node: SceneNode;
  worldMatrix: DOMMatrix;
  worldBounds: Bounds;
  renderOrder: number;
}

/**
 * Canvas 2D rendering system with hierarchical support
 */
export class RenderSystem {
  private transformSystem: TransformSystem;
  private dirtyRegions: DirtyRegion[] = [];
  private renderQueue: RenderItem[] = [];
  private lastRenderTime = 0;
  private frameCount = 0;
  
  // Performance optimization flags
  private enableRenderCulling = true;
  private enableBatchRendering = true;
  private enableDirtyRegions = false; // Disabled by default for now
  
  constructor(transformSystem: TransformSystem) {
    this.transformSystem = transformSystem;
  }
  
  /**
   * Main render method - renders the entire scene graph
   */
  render(
    ctx: CanvasRenderingContext2D, 
    root: SceneNode, 
    viewport: Viewport,
    debugMode = false
  ): RenderStats {
    const startTime = performance.now();
    
    // Initialize render context
    const renderContext: RenderContext = {
      ctx,
      viewport,
      enableCulling: this.enableRenderCulling,
      enableDirtyRegions: this.enableDirtyRegions,
      debugMode,
      renderStats: {
        nodesRendered: 0,
        nodesCulled: 0,
        renderTime: 0,
        transformUpdates: 0,
        lastFrameTime: 0
      }
    };
    
    // Clear canvas
    this.clearCanvas(ctx, viewport);
    
    // Update transforms before rendering
    this.transformSystem.updateTransforms(root);
    
    // Apply viewport transform
    ctx.save();
    this.applyViewportTransform(ctx, viewport);
    
    if (this.enableBatchRendering) {
      // Collect render items and batch render
      this.collectRenderItems(root, renderContext);
      this.renderBatched(renderContext);
    } else {
      // Direct hierarchical rendering
      this.renderNodeHierarchy(root, renderContext);
    }
    
    // Render debug information if enabled
    if (debugMode) {
      this.renderDebugInfo(renderContext);
    }
    
    ctx.restore();
    
    // Update performance stats
    const renderTime = performance.now() - startTime;
    renderContext.renderStats.renderTime = renderTime;
    renderContext.renderStats.lastFrameTime = renderTime;
    this.lastRenderTime = renderTime;
    this.frameCount++;
    
    return renderContext.renderStats;
  }
  
  /**
   * Clear the canvas with background color
   */
  private clearCanvas(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    // Kalisi dark theme background
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  
  /**
   * Apply viewport transformation (pan and zoom)
   */
  private applyViewportTransform(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    // Apply zoom
    ctx.scale(viewport.zoom, viewport.zoom);
    
    // Apply pan (negative because we're moving the world, not the camera)
    ctx.translate(-viewport.x, -viewport.y);
  }
  
  /**
   * Render nodes using hierarchical traversal
   */
  private renderNodeHierarchy(node: SceneNode, context: RenderContext): void {
    if (!node.visible) return;
    
    const { ctx } = context;
    
    // Skip rendering if outside viewport (culling)
    if (context.enableCulling && !this.isNodeVisible(node, context.viewport)) {
      context.renderStats.nodesCulled++;
      return;
    }
    
    ctx.save();
    
    // Apply node's local transform
    this.applyNodeTransform(ctx, node);
    
    // Render this node's content
    this.renderNodeContent(node, context);
    context.renderStats.nodesRendered++;
    
    // Render children in order
    for (const child of node.children) {
      this.renderNodeHierarchy(child, context);
    }
    
    ctx.restore();
  }
  
  /**
   * Apply a node's local transform to the canvas context
   */
  private applyNodeTransform(ctx: CanvasRenderingContext2D, node: SceneNode): void {
    const { transform } = node;
    
    // Apply local transform: translate -> rotate -> scale
    if (transform.x !== 0 || transform.y !== 0) {
      ctx.translate(transform.x, transform.y);
    }
    
    if (transform.rotation !== 0) {
      ctx.rotate(transform.rotation);
    }
    
    if (transform.scaleX !== 1 || transform.scaleY !== 1) {
      ctx.scale(transform.scaleX, transform.scaleY);
    }
  }
  
  /**
   * Render the visual content of a specific node
   */
  private renderNodeContent(node: SceneNode, context: RenderContext): void {
    const { ctx } = context;
    
    // Use custom render function if provided
    if (node.onRender) {
      const worldMatrix = this.transformSystem.getWorldMatrix(node);
      node.onRender(ctx, worldMatrix);
      return;
    }
    
    // Default rendering based on node type
    switch (node.type) {
      case 'rectangle':
        this.renderRectangle(node, ctx);
        break;
      case 'text':
        this.renderText(node, ctx);
        break;
      case 'group':
        // Groups don't render themselves, only their children
        break;
      default:
        console.warn(`Unknown node type: ${(node as any).type}`);
    }
  }
  
  /**
   * Render a rectangle node
   */
  private renderRectangle(node: SceneNode, ctx: CanvasRenderingContext2D): void {
    const { bounds, style } = node;
    const cornerRadius = (node as any).cornerRadius || 0;
    
    ctx.save();
    
    // Apply opacity
    if (style.opacity !== undefined && style.opacity < 1) {
      ctx.globalAlpha = style.opacity;
    }
    
    // Create path
    ctx.beginPath();
    if (cornerRadius > 0) {
      this.roundRect(ctx, 0, 0, bounds.width, bounds.height, cornerRadius);
    } else {
      ctx.rect(0, 0, bounds.width, bounds.height);
    }
    
    // Fill
    if (style.fillColor) {
      ctx.fillStyle = style.fillColor;
      ctx.fill();
    }
    
    // Stroke
    if (style.strokeColor && (style.strokeWidth || 0) > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth || 1;
      ctx.stroke();
    }
    
    ctx.restore();
  }
  
  /**
   * Render a text node
   */
  private renderText(node: SceneNode & { text: string }, ctx: CanvasRenderingContext2D): void {
    const { bounds, style } = node;
    const text = node.text || '';
    
    ctx.save();
    
    // Apply opacity
    if (style.opacity !== undefined && style.opacity < 1) {
      ctx.globalAlpha = style.opacity;
    }
    
    // Set text properties
    const fontSize = style.fontSize || 14;
    const fontFamily = style.fontFamily || 'Roboto, sans-serif';
    const fontWeight = style.fontWeight || 'normal';
    
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.textAlign = (style.textAlign as CanvasTextAlign) || 'center';
    ctx.textBaseline = (style.textBaseline as CanvasTextBaseline) || 'middle';
    
    // Calculate text position
    let textX = 0;
    let textY = 0;
    
    switch (ctx.textAlign) {
      case 'left':
        textX = 0;
        break;
      case 'center':
        textX = bounds.width / 2;
        break;
      case 'right':
        textX = bounds.width;
        break;
    }
    
    switch (ctx.textBaseline) {
      case 'top':
        textY = 0;
        break;
      case 'middle':
        textY = bounds.height / 2;
        break;
      case 'bottom':
        textY = bounds.height;
        break;
    }
    
    // Render text
    if (style.fillColor) {
      ctx.fillStyle = style.fillColor;
      ctx.fillText(text, textX, textY);
    }
    
    if (style.strokeColor && (style.strokeWidth || 0) > 0) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth || 1;
      ctx.strokeText(text, textX, textY);
    }
    
    ctx.restore();
  }
  
  /**
   * Draw a rounded rectangle path
   */
  private roundRect(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    radius: number
  ): void {
    if (width < 2 * radius) radius = width / 2;
    if (height < 2 * radius) radius = height / 2;
    
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }
  
  /**
   * Check if a node is visible in the current viewport
   */
  private isNodeVisible(node: SceneNode, viewport: Viewport): boolean {
    // Get world bounds of the node
    const worldMatrix = this.transformSystem.getWorldMatrix(node);
    
    // Transform node bounds to world space
    const corners = [
      { x: 0, y: 0 },
      { x: node.bounds.width, y: 0 },
      { x: node.bounds.width, y: node.bounds.height },
      { x: 0, y: node.bounds.height }
    ];
    
    const worldCorners = corners.map(corner => worldMatrix.transformPoint(corner));
    
    // Calculate AABB in world space
    let minX = worldCorners[0].x;
    let maxX = worldCorners[0].x;
    let minY = worldCorners[0].y;
    let maxY = worldCorners[0].y;
    
    for (const corner of worldCorners) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }
    
    // Check intersection with viewport
    const viewLeft = viewport.x - viewport.width / (2 * viewport.zoom);
    const viewRight = viewport.x + viewport.width / (2 * viewport.zoom);
    const viewTop = viewport.y - viewport.height / (2 * viewport.zoom);
    const viewBottom = viewport.y + viewport.height / (2 * viewport.zoom);
    
    return !(maxX < viewLeft || minX > viewRight || maxY < viewTop || minY > viewBottom);
  }
  
  /**
   * Collect render items for batch rendering
   */
  private collectRenderItems(node: SceneNode, context: RenderContext): void {
    this.renderQueue = [];
    this.collectRenderItemsRecursive(node, context, 0);
  }
  
  /**
   * Recursively collect render items
   */
  private collectRenderItemsRecursive(node: SceneNode, context: RenderContext, depth: number): void {
    if (!node.visible) return;
    
    // Skip if culled
    if (context.enableCulling && !this.isNodeVisible(node, context.viewport)) {
      context.renderStats.nodesCulled++;
      return;
    }
    
    // Add to render queue
    const worldMatrix = this.transformSystem.getWorldMatrix(node);
    const worldBounds = this.getNodeWorldBounds(node, worldMatrix);
    
    this.renderQueue.push({
      node,
      worldMatrix,
      worldBounds,
      renderOrder: depth
    });
    
    // Process children
    for (const child of node.children) {
      this.collectRenderItemsRecursive(child, context, depth + 1);
    }
  }
  
  /**
   * Render items in batches for performance
   */
  private renderBatched(context: RenderContext): void {
    // Sort by render order (back to front)
    this.renderQueue.sort((a, b) => a.renderOrder - b.renderOrder);
    
    // Batch by node type for optimization
    const batches = new Map<NodeType, RenderItem[]>();
    
    for (const item of this.renderQueue) {
      const type = item.node.type;
      if (!batches.has(type)) {
        batches.set(type, []);
      }
      batches.get(type)!.push(item);
    }
    
    // Render each batch
    for (const [type, items] of batches) {
      this.renderBatch(items, context);
    }
    
    context.renderStats.nodesRendered = this.renderQueue.length;
  }
  
  /**
   * Render a batch of similar items
   */
  private renderBatch(items: RenderItem[], context: RenderContext): void {
    const { ctx } = context;
    
    for (const item of items) {
      ctx.save();
      
      // Apply world transform directly
      const matrix = item.worldMatrix;
      ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
      
      // Render the node content
      this.renderNodeContent(item.node, context);
      
      ctx.restore();
    }
  }
  
  /**
   * Get world bounds of a node
   */
  private getNodeWorldBounds(node: SceneNode, worldMatrix: DOMMatrix): Bounds {
    const corners = [
      { x: 0, y: 0 },
      { x: node.bounds.width, y: 0 },
      { x: node.bounds.width, y: node.bounds.height },
      { x: 0, y: node.bounds.height }
    ];
    
    const worldCorners = corners.map(corner => worldMatrix.transformPoint(corner));
    
    let minX = worldCorners[0].x;
    let maxX = worldCorners[0].x;
    let minY = worldCorners[0].y;
    let maxY = worldCorners[0].y;
    
    for (const corner of worldCorners) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
  
  /**
   * Render debug information
   */
  private renderDebugInfo(context: RenderContext): void {
    const { ctx, renderStats } = context;
    
    ctx.save();
    ctx.resetTransform(); // Use screen coordinates
    
    // Debug panel background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 200, 120);
    
    // Debug text
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    const lines = [
      `Nodes rendered: ${renderStats.nodesRendered}`,
      `Nodes culled: ${renderStats.nodesCulled}`,
      `Render time: ${renderStats.renderTime.toFixed(2)}ms`,
      `FPS: ${(1000 / renderStats.renderTime).toFixed(1)}`,
      `Frame: ${this.frameCount}`
    ];
    
    lines.forEach((line, index) => {
      ctx.fillText(line, 20, 20 + index * 16);
    });
    
    ctx.restore();
  }
  
  /**
   * Enable/disable render culling
   */
  setRenderCulling(enabled: boolean): void {
    this.enableRenderCulling = enabled;
  }
  
  /**
   * Enable/disable batch rendering
   */
  setBatchRendering(enabled: boolean): void {
    this.enableBatchRendering = enabled;
  }
  
  /**
   * Enable/disable dirty region optimization
   */
  setDirtyRegions(enabled: boolean): void {
    this.enableDirtyRegions = enabled;
  }
  
  /**
   * Get current performance statistics
   */
  getStats(): RenderStats {
    return {
      nodesRendered: 0,
      nodesCulled: 0,
      renderTime: this.lastRenderTime,
      transformUpdates: 0,
      lastFrameTime: this.lastRenderTime
    };
  }
}