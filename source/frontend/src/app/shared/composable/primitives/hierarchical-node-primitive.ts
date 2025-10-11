import { HierarchicalNode, Camera } from '../../canvas/types';
import { DrawingPrimitives } from '../../canvas/drawing-primitives';
import { CollapseBehavior } from '../../../core/services/view-node-state.service';

const COLLAPSED_NODE_WIDTH = 80;
const COLLAPSED_NODE_HEIGHT = 40;

/**
 * Hierarchical node drawing primitive - EXACT replica of hierarchical node rendering
 * Extracted from HierarchicalRenderingStrategy.renderNodeHierarchy() for composability
 *
 * Handles:
 * - Recursive parent/child coordinate transformation
 * - Camera transforms (world space → screen space)
 * - Child count badges for collapsed nodes
 * - Exact visual styling from current hierarchical renderer
 * - Shrinking collapsed nodes based on collapse behavior
 */
export class HierarchicalNodePrimitive {

  /**
   * Draw a hierarchical node and all its children recursively
   * EXACT replica of HierarchicalRenderingStrategy.renderNodeHierarchy()
   * Enhanced to support collapse behavior (shrink/full-size)
   */
  static draw(
    ctx: CanvasRenderingContext2D,
    node: HierarchicalNode,
    parentX: number,
    parentY: number,
    camera: Camera,
    collapseBehavior: CollapseBehavior = 'full-size'
  ): void {
    // Skip invisible nodes - exact same check
    if (node.visible === false) return;

    // Determine if we should shrink this node
    const shouldShrink = node.collapsed && node.children && node.children.length > 0 && collapseBehavior === 'shrink';

    // Use smaller dimensions if collapsed and behavior is 'shrink'
    const nodeWidth = shouldShrink ? COLLAPSED_NODE_WIDTH : node.width;
    const nodeHeight = shouldShrink ? COLLAPSED_NODE_HEIGHT : node.height;

    // Calculate absolute position in world space (exact same logic)
    const worldX = parentX + node.x;
    const worldY = parentY + node.y;

    // Apply camera transform to get screen position (exact same transform)
    const screenX = (worldX - camera.x) * camera.zoom;
    const screenY = (worldY - camera.y) * camera.zoom;
    const screenWidth = nodeWidth * camera.zoom;
    const screenHeight = nodeHeight * camera.zoom;

    // Skip if culled (off-screen) - exact same culling logic
    if (screenX + screenWidth < 0 || screenX > ctx.canvas.width ||
        screenY + screenHeight < 0 || screenY > ctx.canvas.height) {
      return;
    }

    // Draw the node using exact same styling
    ctx.fillStyle = node.style.fill;
    ctx.strokeStyle = node.style.stroke;
    ctx.lineWidth = 2;

    // Use drawing primitive for rounded rectangle - EXACT same radius
    DrawingPrimitives.drawRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, 8 * camera.zoom);
    ctx.fill();
    ctx.stroke();

    // Draw text using drawing primitive - EXACT same positioning
    DrawingPrimitives.drawText(
      ctx,
      node.text,
      screenX + 10 * camera.zoom,
      screenY + 25 * camera.zoom,
      16 * camera.zoom,
      '#e6edf3'
    );

    // Draw type label using drawing primitive - EXACT same positioning
    DrawingPrimitives.drawText(
      ctx,
      node.type,
      screenX + 10 * camera.zoom,
      screenY + 45 * camera.zoom,
      12 * camera.zoom,
      '#a0a9b8'
    );

    // Draw child count badge if node is collapsed - EXACT same logic
    if (node.collapsed) {
      const childCount = this.countAllDescendants(node);
      if (childCount > 0) {
        this.drawChildCountBadge(ctx, screenX, screenY, screenWidth, screenHeight, childCount);
      }
    }

    // Recursively render children if not collapsed - EXACT same recursion
    if (!node.collapsed && node.children && node.children.length > 0) {
      node.children.forEach(child => {
        this.draw(ctx, child, worldX, worldY, camera, collapseBehavior);
      });
    }
  }

  /**
   * Get screen bounds for a hierarchical node (for hit testing)
   * Enhanced to support collapse behavior
   */
  static getBounds(
    node: HierarchicalNode,
    parentX: number,
    parentY: number,
    camera: Camera,
    collapseBehavior: CollapseBehavior = 'full-size'
  ): {
    x: number, y: number, width: number, height: number
  } {
    const worldX = parentX + node.x;
    const worldY = parentY + node.y;

    // Determine if we should shrink this node
    const shouldShrink = node.collapsed && node.children && node.children.length > 0 && collapseBehavior === 'shrink';

    // Use smaller dimensions if collapsed and behavior is 'shrink'
    const nodeWidth = shouldShrink ? COLLAPSED_NODE_WIDTH : node.width;
    const nodeHeight = shouldShrink ? COLLAPSED_NODE_HEIGHT : node.height;

    return {
      x: (worldX - camera.x) * camera.zoom,
      y: (worldY - camera.y) * camera.zoom,
      width: nodeWidth * camera.zoom,
      height: nodeHeight * camera.zoom
    };
  }

  /**
   * Hit test for hierarchical node (accounting for parent offset)
   */
  static hitTest(
    node: HierarchicalNode,
    parentX: number,
    parentY: number,
    worldX: number,
    worldY: number,
    collapseBehavior: CollapseBehavior = 'full-size'
  ): boolean {
    const nodeWorldX = parentX + node.x;
    const nodeWorldY = parentY + node.y;

    const shouldShrink =
      collapseBehavior === 'shrink' && node.collapsed && node.children && node.children.length > 0;
    const nodeWidth = shouldShrink ? COLLAPSED_NODE_WIDTH : node.width;
    const nodeHeight = shouldShrink ? COLLAPSED_NODE_HEIGHT : node.height;

    return (
      worldX >= nodeWorldX &&
      worldX <= nodeWorldX + nodeWidth &&
      worldY >= nodeWorldY &&
      worldY <= nodeWorldY + nodeHeight
    );
  }

  /**
   * Count all descendants (for collapsed node badges) - EXACT same logic
   */
  private static countAllDescendants(node: HierarchicalNode): number {
    if (!node.children || node.children.length === 0) return 0;

    let count = node.children.length;
    node.children.forEach(child => {
      count += this.countAllDescendants(child);
    });

    return count;
  }

  /**
   * Draw child count badge - EXACT replica from HierarchicalRenderingStrategy
   */
  private static drawChildCountBadge(
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    screenWidth: number,
    screenHeight: number,
    childCount: number
  ): void {
    const text = childCount.toString();
    const padding = 6;
    const textWidth = ctx.measureText(text).width;
    const badgeWidth = Math.max(20, textWidth + padding * 2);
    const badgeHeight = 20;
    const badgeX = screenX + screenWidth - badgeWidth - 5;
    const badgeY = screenY + 5;

    // Draw badge background as rounded rectangle
    ctx.fillStyle = '#ff6b6b';
    DrawingPrimitives.drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 8);
    ctx.fill();

    // Draw count text centered
    DrawingPrimitives.drawText(
      ctx,
      text,
      badgeX + badgeWidth / 2 - textWidth / 2,
      badgeY + badgeHeight / 2 + 5,
      12,
      '#ffffff'
    );
  }
}
