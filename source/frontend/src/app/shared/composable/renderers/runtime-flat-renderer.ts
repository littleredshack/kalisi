import { BaseRenderer } from '../../canvas/renderer';
import { HierarchicalNode, Edge, Camera, Point, Bounds, NodeEvent } from '../../canvas/types';
import { PresentationFrame } from '../../render/presentation-frame';
import { FlatNodePrimitive } from '../primitives/flat-node-primitive';
import { FlatEdgePrimitive } from '../primitives/flat-edge-primitive';
import { OrthogonalRoutingService } from '../../../core/services/orthogonal-routing.service';

/**
 * Runtime Flat Renderer
 *
 * Wraps ComposableFlatRenderer to work with runtime containment engine in flat mode.
 * Shows all nodes as independent shapes with visible CONTAINS edges.
 *
 * Key differences from regular flat renderer:
 * - Preserves runtime metadata (badges, style overrides)
 * - Supports incremental delta updates from PresentationFrame
 * - Works with runtime containment engine in flat mode
 * - Shows CONTAINS edges as visible lines (not hidden by visual hierarchy)
 */
interface IndexedNode {
  readonly id: string;
  readonly node: HierarchicalNode;
  readonly absoluteX: number;
  readonly absoluteY: number;
  readonly width: number;
  readonly height: number;
}

export class RuntimeFlatRenderer extends BaseRenderer {
  private routingService = new OrthogonalRoutingService();
  private edgeWaypointCache = new Map<string, Point[]>();
  private lastFrameVersion = -1;
  private lastLensId: string | null = null;

  getName(): string {
    return 'runtime-flat-renderer';
  }

  /**
   * Get default node style
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
   * Main render method - renders all nodes flat with visible CONTAINS edges
   */
  render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], edges: Edge[], camera: Camera, frame?: PresentationFrame): void {
    const frameVersion = frame?.version ?? -1;
    const lensId = frame?.lensId ?? null;
    const delta = frame?.delta;

    const renderableEdges = edges.filter(edge => edge.metadata?.['visible'] !== false);

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

    // Clean up stale cache entries
    const currentEdgeIds = new Set(renderableEdges.map(edge => edge.id));
    for (const cachedId of Array.from(this.edgeWaypointCache.keys())) {
      if (!currentEdgeIds.has(cachedId)) {
        this.edgeWaypointCache.delete(cachedId);
      }
    }

    const nodeIndex = this.buildNodeIndex(nodes);
    const indexedNodes = Array.from(nodeIndex.values());

    // Update edge waypoints
    renderableEdges.forEach(edge => {
      const fromId = edge.fromGUID;
      const toId = edge.toGUID;

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

    // Render edges first (behind nodes)
    renderableEdges.forEach(edge => {
      const fromNode = this.findNodeByIdentifier(edge.fromGUID, nodeIndex);
      const toNode = this.findNodeByIdentifier(edge.toGUID, nodeIndex);
      const cachedWaypoints = this.edgeWaypointCache.get(edge.id);
      const renderEdge = cachedWaypoints ? { ...edge, waypoints: cachedWaypoints } : edge;
      FlatEdgePrimitive.draw(ctx, renderEdge, fromNode, toNode, camera);
    });

    // Render all nodes (including children) as flat independent shapes
    this.renderFlatNodes(ctx, nodes, camera);
  }

  /**
   * Recursively render all nodes as flat (not nested)
   * Nodes must be rendered at their absolute world positions
   */
  private renderFlatNodes(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], camera: Camera, offsetX: number = 0, offsetY: number = 0): void {
    nodes.forEach(node => {
      if (node.visible !== false) {
        // Create a temporary node with absolute coordinates for rendering
        const absoluteNode = {
          ...node,
          x: offsetX + node.x,
          y: offsetY + node.y
        };
        FlatNodePrimitive.draw(ctx, absoluteNode, camera);
      }
      // Recursively render children as independent nodes at absolute positions
      if (node.children && node.children.length > 0) {
        this.renderFlatNodes(ctx, node.children, camera, offsetX + node.x, offsetY + node.y);
      }
    });
  }

  /**
   * Hit testing - must use absolute coordinates
   */
  override hitTest(worldX: number, worldY: number, nodes: HierarchicalNode[]): NodeEvent | null {
    // Build node index to get absolute positions
    const nodeIndex = this.buildNodeIndex(nodes);
    const indexedNodes = Array.from(nodeIndex.values());

    // Test nodes in reverse order (top to bottom)
    for (let i = indexedNodes.length - 1; i >= 0; i--) {
      const indexed = indexedNodes[i];
      const node = indexed.node;

      if (node.visible !== false) {
        // Create absolute node for hit testing
        const absoluteNode = {
          ...node,
          x: indexed.absoluteX,
          y: indexed.absoluteY
        };

        if (FlatNodePrimitive.hitTest(absoluteNode, worldX, worldY)) {
          return {
            node,
            worldPosition: { x: indexed.absoluteX, y: indexed.absoluteY },
            screenPosition: { x: 0, y: 0 }, // Will be filled by caller
            path: [node]
          };
        }
      }
    }
    return null;
  }

  /**
   * Flatten hierarchical nodes into single array
   */
  private flattenNodes(nodes: HierarchicalNode[]): HierarchicalNode[] {
    const result: HierarchicalNode[] = [];
    const traverse = (nodeList: HierarchicalNode[]) => {
      nodeList.forEach(node => {
        result.push(node);
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      });
    };
    traverse(nodes);
    return result;
  }

  /**
   * Get node bounds
   */
  override getNodeBounds(node: HierarchicalNode): Bounds {
    return FlatNodePrimitive.getBounds(node);
  }

  /**
   * Render selection - receives node path for absolute position calculation
   */
  override renderSelection(ctx: CanvasRenderingContext2D, node: HierarchicalNode, camera: Camera, path?: HierarchicalNode[]): void {
    // Calculate absolute position from path if provided
    let absoluteX = node.x;
    let absoluteY = node.y;

    if (path && path.length > 0) {
      absoluteX = 0;
      absoluteY = 0;
      path.forEach(pathNode => {
        absoluteX += pathNode.x;
        absoluteY += pathNode.y;
      });
    }

    const screenX = (absoluteX - camera.x) * camera.zoom;
    const screenY = (absoluteY - camera.y) * camera.zoom;
    const screenWidth = node.width * camera.zoom;
    const screenHeight = node.height * camera.zoom;

    ctx.strokeStyle = '#6ea8fe';
    ctx.lineWidth = 2;
    ctx.setLineDash([5 * camera.zoom, 5 * camera.zoom]);

    const radius = 12 * camera.zoom;
    ctx.beginPath();
    ctx.roundRect(screenX - 2, screenY - 2, screenWidth + 4, screenHeight + 4, radius);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Calculate orthogonal waypoints for edges
   */
  private calculateWaypoints(
    edge: Edge,
    nodeIndex: Map<string, IndexedNode>,
    indexedNodes: IndexedNode[]
  ): Point[] | null {
    const fromId = edge.fromGUID;
    const toId = edge.toGUID;
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

  override invalidateCache = (): void => {
    this.edgeWaypointCache.clear();
    this.lastFrameVersion = -1;
    this.lastLensId = null;
  };
}
