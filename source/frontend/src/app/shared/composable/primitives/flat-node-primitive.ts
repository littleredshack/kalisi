import { HierarchicalNode, Camera, NodeStyleOverrides, NodeShape } from '../../canvas/types';
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

    const metadata = node.metadata as Record<string, unknown> | undefined;
    const overrides = (metadata?.['styleOverrides'] as NodeStyleOverrides | undefined) ?? undefined;
    const shape: NodeShape = overrides?.shape ?? 'rounded';
    const cornerRadius = Math.max(0, overrides?.cornerRadius ?? 12) * camera.zoom;

    // Draw node shape using drawing primitive
    ctx.fillStyle = node.style.fill;
    ctx.strokeStyle = node.style.stroke;
    ctx.lineWidth = 2;

    DrawingPrimitives.drawShape(ctx, screenX, screenY, screenWidth, screenHeight, shape, cornerRadius);
    ctx.fill();
    ctx.stroke();

    const labelVisible = metadata?.['labelVisible'] !== false;

    const icon = node.style.icon;
    let labelAlignment: 'left' | 'center' | 'right' = 'center';
    let labelX = screenX + screenWidth / 2;

    if (icon) {
      const iconSize = Math.min(24 * camera.zoom, screenHeight * 0.45);
      const iconX = screenX + iconSize * 0.75;
      DrawingPrimitives.drawIcon(
        ctx,
        icon,
        iconX,
        screenY + screenHeight / 2,
        iconSize,
        '#e2e8f0',
        'center'
      );
      labelAlignment = 'left';
      labelX = iconX + iconSize * 0.9;
    }

    if (labelVisible && node.text) {
      DrawingPrimitives.drawText(
        ctx,
        node.text,
        labelX,
        screenY + screenHeight / 2,
        14 * camera.zoom,
        '#e6edf3',
        labelAlignment,
        'middle'
      );
    }

    const badges = Array.isArray(metadata?.['badges'])
      ? (metadata!['badges'] as Array<{ text: string; color?: string }>)
      : [];

    if (badges.length > 0) {
      const badgePaddingX = 6 * camera.zoom;
      const badgePaddingY = 3 * camera.zoom;
      const badgeFont = 11 * camera.zoom;
      const badgeHeight = badgeFont + badgePaddingY * 2;
      const badgeSpacing = 4 * camera.zoom;
      badges.forEach((badge, index) => {
        const badgeCenterY = screenY + badgePaddingY + badgeHeight / 2 + index * (badgeHeight + badgeSpacing);
        DrawingPrimitives.drawBadge(ctx, badge.text, screenX + screenWidth - badgePaddingX, badgeCenterY, {
          background: badge.color ?? 'rgba(30, 64, 175, 0.9)',
          color: '#0f172a',
          paddingX: badgePaddingX,
          paddingY: badgePaddingY,
          radius: 10 * camera.zoom,
          fontSize: badgeFont,
          alignment: 'right'
        });
      });
    }
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
