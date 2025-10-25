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
    console.log('[ForceDirectedRenderer.render] Called');
    if (!this.ctx || !this.camera) {
      console.log('[ForceDirectedRenderer.render] Missing ctx or camera');
      return;
    }

    const viewGraph = this.layoutRuntime.getViewGraph();

    console.log('[ForceDirectedRenderer.render] ViewGraph edges received:', viewGraph.edges?.length || 0);
    if (viewGraph.edges && viewGraph.edges.length > 0) {
      viewGraph.edges.forEach((edge: any, i: number) => {
        if (i < 5) {
          console.log(`[ForceDirectedRenderer.render] ViewGraph Edge ${i}:`, edge.id, 'from:', edge.fromGUID, 'to:', edge.toGUID, 'label:', edge.label);
        }
      });
    }

    console.log('[ForceDirectedRenderer.render] Root nodes:', (viewGraph.nodes || []).length);
    (viewGraph.nodes || []).forEach((n: any, i: number) => {
      console.log(`[ForceDirectedRenderer.render] Root ${i} children:`, n.children?.length || 0);
    });

    // Flatten hierarchical nodes for force-directed rendering
    const flattenNodes = (nodes: any[]): any[] => {
      const flat: any[] = [];
      const traverse = (nodeList: any[]) => {
        nodeList.forEach(node => {
          flat.push(node);
          if (node.children && node.children.length > 0) {
            traverse(node.children);
          }
        });
      };
      traverse(nodes);
      return flat;
    };

    const nodeArray = flattenNodes(viewGraph.nodes || []);
    const edgeArray = viewGraph.edges || [];

    console.log('[ForceDirectedRenderer.render] After flatten - nodes:', nodeArray.length, 'edges:', edgeArray.length);
    if (edgeArray.length > 0) {
      console.log('[ForceDirectedRenderer.render] Sample edge:', edgeArray[0].id, 'from:', edgeArray[0].fromGUID, 'to:', edgeArray[0].toGUID, 'type:', (edgeArray[0] as any).type);
    }
    if (nodeArray.length > 0) {
      console.log('[ForceDirectedRenderer.render] Sample node:', nodeArray[0].GUID, 'x:', nodeArray[0].x, 'y:', nodeArray[0].y);
    }
    console.log('[ForceDirectedRenderer.render] Camera:', this.camera.x, this.camera.y, 'zoom:', this.camera.zoom);
    console.log('[ForceDirectedRenderer.render] Canvas:', this.ctx.canvas.width, 'x', this.ctx.canvas.height);

    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.save();

    // Apply camera transform
    this.ctx.translate(this.camera.x, this.camera.y);
    this.ctx.scale(this.camera.zoom, this.camera.zoom);

    // Draw edges first (behind nodes)
    edgeArray.forEach((edge: any) => {
      const sourceGuid = edge.fromGUID;
      const targetGuid = edge.toGUID;
      const sourceNode = nodeArray.find((n: any) => n.GUID === sourceGuid);
      const targetNode = nodeArray.find((n: any) => n.GUID === targetGuid);

      if (sourceNode && targetNode && sourceNode.x !== undefined && targetNode.x !== undefined) {
        this.ctx!.beginPath();
        this.ctx!.moveTo(sourceNode.x, sourceNode.y);
        this.ctx!.lineTo(targetNode.x, targetNode.y);

        // Different colors for different edge types
        if (edge.type === 'LINK') {
          this.ctx!.strokeStyle = '#60a5fa';
          this.ctx!.lineWidth = 2;
        } else if (edge.type === 'CONTAINS') {
          this.ctx!.strokeStyle = '#3b82f6';
          this.ctx!.lineWidth = 2;
          this.ctx!.setLineDash([5, 5]);
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
    let drawnCount = 0;
    nodeArray.forEach((node: any) => {
      if (node.x === undefined || node.y === undefined) {
        console.log('[ForceDirectedRenderer.render] Skipping node - no x/y:', node.GUID);
        return;
      }
      drawnCount++;

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
      const label = node.properties?.name || (node.GUID || '').substring(0, 8);
      this.ctx!.fillStyle = '#e6edf3';
      this.ctx!.font = '12px sans-serif';
      this.ctx!.textAlign = 'center';
      this.ctx!.textBaseline = 'middle';
      this.ctx!.fillText(label, node.x, node.y);
    });

    console.log('[ForceDirectedRenderer.render] Drew', drawnCount, 'nodes');

    this.ctx!.restore();
  }
}
