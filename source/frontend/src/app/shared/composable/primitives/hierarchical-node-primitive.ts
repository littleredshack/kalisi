import { HierarchicalNode, Camera, NodeStyleOverrides, NodeShape } from '../../canvas/types';
import { DrawingPrimitives } from '../../canvas/drawing-primitives';
import { CollapseBehavior } from '../../../core/services/view-node-state.service';

const COLLAPSED_NODE_WIDTH = 220;
const COLLAPSED_NODE_HEIGHT = 64;

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

    console.log(`[HierarchicalPrimitive] Drawing ${node.GUID} - parent offset (${parentX}, ${parentY}), local pos (${node.x}, ${node.y})`);

    // Determine if we should shrink this node
    const shouldShrink = !collapseBehavior || collapseBehavior === 'shrink';

    const baseWidth = Number.isFinite(node.width) ? node.width : COLLAPSED_NODE_WIDTH;
    const baseHeight = Number.isFinite(node.height) ? node.height : COLLAPSED_NODE_HEIGHT;

    const targetWidth = node.metadata?.['targetWidth'];
    const targetHeight = node.metadata?.['targetHeight'];

    // When the layout transitions from collapsed → expanded, node.width/height may still hold
    // the collapsed dimensions for a frame. If targetWidth/Height are present (set by layout engines),
    // we respect them immediately.
    const expandedWidth = typeof targetWidth === 'number' ? Number(targetWidth) : baseWidth;
    const expandedHeight = typeof targetHeight === 'number' ? Number(targetHeight) : baseHeight;

    const nodeWidth = shouldShrink ? baseWidth : expandedWidth;
    const nodeHeight = shouldShrink ? baseHeight : expandedHeight;

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

    const metadata = node.metadata as Record<string, unknown> | undefined;
    const overrides = (metadata?.['styleOverrides'] as NodeStyleOverrides | undefined) ?? undefined;
    const shape: NodeShape = overrides?.shape ?? 'rounded';
    const cornerRadius = Math.max(0, overrides?.cornerRadius ?? 8) * camera.zoom;

    // Draw the node using styling (supports overrides)
    ctx.fillStyle = node.style.fill;
    ctx.strokeStyle = node.style.stroke;
    ctx.lineWidth = 2;

    DrawingPrimitives.drawShape(ctx, screenX, screenY, screenWidth, screenHeight, shape, cornerRadius);
    ctx.fill();
    ctx.stroke();

    const labelVisible = metadata?.['labelVisible'] !== false;
    const icon = node.style.icon;

    const contentPadding = 12 * camera.zoom;
    const baseX = screenX + contentPadding;
    let textStartX = baseX;
    const baseY = screenY + contentPadding;

    if (icon) {
      const iconSize = Math.min(20 * camera.zoom, screenHeight * 0.3);
      DrawingPrimitives.drawIcon(ctx, icon, baseX + iconSize / 2, baseY + iconSize / 2, iconSize, '#f8fafc', 'center');
      textStartX = baseX + iconSize + 8 * camera.zoom;
    }

    if (labelVisible && node.text) {
      DrawingPrimitives.drawText(
        ctx,
        node.text,
        textStartX,
        baseY + 12 * camera.zoom,
        16 * camera.zoom,
        '#e6edf3',
        'left',
        'middle'
      );
    }

    DrawingPrimitives.drawText(
      ctx,
      node.type,
      textStartX,
      baseY + 32 * camera.zoom,
      12 * camera.zoom,
      '#a0a9b8',
      'left',
      'middle'
    );

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
        const badgeCenterY = baseY + badgeHeight / 2 + index * (badgeHeight + badgeSpacing);
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

    // Draw child count badge if node is collapsed - EXACT same logic
    if (node.collapsed) {
      const childCount = this.countAllDescendants(node);
      if (childCount > 0) {
        this.drawChildCountBadge(ctx, screenX, screenY, screenWidth, screenHeight, childCount);
      }
    }

    // Recursively render children if not collapsed - EXACT same recursion
    if (!node.collapsed && node.children && node.children.length > 0) {
      console.log(`[HierarchicalPrimitive] Rendering ${node.children.length} children of ${node.GUID} at world pos (${worldX}, ${worldY})`);
      node.children.forEach(child => {
        console.log(`  Child ${child.GUID}: local pos (${child.x}, ${child.y}), world will be (${worldX + child.x}, ${worldY + child.y})`);
        this.draw(ctx, child, worldX, worldY, camera, collapseBehavior);
      });
    } else {
      if (node.children && node.children.length > 0) {
        console.log(`[HierarchicalPrimitive] NOT rendering ${node.children.length} children of ${node.GUID} - collapsed: ${node.collapsed}`);
      }
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

    const defaultWidth = typeof node.metadata?.['defaultWidth'] === 'number'
      ? Number(node.metadata['defaultWidth'])
      : COLLAPSED_NODE_WIDTH;
    const defaultHeight = typeof node.metadata?.['defaultHeight'] === 'number'
      ? Number(node.metadata['defaultHeight'])
      : COLLAPSED_NODE_HEIGHT;

    const nodeWidth = shouldShrink ? defaultWidth : node.width;
    const nodeHeight = shouldShrink ? defaultHeight : node.height;

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
    const defaultWidth = typeof node.metadata?.['defaultWidth'] === 'number'
      ? Number(node.metadata['defaultWidth'])
      : COLLAPSED_NODE_WIDTH;
    const defaultHeight = typeof node.metadata?.['defaultHeight'] === 'number'
      ? Number(node.metadata['defaultHeight'])
      : COLLAPSED_NODE_HEIGHT;

    const nodeWidth = shouldShrink ? defaultWidth : node.width;
    const nodeHeight = shouldShrink ? defaultHeight : node.height;

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
