import { BaseRenderer } from '../../canvas/renderer';
import { HierarchicalNode, Edge, Camera, Bounds } from '../../canvas/types';
import { TreeTableColumn } from '../../tree-table/tree-table.types';

export class ComposableTreeTableRenderer extends BaseRenderer {
  private labelAreaRatio = 0.45;
  private rowCornerRadius = 6;

  getName(): string {
    return 'ComposableTreeTableRenderer';
  }

  getDefaultNodeStyle(): any {
    return {
      fill: 'rgba(27, 38, 53, 0.85)',
      stroke: 'rgba(80, 112, 160, 0.35)'
    };
  }

  override render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], _edges: Edge[], camera: Camera): void {
    ctx.save();
    ctx.font = `${14 * camera.zoom}px "Inter", "Roboto", sans-serif`;
    ctx.textBaseline = 'middle';

    const renderNode = (node: HierarchicalNode, path: HierarchicalNode[]) => {
      if (node.visible === false) {
        return;
      }

      const worldPos = this.getAbsolutePositionFromPath(path);
      const screenPos = this.worldToScreen(worldPos, camera);
      const screenWidth = node.width * camera.zoom;
      const screenHeight = node.height * camera.zoom;

      const metadata = node.metadata || {} as any;
      const rowIndex = metadata.rowIndex ?? 0;
      const depth = metadata.depth ?? 0;
      const columns = (metadata.columns ?? []) as TreeTableColumn[];
      const values = metadata.values ?? {};

      // Row background
      ctx.beginPath();
      ctx.fillStyle = rowIndex % 2 === 0 ? 'rgba(24, 32, 46, 0.9)' : 'rgba(20, 27, 40, 0.9)';
      this.roundRect(ctx, screenPos.x, screenPos.y, screenWidth, screenHeight, this.rowCornerRadius * camera.zoom);
      ctx.fill();

      // Border line
      ctx.strokeStyle = 'rgba(68, 102, 150, 0.35)';
      ctx.lineWidth = 1 * camera.zoom;
      ctx.stroke();

      // Expand/collapse icon
      const iconSize = 10 * camera.zoom;
      if (node.children && node.children.length > 0) {
        ctx.fillStyle = '#9fb5d4';
        ctx.beginPath();
        const iconX = screenPos.x + 16 * camera.zoom;
        const iconY = screenPos.y + screenHeight / 2;
        if (node.collapsed) {
          ctx.moveTo(iconX - iconSize / 2, iconY - iconSize / 2);
          ctx.lineTo(iconX + iconSize / 2, iconY);
          ctx.lineTo(iconX - iconSize / 2, iconY + iconSize / 2);
        } else {
          ctx.moveTo(iconX - iconSize / 2, iconY - iconSize / 2);
          ctx.lineTo(iconX + iconSize / 2, iconY - iconSize / 2);
          ctx.lineTo(iconX, iconY + iconSize / 2);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Label text (with depth indentation)
      const labelIndent = (depth * 18 + 36) * camera.zoom;
      const textX = screenPos.x + labelIndent;
      const textY = screenPos.y + screenHeight / 2;
      ctx.fillStyle = '#e6edf7';
      ctx.fillText(node.text ?? '', textX, textY);

      // Column values
      const labelAreaWidth = screenWidth * this.labelAreaRatio;
      const remainingWidth = Math.max(screenWidth - labelAreaWidth, 100 * camera.zoom);
      const columnWidth = columns.length > 0 ? remainingWidth / columns.length : 0;
      let columnX = screenPos.x + labelAreaWidth;

      columns.forEach((column: TreeTableColumn) => {
        const value = values[column.key];
        const formatted = value?.formatted ?? value?.raw ?? '';
        ctx.fillStyle = '#c2d4f2';
        ctx.fillText(String(formatted), columnX + 12 * camera.zoom, textY);

        // Divider line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(90, 118, 155, 0.35)';
        ctx.moveTo(columnX, screenPos.y);
        ctx.lineTo(columnX, screenPos.y + screenHeight);
        ctx.stroke();

        columnX += columnWidth;
      });

      if (!node.collapsed) {
        node.children.forEach(child => renderNode(child, [...path, child]));
      }
    };

    nodes.forEach(node => renderNode(node, [node]));
    ctx.restore();
  }

  override renderSelection(ctx: CanvasRenderingContext2D, node: HierarchicalNode, camera: Camera): void {
    const worldPos = this.getAbsolutePositionFromPath([node]);
    const screenPos = this.worldToScreen(worldPos, camera);
    const screenWidth = node.width * camera.zoom;
    const screenHeight = node.height * camera.zoom;

    ctx.save();
    ctx.strokeStyle = '#6ea8fe';
    ctx.lineWidth = 2 * camera.zoom;
    ctx.setLineDash([6 * camera.zoom, 4 * camera.zoom]);
    this.roundRect(ctx, screenPos.x, screenPos.y, screenWidth, screenHeight, this.rowCornerRadius * camera.zoom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  override getNodeBounds(node: HierarchicalNode): Bounds {
    return {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    };
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }
}
