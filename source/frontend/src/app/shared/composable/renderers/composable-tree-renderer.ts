import { BaseRenderer } from '../../canvas/renderer';
import { HierarchicalNode, Edge, Camera, NodeEvent } from '../../canvas/types';
import { PresentationFrame } from '../../render/presentation-frame';
import { DrawingPrimitives } from '../../canvas/drawing-primitives';

const CORNER_RADIUS = 10;
const LINE_COLOR = '#4b5563';
const LABEL_COLOR = '#e6edf3';
const SECONDARY_LABEL_COLOR = '#9ca3af';

/**
 * Renderer that visualises hierarchical nodes as a vertical tree with
 * indented children and connecting lines. Designed for the Code Model view.
 */
export class ComposableTreeRenderer extends BaseRenderer {
  private renderCache: Array<{ node: HierarchicalNode; worldX: number; worldY: number }> = [];
  private lastFrameVersion = -1;
  private lastLensId: string | null = null;

  getName(): string {
    return 'composable-tree';
  }

  getDefaultNodeStyle(_type: string): any {
    return {
      fill: '#1f2937',
      stroke: '#4b5563'
    };
  }

  render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], _edges: Edge[], camera: Camera, frame?: PresentationFrame): void {
    const frameVersion = frame?.version ?? -1;
    const lensId = frame?.lensId ?? null;
    const delta = frame?.delta;

    let shouldRebuild =
      this.renderCache.length === 0 ||
      frameVersion !== this.lastFrameVersion ||
      lensId !== this.lastLensId ||
      !frame;

    if (!shouldRebuild && delta?.nodes) {
      shouldRebuild = delta.nodes.some(nodeDelta =>
        nodeDelta.hasGeometryChange || nodeDelta.hasStateChange || nodeDelta.hasMetadataChange
      );
    }

    if (shouldRebuild) {
      this.rebuildRenderCache(nodes);
      this.lastFrameVersion = frameVersion;
      this.lastLensId = lensId;
    }

    this.renderCache.forEach(entry => {
      const { node, worldX, worldY } = entry;

      const screenX = (worldX - camera.x) * camera.zoom;
      const screenY = (worldY - camera.y) * camera.zoom;
      const screenWidth = node.width * camera.zoom;
      const screenHeight = node.height * camera.zoom;

      if (this.isCulled(screenX, screenY, screenWidth, screenHeight, ctx)) {
        return;
      }

      this.drawConnections(ctx, node, worldX, worldY, camera);
      this.drawNode(ctx, node, screenX, screenY, screenWidth, screenHeight, camera);
      this.drawLabels(ctx, node, screenX, screenY, screenWidth, camera);
      this.drawCollapseIndicator(ctx, node, screenX, screenY, screenWidth, camera);
    });
  }

  override hitTest(worldX: number, worldY: number, nodes: HierarchicalNode[]): NodeEvent | null {
    return super.hitTest(worldX, worldY, nodes);
  }

  override getNodeBounds(node: HierarchicalNode) {
    return super.getNodeBounds(node);
  }

  private rebuildRenderCache(nodes: HierarchicalNode[]): void {
    this.renderCache = [];
    const traverse = (nodeList: HierarchicalNode[], parentWorldX: number, parentWorldY: number): void => {
      nodeList.forEach(node => {
        if (node.visible === false) {
          return;
        }
        const worldX = parentWorldX + node.x;
        const worldY = parentWorldY + node.y;
        this.renderCache.push({ node, worldX, worldY });
        if (!node.collapsed && node.children && node.children.length > 0) {
          traverse(node.children, worldX, worldY);
        }
      });
    };
    traverse(nodes, 0, 0);
  }

  private drawNode(
    ctx: CanvasRenderingContext2D,
    node: HierarchicalNode,
    screenX: number,
    screenY: number,
    screenWidth: number,
    screenHeight: number,
    camera: Camera
  ): void {
    ctx.save();
    ctx.fillStyle = node.style.fill;
    ctx.strokeStyle = node.style.stroke;
    ctx.lineWidth = 1.5 * camera.zoom;

    DrawingPrimitives.drawRoundedRect(ctx, screenX, screenY, screenWidth, screenHeight, CORNER_RADIUS * camera.zoom);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawLabels(
    ctx: CanvasRenderingContext2D,
    node: HierarchicalNode,
    screenX: number,
    screenY: number,
    screenWidth: number,
    camera: Camera
  ): void {
    ctx.save();
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = `${16 * camera.zoom}px Inter, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(node.text, screenX + 12 * camera.zoom, screenY + 12 * camera.zoom);

    const kind = (node.metadata?.['kind'] || node.type || '').toString();
    if (kind && kind.toLowerCase() !== 'directory') {
      ctx.fillStyle = SECONDARY_LABEL_COLOR;
      ctx.font = `${12 * camera.zoom}px Inter, sans-serif`;
      ctx.fillText(kind, screenX + 12 * camera.zoom, screenY + 32 * camera.zoom);
    }

    ctx.restore();
  }

  private drawConnections(
    ctx: CanvasRenderingContext2D,
    node: HierarchicalNode,
    worldX: number,
    worldY: number,
    camera: Camera
  ): void {
    if (!node.children.length || node.collapsed) {
      return;
    }

    const startX = worldX + node.width / 2;
    const startY = worldY + node.height;

    ctx.save();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1.5 * camera.zoom;

    node.children.forEach(child => {
      const childWorldX = worldX + child.x;
      const childWorldY = worldY + child.y;

      const endX = childWorldX + child.width / 2;
      const endY = childWorldY;

      ctx.beginPath();
      ctx.moveTo((startX - camera.x) * camera.zoom, (startY - camera.y) * camera.zoom);
      ctx.lineTo((endX - camera.x) * camera.zoom, (endY - camera.y) * camera.zoom);
      ctx.stroke();
    });

    ctx.restore();
  }

  private drawCollapseIndicator(
    ctx: CanvasRenderingContext2D,
    node: HierarchicalNode,
    screenX: number,
    screenY: number,
    screenWidth: number,
    camera: Camera
  ): void {
    if (!node.children.length) {
      return;
    }

    const indicatorSize = 10 * camera.zoom;
    const centerX = screenX + screenWidth - 18 * camera.zoom;
    const centerY = screenY + 18 * camera.zoom;

    ctx.save();
    ctx.strokeStyle = SECONDARY_LABEL_COLOR;
    ctx.lineWidth = 1.5 * camera.zoom;
    ctx.beginPath();
    ctx.moveTo(centerX - indicatorSize, centerY);
    ctx.lineTo(centerX + indicatorSize, centerY);
    ctx.stroke();

    if (node.collapsed) {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - indicatorSize);
      ctx.lineTo(centerX, centerY + indicatorSize);
      ctx.stroke();
    }
    ctx.restore();
  }

  private isCulled(
    screenX: number,
    screenY: number,
    screenWidth: number,
    screenHeight: number,
    ctx: CanvasRenderingContext2D
  ): boolean {
    return (
      screenX + screenWidth < 0 ||
      screenY + screenHeight < 0 ||
      screenX > ctx.canvas.width ||
      screenY > ctx.canvas.height
    );
  }
}
