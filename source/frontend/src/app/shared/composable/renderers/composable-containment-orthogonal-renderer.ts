import { BaseRenderer } from '../../canvas/renderer';
import { HierarchicalNode, Edge, Camera, Point, Bounds, NodeEvent } from '../../canvas/types';
import { PresentationFrame } from '../../render/presentation-frame';
import { HierarchicalNodePrimitive } from '../primitives/hierarchical-node-primitive';
import { FlatEdgePrimitive } from '../primitives/flat-edge-primitive';
import { OrthogonalRoutingService } from '../../../core/services/orthogonal-routing.service';
import { ViewNodeStateService, CollapseBehavior } from '../../../core/services/view-node-state.service';

/**
 * Composable Containment + Orthogonal Routing Renderer
 *
 * Combines:
 * - Hierarchical containment with expand/collapse from ComposableHierarchicalRenderer
 * - Orthogonal edge routing from ComposableFlatRenderer
 *
 * This gives us:
 * - Nested containers that can expand/collapse
 * - Clean orthogonal (horizontal/vertical) edge routing between nodes
 * - Proper z-ordering with 3-pass rendering
 * - Dynamic node sizing based on collapse behavior
 */
export class ComposableContainmentOrthogonalRenderer extends BaseRenderer {
  private routingService = new OrthogonalRoutingService();
  private viewNodeStateService?: ViewNodeStateService;
  private collapseBehavior: CollapseBehavior = 'full-size';
  private edgeWaypointCache = new Map<string, Point[]>();
  private nodeBoundsCache = new Map<string, Bounds>();
  private flattenedNodeBounds: Array<{ id: string; bounds: Bounds }> = [];
  private lastFrameVersion = -1;
  private lastLensId: string | null = null;

  /**
   * Set the ViewNodeStateService instance
   */
  setViewNodeStateService(service: ViewNodeStateService): void {
    this.viewNodeStateService = service;
    // Subscribe to collapse behavior changes
    service.collapseBehavior.subscribe(behavior => {
      this.collapseBehavior = behavior;
    });
  }

  getName(): string {
    return 'composable-containment-orthogonal';
  }

  /**
   * Get default node style - from hierarchical renderer
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
   * Main render method - combines hierarchical nodes with orthogonal edges
   */
  render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], edges: Edge[], camera: Camera, frame?: PresentationFrame): void {
    const frameVersion = frame?.version ?? -1;
    const lensId = frame?.lensId ?? null;
    const delta = frame?.delta;

    const dirtyNodeIds = new Set<string>();
    const dirtyEdgeIds = new Set<string>();

    if (delta?.nodes) {
      delta.nodes
        .filter(nodeDelta => nodeDelta.hasGeometryChange)
        .forEach(nodeDelta => dirtyNodeIds.add(nodeDelta.nodeId));
    }

    if (delta?.edges) {
      delta.edges
        .filter(edgeDelta => edgeDelta.hasChange)
        .forEach(edgeDelta => dirtyEdgeIds.add(edgeDelta.edgeId));
    }

    const cacheInvalidated =
      frameVersion < this.lastFrameVersion ||
      lensId !== this.lastLensId ||
      !delta ||
      this.lastFrameVersion === -1;

    if (cacheInvalidated || dirtyNodeIds.size > 0) {
      this.rebuildNodeBounds(nodes);
    }

    const currentEdgeIds = new Set(edges.map(edge => edge.id));
    for (const cachedId of Array.from(this.edgeWaypointCache.keys())) {
      if (!currentEdgeIds.has(cachedId)) {
        this.edgeWaypointCache.delete(cachedId);
      }
    }

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

      const waypoints = this.calculateEdgeWaypoints(edge, edges.length);
      if (waypoints) {
        this.edgeWaypointCache.set(edge.id, waypoints);
      } else {
        this.edgeWaypointCache.delete(edge.id);
      }
    });

    this.lastFrameVersion = frameVersion;
    this.lastLensId = lensId;

    // 2-pass rendering for proper z-order:
    // 1. Draw all nodes (hierarchical with containment)
    nodes.forEach(node => this.renderNodeHierarchy(ctx, node, 0, 0, camera));

    // 2. Draw all edges with orthogonal routing (includes inherited edges from collapsed nodes)
    edges.forEach(edge => {
      const renderEdge = this.edgeWaypointCache.has(edge.id)
        ? { ...edge, waypoints: this.edgeWaypointCache.get(edge.id)! }
        : edge;
      if (edge.id.startsWith('inherited-')) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        this.renderOrthogonalEdge(ctx, renderEdge, nodes, camera);
        ctx.restore();
      } else {
        this.renderOrthogonalEdge(ctx, renderEdge, nodes, camera);
      }
    });
  }

  /**
   * Render node hierarchy with containment - from hierarchical renderer
   */
  private renderNodeHierarchy(ctx: CanvasRenderingContext2D, node: HierarchicalNode, parentX: number, parentY: number, camera: Camera): void {
    // Use HierarchicalNodePrimitive for containment support with collapse behavior
    HierarchicalNodePrimitive.draw(ctx, node, parentX, parentY, camera, this.collapseBehavior);
  }

  private calculateEdgeWaypoints(edge: Edge, edgeCount: number): Point[] | null {
    const fromId = this.getEdgeNodeIdentifier(edge.fromGUID, edge.from);
    const toId = this.getEdgeNodeIdentifier(edge.toGUID, edge.to);

    if (!fromId || !toId) {
      return null;
    }

    const fromBounds = this.nodeBoundsCache.get(fromId);
    const toBounds = this.nodeBoundsCache.get(toId);

    if (!fromBounds || !toBounds) {
      return null;
    }

    const useSimpleRouting = this.flattenedNodeBounds.length > 600 || edgeCount > 800;

    if (useSimpleRouting) {
      const fromCenter = this.boundsCenter(fromBounds);
      const toCenter = this.boundsCenter(toBounds);
      return [
        { x: fromCenter.x, y: fromCenter.y },
        { x: toCenter.x, y: toCenter.y }
      ];
    }

    const obstacles = this.flattenedNodeBounds
      .filter(entry => entry.id !== fromId && entry.id !== toId)
      .map(entry => ({
        x: entry.bounds.x,
        y: entry.bounds.y,
        width: entry.bounds.width,
        height: entry.bounds.height
      }));

    const waypoints = this.routingService.calculatePath(fromBounds, toBounds, obstacles);
    const adjusted = waypoints.map(point => ({ x: point.x, y: point.y }));

    if (adjusted.length >= 2) {
      const fromCenter = this.boundsCenter(fromBounds);
      const toCenter = this.boundsCenter(toBounds);
      const toFirst = adjusted[1] ?? adjusted[0];
      const fromLast = adjusted[adjusted.length - 2] ?? adjusted[adjusted.length - 1];
      adjusted[0] = this.calculateBorderIntersection(fromBounds, fromCenter, toFirst);
      adjusted[adjusted.length - 1] = this.calculateBorderIntersection(toBounds, toCenter, fromLast);
    }

    return adjusted;
  }

  private rebuildNodeBounds(nodes: HierarchicalNode[]): void {
    this.nodeBoundsCache.clear();
    this.flattenedNodeBounds = [];
    this.collectNodeBounds(nodes, { x: 0, y: 0 });
  }

  private collectNodeBounds(nodes: HierarchicalNode[], offset: Point): void {
    nodes.forEach(node => {
      const id = this.getNodeIdentifier(node);
      if (!id) {
        return;
      }

      const shouldShrink =
        node.collapsed && node.children && node.children.length > 0 && this.collapseBehavior === 'shrink';
      const width = shouldShrink ? 180 : node.width;
      const height = shouldShrink ? 60 : node.height;
      const absolute: Bounds = {
        x: offset.x + node.x,
        y: offset.y + node.y,
        width,
        height
      };

      this.nodeBoundsCache.set(id, absolute);
      this.flattenedNodeBounds.push({ id, bounds: absolute });

      if (!node.collapsed && node.children && node.children.length > 0) {
        this.collectNodeBounds(node.children, { x: absolute.x, y: absolute.y });
      }
    });
  }

  private getEdgeNodeIdentifier(guid: string | undefined, fallback: string): string | null {
    return guid ?? fallback ?? null;
  }

  private getNodeIdentifier(node: HierarchicalNode): string | null {
    return node.GUID || node.id || null;
  }

  private boundsCenter(bounds: Bounds): Point {
    return {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2
    };
  }

  /**
   * Calculate border intersection point for edge attachment
   * Uses same logic as DrawingPrimitives.roundedRectRayHit
   */
  private calculateBorderIntersection(nodeBounds: Bounds, nodeCenter: Point, targetPoint: Point): Point {
    const cornerRadius = 12; // Same as node corner radius

    // Use same ray-hit calculation as flat-edge-primitive
    const hit = this.roundedRectRayHit(
      { x: nodeBounds.x, y: nodeBounds.y, width: nodeBounds.width, height: nodeBounds.height },
      cornerRadius,
      nodeCenter,
      targetPoint
    );

    return hit || nodeCenter; // Fallback to center if no intersection
  }

  /**
   * Ray-rectangle intersection for rounded rectangles
   * Copied from DrawingPrimitives.roundedRectRayHit logic
   */
  private roundedRectRayHit(rect: Bounds, cornerRadius: number, rayStart: Point, rayEnd: Point): Point | null {
    // Simplified ray-rectangle intersection
    // For now, just calculate intersection with rectangle edges (without corner rounding)
    const dx = rayEnd.x - rayStart.x;
    const dy = rayEnd.y - rayStart.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Ray is more horizontal - intersect with left/right edges
      const targetX = dx > 0 ? rect.x + rect.width : rect.x;
      const t = (targetX - rayStart.x) / dx;
      const y = rayStart.y + t * dy;

      if (y >= rect.y && y <= rect.y + rect.height) {
        return { x: targetX, y };
      }
    } else {
      // Ray is more vertical - intersect with top/bottom edges
      const targetY = dy > 0 ? rect.y + rect.height : rect.y;
      const t = (targetY - rayStart.y) / dy;
      const x = rayStart.x + t * dx;

      if (x >= rect.x && x <= rect.x + rect.width) {
        return { x, y: targetY };
      }
    }

    return null;
  }

  /**
   * Render edge with orthogonal routing
   */
  private renderOrthogonalEdge(ctx: CanvasRenderingContext2D, edge: Edge, nodes: HierarchicalNode[], camera: Camera): void {
    // Find the nodes for this edge
    const fromId = edge.fromGUID || edge.from;
    const toId = edge.toGUID || edge.to;
    const fromNode = this.findNodeByGUID(fromId, nodes);
    const toNode = this.findNodeByGUID(toId, nodes);

    // Use flat edge primitive which draws using waypoints
    FlatEdgePrimitive.draw(ctx, edge, fromNode, toNode, camera);
  }


  /**
   * Get node bounds - from base renderer
   */
  override getNodeBounds(node: HierarchicalNode): Bounds {
    return HierarchicalNodePrimitive.getBounds(node, 0, 0, { x: 0, y: 0, zoom: 1 }, this.collapseBehavior);
  }

  /**
   * Find node by GUID - searches hierarchically
   * MUST use GUID only for composable system
   * Only returns VISIBLE nodes (not inside collapsed parents)
   */
  private findNodeByGUID(guid: string, nodes: HierarchicalNode[]): HierarchicalNode | null {
    // First check top-level nodes - GUID only!
    const found = nodes.find(node => node.GUID === guid);
    if (found) return found;

    // Then search recursively through children - but ONLY if parent is not collapsed
    for (const node of nodes) {
      if (!node.collapsed) {  // Only search in expanded nodes
        const childResult = this.findNodeInChildren(guid, node);
        if (childResult) return childResult;
      }
    }

    return null;
  }

  /**
   * Recursively find node in children
   * MUST use GUID only for composable system
   * Only searches in expanded nodes
   */
  private findNodeInChildren(guid: string, parent: HierarchicalNode): HierarchicalNode | null {
    if (!parent.children || parent.collapsed) return null;  // Don't search in collapsed nodes

    for (const child of parent.children) {
      if (child.GUID === guid) return child;  // GUID only!
      if (!child.collapsed) {  // Only search in expanded children
        const found = this.findNodeInChildren(guid, child);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Handle click events for expand/collapse
   */
  handleNodeClick(node: HierarchicalNode, worldX: number, worldY: number): boolean {
    // Check if it's a collapse/expand toggle
    const bounds = this.getNodeBounds(node);

    // Check if click is on collapse/expand button area (top-right corner)
    const buttonX = bounds.x + bounds.width - 30;
    const buttonY = bounds.y + 10;
    const buttonSize = 20;

    if (worldX >= buttonX && worldX <= buttonX + buttonSize &&
        worldY >= buttonY && worldY <= buttonY + buttonSize) {
      // Toggle collapsed state
      node.collapsed = !node.collapsed;
      return true;
    }

    return false;
  }

  override renderSelection(ctx: CanvasRenderingContext2D, node: HierarchicalNode, camera: Camera): void {
    // Selection outline rendered by the canvas engine for accurate positioning.
  }
}
