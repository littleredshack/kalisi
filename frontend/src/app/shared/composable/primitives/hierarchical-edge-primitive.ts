import { HierarchicalNode, Edge, Camera, Point } from '../../canvas/types';
import { DrawingPrimitives } from '../../canvas/drawing-primitives';

/**
 * Hierarchical edge drawing primitive - EXACT replica of hierarchical edge rendering
 * Extracted from HierarchicalRenderingStrategy.renderEdge() for composability
 *
 * Handles:
 * - Complex hierarchical coordinate calculations for edge endpoints
 * - Border intersection calculations with rounded rectangles
 * - Camera transforms and waypoint handling
 * - Edge labels and inherited edge rendering
 */
export class HierarchicalEdgePrimitive {

  /**
   * Draw an edge between two hierarchical nodes
   * EXACT replica of HierarchicalRenderingStrategy.renderEdge()
   */
  static draw(
    ctx: CanvasRenderingContext2D,
    edge: Edge,
    nodes: HierarchicalNode[],
    camera: Camera
  ): void {
    const fromNode = this.findNodeById(edge.from, nodes);
    const toNode = this.findNodeById(edge.to, nodes);

    if (!fromNode || !toNode) {
      return;
    }

    // Get world positions and centers (exact same logic)
    const fromWorldPos = this.getAbsolutePosition(fromNode, nodes);
    const toWorldPos = this.getAbsolutePosition(toNode, nodes);

    const fromCenter = {
      x: fromWorldPos.x + fromNode.width / 2,
      y: fromWorldPos.y + fromNode.height / 2
    };
    const toCenter = {
      x: toWorldPos.x + toNode.width / 2,
      y: toWorldPos.y + toNode.height / 2
    };

    // Calculate exact border intersection points using drawing primitive (exact same logic)
    const cornerRadius = 8;
    const fromBorderPoint = DrawingPrimitives.roundedRectRayHit(
      fromCenter, fromNode.width, fromNode.height, cornerRadius, toCenter
    );
    const toBorderPoint = DrawingPrimitives.roundedRectRayHit(
      toCenter, toNode.width, toNode.height, cornerRadius, fromCenter
    );

    // Convert border points to screen coordinates (exact same transform)
    const fromScreenPoint = {
      x: (fromBorderPoint.x - camera.x) * camera.zoom,
      y: (fromBorderPoint.y - camera.y) * camera.zoom
    };
    const toScreenPoint = {
      x: (toBorderPoint.x - camera.x) * camera.zoom,
      y: (toBorderPoint.y - camera.y) * camera.zoom
    };

    // Transform waypoints to screen coordinates if they exist (exact same logic)
    let screenWaypoints: Point[] | undefined;
    if (edge.waypoints && edge.waypoints.length > 0) {
      screenWaypoints = edge.waypoints.map(wp => ({
        x: (wp.x - camera.x) * camera.zoom,
        y: (wp.y - camera.y) * camera.zoom
      }));
    }

    // Draw connection line using drawing primitive (exact same call)
    DrawingPrimitives.drawConnectionLine(ctx, fromScreenPoint, toScreenPoint, {
      stroke: edge.style.stroke,
      strokeWidth: edge.style.strokeWidth * camera.zoom,
      strokeDashArray: edge.style.strokeDashArray?.map(d => d * camera.zoom) || null
    }, screenWaypoints);

    // Draw edge label using drawing primitive (exact same positioning)
    const midScreenX = (fromScreenPoint.x + toScreenPoint.x) / 2;
    const midScreenY = (fromScreenPoint.y + toScreenPoint.y) / 2;
    DrawingPrimitives.drawText(
      ctx,
      edge.label || '',
      midScreenX,
      midScreenY,
      12 * camera.zoom,
      edge.style.stroke
    );
  }

  /**
   * Draw inherited edge with special styling
   * EXACT replica of HierarchicalRenderingStrategy.renderInheritedEdge()
   */
  static drawInheritedEdge(
    ctx: CanvasRenderingContext2D,
    edge: Edge,
    nodes: HierarchicalNode[],
    camera: Camera,
    totalInheritedCount: number
  ): void {
    const fromNode = this.findNodeById(edge.from, nodes);
    const toNode = this.findNodeById(edge.to, nodes);

    if (!fromNode || !toNode) {
      return;
    }

    // Get world positions and centers (exact same logic as regular edges)
    const fromWorldPos = this.getAbsolutePosition(fromNode, nodes);
    const toWorldPos = this.getAbsolutePosition(toNode, nodes);

    const fromCenter = {
      x: fromWorldPos.x + fromNode.width / 2,
      y: fromWorldPos.y + fromNode.height / 2
    };
    const toCenter = {
      x: toWorldPos.x + toNode.width / 2,
      y: toWorldPos.y + toNode.height / 2
    };

    // Calculate exact border intersection points (exact same logic)
    const cornerRadius = 8;
    const fromBorderPoint = DrawingPrimitives.roundedRectRayHit(
      fromCenter, fromNode.width, fromNode.height, cornerRadius, toCenter
    );
    const toBorderPoint = DrawingPrimitives.roundedRectRayHit(
      toCenter, toNode.width, toNode.height, cornerRadius, fromCenter
    );

    // Convert to screen coordinates (exact same transform)
    const fromScreenPoint = {
      x: (fromBorderPoint.x - camera.x) * camera.zoom,
      y: (fromBorderPoint.y - camera.y) * camera.zoom
    };
    const toScreenPoint = {
      x: (toBorderPoint.x - camera.x) * camera.zoom,
      y: (toBorderPoint.y - camera.y) * camera.zoom
    };

    // Draw inherited edge with dashed style (special styling for inherited)
    DrawingPrimitives.drawConnectionLine(ctx, fromScreenPoint, toScreenPoint, {
      stroke: '#ff6b6b', // Special color for inherited edges
      strokeWidth: 2 * camera.zoom,
      strokeDashArray: [5 * camera.zoom, 5 * camera.zoom] // Dashed line for inherited
    });

    // Draw inherited edge label
    const midScreenX = (fromScreenPoint.x + toScreenPoint.x) / 2;
    const midScreenY = (fromScreenPoint.y + toScreenPoint.y) / 2;
    DrawingPrimitives.drawText(
      ctx,
      `${edge.label || edge.id} (inherited)`,
      midScreenX,
      midScreenY,
      10 * camera.zoom,
      '#ff6b6b'
    );
  }

  /**
   * Find node by GUID in hierarchical structure
   * Updated to use GUID-only lookup for composable architecture
   */
  private static findNodeById(id: string, nodes: HierarchicalNode[]): HierarchicalNode | null {
    const search = (nodeList: HierarchicalNode[]): HierarchicalNode | null => {
      for (const node of nodeList) {
        // For composable architecture, edges use GUIDs
        if (node.GUID === id) return node;
        const found = search(node.children);
        if (found) return found;
      }
      return null;
    };

    return search(nodes);
  }

  /**
   * Get absolute world position of a hierarchical node
   * Updated to use GUID-based node identification
   */
  private static getAbsolutePosition(targetNode: HierarchicalNode, nodes: HierarchicalNode[]): Point {
    const getPath = (nodeList: HierarchicalNode[], target: HierarchicalNode, currentPath: HierarchicalNode[] = []): HierarchicalNode[] | null => {
      for (const node of nodeList) {
        const path = [...currentPath, node];
        // Use GUID for node identification (the ONLY reliable identifier)
        if (node.GUID === target.GUID) return path;
        const found = getPath(node.children, target, path);
        if (found) return found;
      }
      return null;
    };

    const path = getPath(nodes, targetNode);
    if (path) {
      return this.getAbsolutePositionFromPath(path);
    }

    return { x: 0, y: 0 };
  }

  /**
   * Calculate absolute position by summing path coordinates
   * EXACT replica of HierarchicalRenderingStrategy.getAbsolutePositionFromPath()
   */
  private static getAbsolutePositionFromPath(path: HierarchicalNode[]): Point {
    let x = 0;
    let y = 0;

    for (const node of path) {
      x += node.x;
      y += node.y;
    }

    return { x, y };
  }
}