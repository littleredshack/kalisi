/**
 * Simple Force-Directed Renderer
 * Draws nodes as circles and edges as lines
 * Reads from viewGraph using observer pattern
 */

import { Camera, Bounds, NodeEvent } from '../../canvas/types';

export class ForceDirectedRenderer {
  private nodeRadius = 30;
  private layoutRuntime: any;
  private ctx: CanvasRenderingContext2D | null = null;
  private camera: Camera | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(layoutRuntime: any, ctx: CanvasRenderingContext2D, camera: Camera) {
    this.layoutRuntime = layoutRuntime;
    this.ctx = ctx;
    this.camera = camera;

    // Subscribe to viewGraph changes
    this.unsubscribe = layoutRuntime.subscribeToViewGraph(() => {
      this.render();
    });
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  updateCamera(camera: Camera): void {
    this.camera = camera;
  }

  getName(): string {
    return 'force-directed-renderer';
  }

  getDefaultNodeStyle(type: string): any {
    return { fill: '#22384f', stroke: '#5b7287' };
  }

  hitTest(worldX: number, worldY: number, nodes: any[]): NodeEvent | null {
    for (const node of nodes) {
      if (node.x === undefined || node.y === undefined) continue;
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= this.nodeRadius) {
        return {
          node: node as any,
          worldPosition: { x: node.x, y: node.y },
          screenPosition: { x: worldX, y: worldY },
          path: [node as any]
        };
      }
    }
    return null;
  }

  getNodeBounds(node: any): Bounds {
    return {
      x: (node.x || 0) - this.nodeRadius,
      y: (node.y || 0) - this.nodeRadius,
      width: this.nodeRadius * 2,
      height: this.nodeRadius * 2
    };
  }

  renderSelection(ctx: CanvasRenderingContext2D, node: any, camera: Camera): void {
    if (node.x === undefined || node.y === undefined) return;

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    ctx.beginPath();
    ctx.arc(node.x, node.y, this.nodeRadius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  render(): void {
    if (!this.ctx || !this.camera) return;

    const viewGraph = this.layoutRuntime.getViewGraph();
    const nodeArray = viewGraph.nodes || [];
    const edgeArray = viewGraph.edges || [];

    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.save();

    // Apply camera transform
    this.ctx.translate(this.camera.x, this.camera.y);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);

    // Draw edges first (behind nodes)
    edgeArray.forEach((edge: any) => {
      const sourceGuid = edge.fromGUID;
      const targetGuid = edge.toGUID;
      const sourceNode = nodeArray.find((n: any) => (n.guid || n.GUID || n.id) === sourceGuid);
      const targetNode = nodeArray.find((n: any) => (n.guid || n.GUID || n.id) === targetGuid);

      if (sourceNode && targetNode && sourceNode.x !== undefined && targetNode.x !== undefined) {
        this.ctx!.beginPath();
        this.ctx!.moveTo(sourceNode.x, sourceNode.y);
        this.ctx!.lineTo(targetNode.x, targetNode.y);

        // Different colors for different edge types
        if (edge.type === 'LINK') {
          this.ctx!.strokeStyle = '#60a5fa';
          this.ctx!.lineWidth = 2;
        } else {
          this.ctx!.strokeStyle = '#6b7280';
          this.ctx!.lineWidth = 1;
          this.ctx!.setLineDash([5, 5]);
        }

        this.ctx!.stroke();
        this.ctx!.setLineDash([]);
      }
    });

    // Draw nodes
    nodeArray.forEach((node: any) => {
      if (node.x === undefined || node.y === undefined) return;

      this.ctx!.beginPath();
      this.ctx!.arc(node.x, node.y, this.nodeRadius, 0, Math.PI * 2);

      // Color by type
      const nodeType = node.properties?.type || 'node';
      if (nodeType === 'container') {
        this.ctx!.fillStyle = '#1f2937';
        this.ctx!.strokeStyle = '#4b5563';
      } else if (nodeType === 'component') {
        this.ctx!.fillStyle = '#2d4f22';
        this.ctx!.strokeStyle = '#5b8729';
      } else {
        this.ctx!.fillStyle = '#22384f';
        this.ctx!.strokeStyle = '#5b7287';
      }

      this.ctx!.lineWidth = 2;
      this.ctx!.fill();
      this.ctx!.stroke();

      // Draw label
      const guid = node.guid || node.GUID || node.id || '';
      const label = node.properties?.name || guid.substring(0, 8);
      this.ctx!.fillStyle = '#e6edf3';
      this.ctx!.font = '12px sans-serif';
      this.ctx!.textAlign = 'center';
      this.ctx!.textBaseline = 'middle';
      this.ctx!.fillText(label, node.x, node.y);
    });

    this.ctx!.restore();
  }
}
