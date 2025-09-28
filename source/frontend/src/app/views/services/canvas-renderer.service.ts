import { Injectable } from '@angular/core';
import { GraphNode, GraphEdge, Transform, Point, NodeStyle, EdgeStyle } from '../models/view.models';

@Injectable({
  providedIn: 'root'
})
export class CanvasRenderer {
  private ctx!: CanvasRenderingContext2D;
  private canvas!: HTMLCanvasElement;
  private initialized = false;
  
  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.initialized = true;
    
    // Set default styles
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = '12px Roboto, sans-serif';
  }
  
  isInitialized(): boolean {
    return this.initialized;
  }

  clear(): void {
    if (!this.initialized) return;
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Set background
    this.ctx.fillStyle = '#fafafa';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  applyTransform(transform: Transform): void {
    if (!this.initialized) return;
    
    this.ctx.save();
    this.ctx.setTransform(
      transform.scale, 0, 0, 
      transform.scale, 
      transform.x, 
      transform.y
    );
  }
  
  resetTransform(): void {
    if (!this.initialized) return;
    
    this.ctx.restore();
  }

  drawNode(node: GraphNode, style: NodeStyle = {}): void {
    if (!this.initialized) return;
    
    const { x, y, radius = 20, label, selected } = node;
    const {
      fillColor = this.getDefaultNodeColor(node),
      strokeColor = selected ? '#3f51b5' : '#ffffff',
      strokeWidth = selected ? 3 : 2,
      textColor = '#ffffff',
      font = '12px Roboto, sans-serif'
    } = style;
    
    this.ctx.save();
    
    // Draw node circle
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    
    // Fill
    this.ctx.fillStyle = fillColor;
    this.ctx.fill();
    
    // Stroke
    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = strokeWidth;
      this.ctx.stroke();
    }
    
    // Draw label
    if (label) {
      this.ctx.fillStyle = textColor;
      this.ctx.font = font;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      
      // Truncate long labels
      const maxLength = Math.floor(radius / 3);
      const displayLabel = label.length > maxLength ? 
        label.substring(0, maxLength) + '...' : label;
      
      this.ctx.fillText(displayLabel, x, y);
    }
    
    // Draw selection indicator
    if (selected) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
      this.ctx.strokeStyle = '#3f51b5';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 3]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
    
    this.ctx.restore();
  }

  drawEdge(edge: GraphEdge, style: EdgeStyle = {}): void {
    if (!this.initialized || !edge.source || !edge.target) return;
    
    const {
      strokeColor = '#999999',
      strokeWidth = 1,
      curved = false,
      directed = true,
      dashed = false
    } = style;
    
    const { source, target } = edge;
    
    this.ctx.save();
    
    // Set line style
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = strokeWidth;
    
    if (dashed) {
      this.ctx.setLineDash([5, 3]);
    }
    
    // Calculate edge endpoints (accounting for node radius)
    const sourceRadius = source.radius || 20;
    const targetRadius = target.radius || 20;
    
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) {
      this.ctx.restore();
      return;
    }
    
    const unitX = dx / distance;
    const unitY = dy / distance;
    
    const startX = source.x + unitX * sourceRadius;
    const startY = source.y + unitY * sourceRadius;
    const endX = target.x - unitX * targetRadius;
    const endY = target.y - unitY * targetRadius;
    
    // Draw edge
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    
    if (curved) {
      // Calculate control point for quadratic curve
      const controlX = (startX + endX) / 2 + (startY - endY) * 0.2;
      const controlY = (startY + endY) / 2 + (endX - startX) * 0.2;
      this.ctx.quadraticCurveTo(controlX, controlY, endX, endY);
    } else {
      this.ctx.lineTo(endX, endY);
    }
    
    this.ctx.stroke();
    
    // Draw arrow
    if (directed) {
      this.drawArrowhead(startX, startY, endX, endY, strokeColor, strokeWidth);
    }
    
    // Draw edge label if exists
    if (edge.type) {
      const labelX = (startX + endX) / 2;
      const labelY = (startY + endY) / 2;
      
      this.drawEdgeLabel(edge.type, labelX, labelY, strokeColor);
    }
    
    this.ctx.restore();
  }
  
  private drawArrowhead(startX: number, startY: number, endX: number, endY: number, color: string, lineWidth: number): void {
    const angle = Math.atan2(endY - startY, endX - startX);
    const arrowLength = 8 + lineWidth;
    const arrowAngle = Math.PI / 6;
    
    this.ctx.save();
    this.ctx.fillStyle = color;
    
    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(
      endX - arrowLength * Math.cos(angle - arrowAngle),
      endY - arrowLength * Math.sin(angle - arrowAngle)
    );
    this.ctx.lineTo(
      endX - arrowLength * Math.cos(angle + arrowAngle),
      endY - arrowLength * Math.sin(angle + arrowAngle)
    );
    this.ctx.closePath();
    this.ctx.fill();
    
    this.ctx.restore();
  }
  
  private drawEdgeLabel(label: string, x: number, y: number, color: string): void {
    this.ctx.save();
    
    // Background for better readability
    this.ctx.font = '10px Roboto, sans-serif';
    const metrics = this.ctx.measureText(label);
    const padding = 4;
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    this.ctx.fillRect(
      x - metrics.width / 2 - padding,
      y - 6 - padding,
      metrics.width + padding * 2,
      12 + padding * 2
    );
    
    // Border
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(
      x - metrics.width / 2 - padding,
      y - 6 - padding,
      metrics.width + padding * 2,
      12 + padding * 2
    );
    
    // Text
    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(label, x, y);
    
    this.ctx.restore();
  }
  
  private getDefaultNodeColor(node: GraphNode): string {
    // Color based on node type
    const colors: Record<string, string> = {
      'Person': '#4caf50',
      'Company': '#2196f3',
      'Transaction': '#ff9800',
      'Document': '#9c27b0',
      'Project': '#795548',
      'Department': '#607d8b'
    };
    
    return colors[node.type || ''] || '#757575';
  }
  
  // Utility methods for plugins
  drawCircle(x: number, y: number, radius: number, fillColor?: string, strokeColor?: string, strokeWidth?: number): void {
    if (!this.initialized) return;
    
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    
    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fill();
    }
    
    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = strokeWidth || 1;
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }
  
  drawRectangle(x: number, y: number, width: number, height: number, fillColor?: string, strokeColor?: string, strokeWidth?: number): void {
    if (!this.initialized) return;
    
    this.ctx.save();
    
    if (fillColor) {
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(x, y, width, height);
    }
    
    if (strokeColor) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = strokeWidth || 1;
      this.ctx.strokeRect(x, y, width, height);
    }
    
    this.ctx.restore();
  }
  
  drawText(text: string, x: number, y: number, font?: string, color?: string, align?: CanvasTextAlign): void {
    if (!this.initialized) return;
    
    this.ctx.save();
    
    if (font) this.ctx.font = font;
    if (color) this.ctx.fillStyle = color;
    if (align) this.ctx.textAlign = align;
    
    this.ctx.fillText(text, x, y);
    
    this.ctx.restore();
  }
  
  drawLine(startX: number, startY: number, endX: number, endY: number, color?: string, width?: number): void {
    if (!this.initialized) return;
    
    this.ctx.save();
    
    if (color) this.ctx.strokeStyle = color;
    if (width) this.ctx.lineWidth = width;
    
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();
    
    this.ctx.restore();
  }
  
  // Get canvas context for advanced operations
  getContext(): CanvasRenderingContext2D | null {
    return this.initialized ? this.ctx : null;
  }
}