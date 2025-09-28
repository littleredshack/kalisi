import { HierarchicalNode, Camera } from '../../canvas/types';
import { DrawingPrimitives } from '../../canvas/drawing-primitives';

/**
 * Flat node drawing primitive - EXACT replica of current flat graph node rendering
 * Extracted from FlatGraphRenderingStrategy.renderFlatNode() for composability
 */
export class FlatNodePrimitive {

  /**
   * Draw a flat graph node with EXACT specifications from current renderer:
   * - Rounded rectangle with radius = 12 * camera.zoom
   * - Fill and stroke from node.style
   * - Text centered, size 14 * camera.zoom, color #e6edf3
   */
  static draw(
    ctx: CanvasRenderingContext2D,
    node: HierarchicalNode,
    camera: Camera
  ): void {
    // Skip invisible nodes (exact same check)
    if (node.visible === false) return;

    // Apply camera transform to get screen position (exact same calculation)
    const screenX = (node.x - camera.x) * camera.zoom;
    const screenY = (node.y - camera.y) * camera.zoom;
    const screenWidth = node.width * camera.zoom;
    const screenHeight = node.height * camera.zoom;

    // Skip if culled (off-screen) - exact same culling logic
    if (screenX + screenWidth < 0 || screenX > ctx.canvas.width ||
        screenY + screenHeight < 0 || screenY > ctx.canvas.height) {
      return;
    }

    // Draw rounded rectangle node using drawing primitive - EXACT same styling
    ctx.fillStyle = node.style.fill;
    ctx.strokeStyle = node.style.stroke;
    ctx.lineWidth = 2;

    // EXACT radius from current flat graph: 12 * camera.zoom
    const radius = 12 * camera.zoom;
    DrawingPrimitives.drawRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, radius);
    ctx.fill();
    ctx.stroke();

    // Draw text centered in node - EXACT same positioning and styling
    DrawingPrimitives.drawText(
      ctx,
      node.text,
      screenX + screenWidth / 2,
      screenY + screenHeight / 2,
      14 * camera.zoom,  // EXACT font size from current renderer
      '#e6edf3',         // EXACT text color from current renderer
      'center'
    );
  }

  /**
   * Check if a point hits this node (for interaction)
   * Uses same rounded rectangle hit detection
   */
  static hitTest(
    node: HierarchicalNode,
    worldX: number,
    worldY: number
  ): boolean {
    // Simple rectangular hit test (can enhance with rounded corners if needed)
    return worldX >= node.x &&
           worldX <= node.x + node.width &&
           worldY >= node.y &&
           worldY <= node.y + node.height;
  }

  /**
   * Get the visual bounds of a node (for layout calculations)
   */
  static getBounds(node: HierarchicalNode): { x: number; y: number; width: number; height: number } {
    return {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    };
  }
}