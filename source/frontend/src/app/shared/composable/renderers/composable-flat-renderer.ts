import { BaseRenderer } from '../../canvas/renderer';
import { HierarchicalNode, Edge, Camera, Point, Bounds, NodeEvent } from '../../canvas/types';
import { PresentationFrame } from '../../render/presentation-frame';
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
interface IndexedNode {
  readonly id: string;
  readonly node: HierarchicalNode;
  readonly absoluteX: number;
  readonly absoluteY: number;
  readonly width: number;
  readonly height: number;
}

export class ComposableFlatRenderer extends BaseRenderer {
  private routingService = new OrthogonalRoutingService();
  private edgeWaypointCache = new Map<string, Point[]>();
  private lastFrameVersion = -1;
  private lastLensId: string | null = null;

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
  render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], edges: Edge[], camera: Camera, frame?: PresentationFrame): void {
    const frameVersion = frame?.version ?? -1;
    const lensId = frame?.lensId ?? null;
    const delta = frame?.delta;

    const dirtyNodeIds = new Set<string>();
    const dirtyEdgeIds = new Set<string>();

    if (delta?.nodes) {
      delta.nodes
        .filter(nodeDelta => nodeDelta.hasGeometryChange || nodeDelta.hasStateChange || nodeDelta.hasMetadataChange)
        .forEach(nodeDelta => dirtyNodeIds.add(nodeDelta.nodeId));
    }

    if (delta?.edges) {
      delta.edges
        .filter(edgeDelta => edgeDelta.hasChange)
        .forEach(edgeDelta => dirtyEdgeIds.add(edgeDelta.edgeId));
    }

    const hasFrame = Boolean(frame);
    const cacheInvalidated = hasFrame
      ? frameVersion !== this.lastFrameVersion || lensId !== this.lastLensId || !delta
      : this.lastFrameVersion === -1;

    if (cacheInvalidated) {
      this.edgeWaypointCache.clear();
    }

    const currentEdgeIds = new Set(edges.map(edge => edge.id));
    for (const cachedId of Array.from(this.edgeWaypointCache.keys())) {
      if (!currentEdgeIds.has(cachedId)) {
        this.edgeWaypointCache.delete(cachedId);
      }
    }

    const nodeIndex = this.buildNodeIndex(nodes);
    const indexedNodes = Array.from(nodeIndex.values());

    edges.forEach(edge => {
      const fromId = this.getEdgeNodeIdentifier(edge.fromGUID, edge.from);
      const toId = this.getEdgeNodeIdentifier(edge.toGUID, edge.to);

      const requiresUpdate =
        cacheInvalidated ||
        !this.edgeWaypointCache.has(edge.id) ||
        dirtyEdgeIds.has(edge.id) ||
        (fromId !== null && dirtyNodeIds.has(fromId)) ||
        (toId !== null && dirtyNodeIds.has(toId));

      if (!requiresUpdate) {
        return;
      }

      const waypoints = this.calculateWaypoints(edge, nodeIndex, indexedNodes);
      if (waypoints) {
        this.edgeWaypointCache.set(edge.id, waypoints);
      } else {
        this.edgeWaypointCache.delete(edge.id);
      }
    });

    if (hasFrame) {
      this.lastFrameVersion = frameVersion;
      this.lastLensId = lensId;
    }

    // Step 2: Render edges first (behind nodes) - EXACT same z-order
    edges.forEach(edge => {
      const fromNode = this.findNodeByIdentifier(this.getEdgeNodeIdentifier(edge.fromGUID, edge.from), nodeIndex);
      const toNode = this.findNodeByIdentifier(this.getEdgeNodeIdentifier(edge.toGUID, edge.to), nodeIndex);
      const cachedWaypoints = this.edgeWaypointCache.get(edge.id);
      const renderEdge = cachedWaypoints ? { ...edge, waypoints: cachedWaypoints } : edge;
      FlatEdgePrimitive.draw(ctx, renderEdge, fromNode, toNode, camera);
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
  private calculateWaypoints(
    edge: Edge,
    nodeIndex: Map<string, IndexedNode>,
    indexedNodes: IndexedNode[]
  ): Point[] | null {
    const fromId = this.getEdgeNodeIdentifier(edge.fromGUID, edge.from);
    const toId = this.getEdgeNodeIdentifier(edge.toGUID, edge.to);
    if (!fromId || !toId) {
      return null;
    }

    const fromEntry = nodeIndex.get(fromId);
    const toEntry = nodeIndex.get(toId);

    if (!fromEntry || !toEntry) {
      return null;
    }

    const fromBounds = {
      x: fromEntry.absoluteX,
      y: fromEntry.absoluteY,
      width: fromEntry.width,
      height: fromEntry.height
    };
    const toBounds = {
      x: toEntry.absoluteX,
      y: toEntry.absoluteY,
      width: toEntry.width,
      height: toEntry.height
    };

    const obstacles = indexedNodes
      .filter(entry => entry.id !== fromEntry.id && entry.id !== toEntry.id)
      .map(entry => ({
        x: entry.absoluteX,
        y: entry.absoluteY,
        width: entry.width,
        height: entry.height
      }));

    const waypoints = this.routingService.calculatePath(fromBounds, toBounds, obstacles);
    return waypoints.map(point => ({ x: point.x, y: point.y }));
  }

  /**
   * Find node by identifier - the ONLY way to identify nodes
   */
  private findNodeByIdentifier(identifier: string | null, nodeIndex: Map<string, IndexedNode>): HierarchicalNode | null {
    if (!identifier) {
      return null;
    }
    return nodeIndex.get(identifier)?.node ?? null;
  }

  private buildNodeIndex(nodes: HierarchicalNode[]): Map<string, IndexedNode> {
    const map = new Map<string, IndexedNode>();

    const traverse = (nodeList: HierarchicalNode[], offsetX: number, offsetY: number) => {
      nodeList.forEach(node => {
        const id = this.getNodeIdentifier(node);
        const absoluteX = offsetX + node.x;
        const absoluteY = offsetY + node.y;

        if (id) {
          map.set(id, {
            id,
            node,
            absoluteX,
            absoluteY,
            width: node.width,
            height: node.height
          });
        }

        if (node.children && node.children.length > 0) {
          traverse(node.children, absoluteX, absoluteY);
        }
      });
    };

    traverse(nodes, 0, 0);
    return map;
  }

  private getNodeIdentifier(node: HierarchicalNode): string | null {
    return node.GUID || node.id || null;
  }

  private getEdgeNodeIdentifier(guid: string | undefined, fallback: string): string | null {
    return guid ?? fallback ?? null;
  }
}
