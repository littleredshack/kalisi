import { Edge, HierarchicalNode, Camera, Point } from '../../canvas/types';
import { DrawingPrimitives } from '../../canvas/drawing-primitives';

/**
 * Flat edge drawing primitive - EXACT replica of current flat graph edge rendering
 * Extracted from FlatGraphRenderingStrategy.renderConnectionLine() for composability
 */
export class FlatEdgePrimitive {

  /**
   * Draw a flat graph edge with EXACT specifications from current renderer:
   * - CONTAINS = blue (#3b82f6), width 2
   * - LINK = green (#10b981), width 2
   * - Other = gray (#6b7280), width 2
   * - Orthogonal routing via waypoints
   * - Labels with white background (rgba(255,255,255,0.9)) and border
   */
  static draw(
    ctx: CanvasRenderingContext2D,
    edge: Edge,
    fromNode: HierarchicalNode | null,
    toNode: HierarchicalNode | null,
    camera: Camera
  ): void {
    if (!fromNode || !toNode) return;

    const edgeType = (edge as any).type;
    const strokeColor = edge.style?.stroke ?? '#6b7280';
    const strokeWidth = (edge.style?.strokeWidth ?? 2) * camera.zoom;
    const dashPattern = edge.style?.strokeDashArray
      ? edge.style.strokeDashArray.map(value => value * camera.zoom)
      : null;
    const lineStyle = {
      stroke: strokeColor,
      strokeWidth,
      strokeDashArray: dashPattern
    };

    // Variables for label positioning
    let midScreenX, midScreenY;

    // Check if we have waypoints from orthogonal routing (EXACT same logic)
    if (edge.waypoints && edge.waypoints.length > 0) {
      // Use waypoints directly - they already contain the proper path
      const screenWaypoints = edge.waypoints.map(wp => ({
        x: (wp.x - camera.x) * camera.zoom,
        y: (wp.y - camera.y) * camera.zoom
      }));

      // Draw using waypoints
      DrawingPrimitives.drawConnectionLine(
        ctx,
        screenWaypoints[0],
        screenWaypoints[screenWaypoints.length - 1],
        lineStyle,
        screenWaypoints
      );

      // Smart label positioning: find the longest straight segment (EXACT same algorithm)
      let longestSegmentStart = 0;
      let longestSegmentLength = 0;

      for (let i = 0; i < screenWaypoints.length - 1; i++) {
        const dx = screenWaypoints[i + 1].x - screenWaypoints[i].x;
        const dy = screenWaypoints[i + 1].y - screenWaypoints[i].y;
        const segmentLength = Math.sqrt(dx * dx + dy * dy);

        if (segmentLength > longestSegmentLength) {
          longestSegmentLength = segmentLength;
          longestSegmentStart = i;
        }
      }

      // Place label at the middle of the longest segment
      const segStart = screenWaypoints[longestSegmentStart];
      const segEnd = screenWaypoints[longestSegmentStart + 1];
      midScreenX = (segStart.x + segEnd.x) / 2;
      midScreenY = (segStart.y + segEnd.y) / 2;
    } else {
      // Fallback to straight line with border intersection calculation
      const fromCenter = {
        x: fromNode.x + fromNode.width / 2,
        y: fromNode.y + fromNode.height / 2
      };
      const toCenter = {
        x: toNode.x + toNode.width / 2,
        y: toNode.y + toNode.height / 2
      };

      // Calculate border intersection points using drawing primitive
      const cornerRadius = 12; // Same as node radius
      const fromBorderPoint = DrawingPrimitives.roundedRectRayHit(
        fromCenter, fromNode.width, fromNode.height, cornerRadius, toCenter
      );
      const toBorderPoint = DrawingPrimitives.roundedRectRayHit(
        toCenter, toNode.width, toNode.height, cornerRadius, fromCenter
      );

      // Convert to screen coordinates
      const fromScreenPoint = {
        x: (fromBorderPoint.x - camera.x) * camera.zoom,
        y: (fromBorderPoint.y - camera.y) * camera.zoom
      };
      const toScreenPoint = {
        x: (toBorderPoint.x - camera.x) * camera.zoom,
        y: (toBorderPoint.y - camera.y) * camera.zoom
      };

      // Draw straight line
      DrawingPrimitives.drawConnectionLine(ctx, fromScreenPoint, toScreenPoint, lineStyle);

      // Calculate label position at midpoint
      midScreenX = (fromScreenPoint.x + toScreenPoint.x) / 2;
      midScreenY = (fromScreenPoint.y + toScreenPoint.y) / 2;
    }

    // Draw edge label with EXACT styling from current renderer
    const labelVisible = edge.metadata?.['labelVisible'] !== false;
    const labelText = labelVisible ? edge.label || edgeType || '' : '';
    if (labelText) {
      this.drawLabel(ctx, labelText, midScreenX, midScreenY, lineStyle.stroke, camera);
    }
  }

  /**
   * Draw edge label with white background and border - EXACT replica
   */
  private static drawLabel(
    ctx: CanvasRenderingContext2D,
    labelText: string,
    x: number,
    y: number,
    color: string,
    camera: Camera
  ): void {
    const fontSize = 11 * camera.zoom; // EXACT font size

    // Measure text to create background
    ctx.font = `${fontSize}px Roboto, sans-serif`;
    const textMetrics = ctx.measureText(labelText);
    const padding = 4 * camera.zoom; // EXACT padding

    // Draw semi-transparent white background - EXACT color
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(
      x - textMetrics.width / 2 - padding,
      y - fontSize / 2 - padding,
      textMetrics.width + padding * 2,
      fontSize + padding * 2
    );

    // Draw a subtle border around the label - EXACT color
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x - textMetrics.width / 2 - padding,
      y - fontSize / 2 - padding,
      textMetrics.width + padding * 2,
      fontSize + padding * 2
    );

    // Draw the text on top
    DrawingPrimitives.drawText(
      ctx,
      labelText,
      x,
      y + fontSize / 3, // Adjust for vertical centering
      fontSize,
      color,
      'center'
    );
  }

  /**
   * Find a node by ID in the flat node list
   */
  static findNodeById(id: string, nodes: HierarchicalNode[]): HierarchicalNode | null {
    return nodes.find(node => node.id === id) || null;
  }
}
