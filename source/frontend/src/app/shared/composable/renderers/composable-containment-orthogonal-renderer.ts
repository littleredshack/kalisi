import { BaseRenderer } from '../../canvas/renderer';
import { HierarchicalNode, Edge, Camera, Point, Bounds, NodeEvent } from '../../canvas/types';
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
  render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], edges: Edge[], camera: Camera): void {
    // Calculate orthogonal waypoints for ALL edges (including inherited) BEFORE rendering
    // The engine already puts inherited edges in the edges array when nodes are collapsed
    this.calculateWaypointsForEdges(edges, nodes);

    // 2-pass rendering for proper z-order:
    // 1. Draw all nodes (hierarchical with containment)
    nodes.forEach(node => this.renderNodeHierarchy(ctx, node, 0, 0, camera));

    // 2. Draw all edges with orthogonal routing (includes inherited edges from collapsed nodes)
    edges.forEach(edge => {
      // Inherited edges have semi-transparent styling
      if (edge.id.startsWith('inherited-')) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        this.renderOrthogonalEdge(ctx, edge, nodes, camera);
        ctx.restore();
      } else {
        this.renderOrthogonalEdge(ctx, edge, nodes, camera);
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

  /**
   * Calculate orthogonal waypoints for edges - from flat renderer
   */
  private calculateWaypointsForEdges(edges: Edge[], nodes: HierarchicalNode[]): void {
    edges.forEach(edge => {
      // Use fromGUID/toGUID if available, otherwise fall back to from/to
      const fromId = edge.fromGUID || edge.from;
      const toId = edge.toGUID || edge.to;
      const fromNode = this.findNodeByGUID(fromId, nodes);
      const toNode = this.findNodeByGUID(toId, nodes);

      if (!fromNode || !toNode) {
        return;
      }

      // Get absolute positions for nodes (important for hierarchical nodes)
      const fromBounds = this.getAbsoluteNodeBounds(fromNode, nodes);
      const toBounds = this.getAbsoluteNodeBounds(toNode, nodes);


      // Get obstacles (all nodes except source and target)
      const obstacles = this.getAllNodeBounds(nodes)
        .filter(n => n.id !== fromId && n.id !== toId)
        .map(n => ({
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height
        }));

      // Calculate orthogonal path
      const waypoints = this.routingService.calculatePath(
        fromBounds,
        toBounds,
        obstacles
      );

      // Fix waypoints to attach at node borders instead of centers
      if (waypoints.length >= 2) {
        // Fix start point: calculate intersection with source node border
        const fromCenter = { x: fromBounds.x + fromBounds.width / 2, y: fromBounds.y + fromBounds.height / 2 };
        const toFirstWaypoint = waypoints[1] || waypoints[0];
        const fromBorderPoint = this.calculateBorderIntersection(fromBounds, fromCenter, toFirstWaypoint);
        waypoints[0] = fromBorderPoint;

        // Fix end point: calculate intersection with target node border
        const toCenter = { x: toBounds.x + toBounds.width / 2, y: toBounds.y + toBounds.height / 2 };
        const fromLastWaypoint = waypoints[waypoints.length - 2] || waypoints[waypoints.length - 1];
        const toBorderPoint = this.calculateBorderIntersection(toBounds, toCenter, fromLastWaypoint);
        waypoints[waypoints.length - 1] = toBorderPoint;
      }

      edge.waypoints = waypoints;
    });
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
   * Get absolute bounds for a node (accounting for parent positions and collapse behavior)
   */
  private getAbsoluteNodeBounds(node: HierarchicalNode, allNodes: HierarchicalNode[]): Bounds {
    // Determine if we should shrink this node
    const shouldShrink = node.collapsed && node.children && node.children.length > 0 && this.collapseBehavior === 'shrink';

    // Use smaller dimensions if collapsed and behavior is 'shrink'
    const nodeWidth = shouldShrink ? 180 : node.width;
    const nodeHeight = shouldShrink ? 60 : node.height;

    // For hierarchical nodes, we need to add parent offsets
    let x = node.x;
    let y = node.y;

    // Find parent and add its position (simplified - may need full path calculation)
    const parent = this.findParentNode(node, allNodes);
    if (parent) {
      const parentBounds = this.getAbsoluteNodeBounds(parent, allNodes);
      x += parentBounds.x;
      y += parentBounds.y;
    }

    return { x, y, width: nodeWidth, height: nodeHeight };
  }

  /**
   * Find parent node of a given node
   */
  private findParentNode(target: HierarchicalNode, nodes: HierarchicalNode[]): HierarchicalNode | null {
    for (const node of nodes) {
      if (node.children?.includes(target)) return node;
      if (node.children) {
        const found = this.findParentNode(target, node.children);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Get bounds for all nodes (flattened)
   */
  private getAllNodeBounds(nodes: HierarchicalNode[], parent?: { x: number, y: number }): Array<{ id: string, x: number, y: number, width: number, height: number }> {
    const bounds: Array<{ id: string, x: number, y: number, width: number, height: number }> = [];
    const offset = parent || { x: 0, y: 0 };

    nodes.forEach(node => {
      const absoluteX = offset.x + node.x;
      const absoluteY = offset.y + node.y;

      // Skip nodes without GUIDs (shouldn't happen in composable system)
      if (!node.GUID) {
        return;
      }

      // Determine if we should shrink this node
      const shouldShrink = node.collapsed && node.children && node.children.length > 0 && this.collapseBehavior === 'shrink';

      // Use smaller dimensions if collapsed and behavior is 'shrink'
      const nodeWidth = shouldShrink ? 180 : node.width;
      const nodeHeight = shouldShrink ? 60 : node.height;

      bounds.push({
        id: node.GUID,  // Use GUID only for composable system
        x: absoluteX,
        y: absoluteY,
        width: nodeWidth,
        height: nodeHeight
      });

      if (!node.collapsed && node.children) {
        bounds.push(...this.getAllNodeBounds(node.children, { x: absoluteX, y: absoluteY }));
      }
    });

    return bounds;
  }

  /**
   * Get center point of a node
   */
  private getNodeCenter(node: HierarchicalNode): Point {
    return {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2
    };
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
}