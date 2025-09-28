import { BaseRenderer } from '../../canvas/renderer';
import { HierarchicalNode, Edge, Camera, Point, Bounds, NodeEvent } from '../../canvas/types';
import { FlatNodePrimitive } from '../primitives/flat-node-primitive';
import { FlatEdgePrimitive } from '../primitives/flat-edge-primitive';
import { OrthogonalRoutingService } from '../../../core/services/orthogonal-routing.service';

/**
 * Composable Flat Graph Renderer
 * EXACT replica of FlatGraphRenderingStrategy but using composable primitives
 *
 * This renderer:
 * 1. Uses the same orthogonal routing for edges
 * 2. Renders edges behind nodes (same z-order)
 * 3. Uses exact same visual specifications (colors, sizes, etc.)
 * 4. Supports same interactions (drag, zoom, pan)
 */
export class ComposableFlatRenderer extends BaseRenderer {
  private routingService = new OrthogonalRoutingService();

  getName(): string {
    return 'composable-flat';
  }

  /**
   * Get default node style - EXACT same as GraphRenderer
   */
  getDefaultNodeStyle(type: string): any {
    const styles = {
      container: { fill: "#1f2937", stroke: "#4b5563" },
      node: { fill: "#22384f", stroke: "#5b7287" },
      component: { fill: "#2d4f22", stroke: "#5b8729" }
    };
    return styles[type as keyof typeof styles] || styles.node;
  }

  /**
   * Main render method - orchestrates primitives in exact same order as FlatGraphRenderingStrategy
   */
  render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], edges: Edge[], camera: Camera): void {
    // Step 1: Calculate waypoints for all edges (EXACT same as original)
    // This recalculates on every render for node movement
    this.calculateWaypointsForEdges(edges, nodes);

    // Step 2: Render edges first (behind nodes) - EXACT same z-order
    edges.forEach(edge => {
      const fromNode = this.findNodeById(edge.from, nodes);
      const toNode = this.findNodeById(edge.to, nodes);
      FlatEdgePrimitive.draw(ctx, edge, fromNode, toNode, camera);
    });

    // Step 3: Render nodes on top of edges
    nodes.forEach(node => {
      FlatNodePrimitive.draw(ctx, node, camera);
    });
  }

  /**
   * Hit testing - uses composable primitive
   */
  override hitTest(worldX: number, worldY: number, nodes: HierarchicalNode[]): NodeEvent | null {
    // Test nodes in reverse order (top to bottom)
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.visible !== false && FlatNodePrimitive.hitTest(node, worldX, worldY)) {
        return {
          node,
          worldPosition: { x: node.x, y: node.y },
          screenPosition: { x: 0, y: 0 }, // Will be filled by caller
          path: [node] // Flat graph has no hierarchy
        };
      }
    }
    return null;
  }

  /**
   * Get node bounds - uses composable primitive
   */
  override getNodeBounds(node: HierarchicalNode): Bounds {
    return FlatNodePrimitive.getBounds(node);
  }

  /**
   * Render selection - custom selection rendering for flat graph
   */
  override renderSelection(ctx: CanvasRenderingContext2D, node: HierarchicalNode, camera: Camera): void {
    // Apply camera transform
    const screenX = (node.x - camera.x) * camera.zoom;
    const screenY = (node.y - camera.y) * camera.zoom;
    const screenWidth = node.width * camera.zoom;
    const screenHeight = node.height * camera.zoom;

    // Draw selection outline
    ctx.strokeStyle = '#6ea8fe';
    ctx.lineWidth = 2;
    ctx.setLineDash([5 * camera.zoom, 5 * camera.zoom]);

    // Draw with same corner radius as nodes
    const radius = 12 * camera.zoom;
    ctx.beginPath();
    ctx.roundRect(screenX - 2, screenY - 2, screenWidth + 4, screenHeight + 4, radius);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Calculate orthogonal waypoints for edges - EXACT copy from FlatGraphRenderingStrategy
   */
  private calculateWaypointsForEdges(edges: Edge[], nodes: HierarchicalNode[]): void {
    edges.forEach(edge => {
      // Always recalculate waypoints to handle node movement
      // Use fromGUID/toGUID if available, otherwise fall back to from/to
      const fromId = edge.fromGUID || edge.from;
      const toId = edge.toGUID || edge.to;
      const fromNode = this.findNodeById(fromId, nodes);
      const toNode = this.findNodeById(toId, nodes);

      if (!fromNode || !toNode) {
        return;
      }

      // Get obstacles (all nodes except source and target)
      const obstacles = nodes
        .filter(n => n.id !== edge.from && n.id !== edge.to)
        .map(n => ({
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height
        }));

      // Calculate orthogonal path
      const waypoints = this.routingService.calculatePath(
        { x: fromNode.x, y: fromNode.y, width: fromNode.width, height: fromNode.height },
        { x: toNode.x, y: toNode.y, width: toNode.width, height: toNode.height },
        obstacles
      );

      edge.waypoints = waypoints;
    });
  }

  /**
   * Find node by GUID - the ONLY way to identify nodes
   */
  private findNodeById(guid: string, nodes: HierarchicalNode[]): HierarchicalNode | null {
    // ONLY use GUID for node identification
    return nodes.find(node => node.GUID === guid) || null;
  }
}