import { Point, NodeShape } from './types';

/**
 * Reusable drawing primitives for canvas rendering
 * Extracted from ShapeRenderer to eliminate code duplication
 */
export class DrawingPrimitives {
  
  /**
   * Draw a rounded rectangle (extracted from ShapeRenderer line 147-155)
   */
  static drawRoundedRect(
    ctx: CanvasRenderingContext2D, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  static drawShape(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    shape: NodeShape,
    cornerRadius: number
  ): void {
    switch (shape) {
      case 'circle': {
        const radiusX = width / 2;
        const radiusY = height / 2;
        ctx.beginPath();
        ctx.ellipse(x + radiusX, y + radiusY, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.closePath();
        break;
      }
      case 'triangle': {
        ctx.beginPath();
        ctx.moveTo(x + width / 2, y);
        ctx.lineTo(x + width, y + height);
        ctx.lineTo(x, y + height);
        ctx.closePath();
        break;
      }
      case 'rectangle': {
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.closePath();
        break;
      }
      case 'rounded':
      default: {
        const radius = Math.max(0, Math.min(cornerRadius, Math.min(width, height) / 2));
        DrawingPrimitives.drawRoundedRect(ctx, x, y, width, height, radius);
        break;
      }
    }
  }

  /**
   * Draw text with proper alignment and scaling
   */
  static drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    color: string,
    alignment: 'left' | 'center' | 'right' = 'left',
    baseline: CanvasTextBaseline = 'alphabetic'
  ): void {
    ctx.fillStyle = color;
    ctx.font = `${fontSize}px Roboto, sans-serif`;
    ctx.textAlign = alignment;
    ctx.textBaseline = baseline;
    ctx.fillText(text, x, y);
    
    // Reset text alignment to default
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Draw connection line between two points
   * Supports orthogonal routing via optional waypoints array
   */
  static drawConnectionLine(
    ctx: CanvasRenderingContext2D,
    fromPoint: Point,
    toPoint: Point,
    style: {
      stroke: string;
      strokeWidth: number;
      strokeDashArray?: number[] | null;
    },
    waypoints?: Point[]
  ): void {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = style.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round'; // For smooth corners on orthogonal paths

    if (style.strokeDashArray) {
      ctx.setLineDash(style.strokeDashArray);
    }

    ctx.beginPath();

    if (waypoints && waypoints.length > 0) {
      // Draw multi-segment path using waypoints
      ctx.moveTo(waypoints[0].x, waypoints[0].y);
      for (let i = 1; i < waypoints.length; i++) {
        ctx.lineTo(waypoints[i].x, waypoints[i].y);
      }
    } else {
      // Draw straight line (current behavior)
      ctx.moveTo(fromPoint.x, fromPoint.y);
      ctx.lineTo(toPoint.x, toPoint.y);
    }

    ctx.stroke();

    if (style.strokeDashArray) {
      ctx.setLineDash([]);
    }
  }

  /**
   * Calculate precise intersection point of ray with rounded rectangle border
   * (extracted from ShapeRenderer line 188-248)
   */
  static roundedRectRayHit(
    center: Point, 
    width: number, 
    height: number, 
    radius: number, 
    target: Point
  ): Point {
    const hx = width / 2;
    const hy = height / 2;
    
    // Clamp radius to valid range
    radius = Math.min(radius, hx, hy);
    
    // Core (straight-edge) half sizes
    const ax = Math.max(0, hx - radius);
    const ay = Math.max(0, hy - radius);
    
    // Ray direction from center to target (normalized)
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    
    // Try vertical sides first
    if (ux !== 0) {
      const tx = (ax + radius) / Math.abs(ux);
      const yx = tx * uy;
      if (Math.abs(yx) <= ay) {
        // Hit straight vertical side
        return {
          x: center.x + Math.sign(ux) * (ax + radius),
          y: center.y + yx
        };
      }
    }
    
    // Try horizontal sides
    if (uy !== 0) {
      const ty = (ay + radius) / Math.abs(uy);
      const xy = ty * ux;
      if (Math.abs(xy) <= ax) {
        // Hit straight horizontal side
        return {
          x: center.x + xy,
          y: center.y + Math.sign(uy) * (ay + radius)
        };
      }
    }
    
    // Corner arc intersection (ray missed side windows)
    const cx = Math.sign(ux) * ax;
    const cy = Math.sign(uy) * ay;
    
    // Solve ray-circle intersection: ||t*u - c|| = r
    const d = ux * cx + uy * cy;
    const c2 = cx * cx + cy * cy;
    const m2 = c2 - radius * radius;
    const discriminant = Math.max(0, d * d - m2);
    const t = d + Math.sqrt(discriminant);  // Use the farther intersection (border exit point)
    
    return {
      x: center.x + t * ux,
      y: center.y + t * uy
    };
  }

  /**
   * Apply line styling (dash patterns, colors, etc.)
   */
  static applyLineStyles(
    ctx: CanvasRenderingContext2D,
    strokeStyle: string,
    lineWidth: number,
    dashArray?: number[]
  ): void {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    
    if (dashArray) {
      ctx.setLineDash(dashArray);
    } else {
      ctx.setLineDash([]);
    }
  }

  static drawIcon(
    ctx: CanvasRenderingContext2D,
    icon: string,
    x: number,
    y: number,
    size: number,
    color: string = '#e2e8f0',
    alignment: 'left' | 'center' | 'right' = 'center'
  ): void {
    if (!icon) {
      return;
    }
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Material Symbols Outlined", sans-serif`;
    ctx.textAlign = alignment;
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, y);
    ctx.restore();
  }

  static drawBadge(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    options: {
      background?: string;
      color?: string;
      paddingX?: number;
      paddingY?: number;
      radius?: number;
      fontSize?: number;
      alignment?: 'left' | 'center' | 'right';
    } = {}
  ): void {
    if (!text) {
      return;
    }

    const {
      background = 'rgba(15, 23, 42, 0.85)',
      color = '#f8fafc',
      paddingX = 8,
      paddingY = 4,
      radius = 12,
      fontSize = 11,
      alignment = 'left'
    } = options;

    ctx.save();
    ctx.font = `${fontSize}px Roboto, sans-serif`;
    const textMetrics = ctx.measureText(text);
    const badgeWidth = textMetrics.width + paddingX * 2;
    const badgeHeight = fontSize + paddingY * 2;

    let originX = x;
    if (alignment === 'center') {
      originX = x - badgeWidth / 2;
    } else if (alignment === 'right') {
      originX = x - badgeWidth;
    }
    const originY = y - badgeHeight / 2;

    ctx.fillStyle = background;
    DrawingPrimitives.drawRoundedRect(ctx, originX, originY, badgeWidth, badgeHeight, radius);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, originX + paddingX, y);

    ctx.restore();
  }
}
