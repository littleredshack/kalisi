import { HierarchicalNode, Edge, Camera, Point, Bounds, NodeEvent } from './types';
import { PresentationFrame } from '../render/presentation-frame';
// Preset system removed

// Base interface for all renderers
export interface IRenderer {
  // Core rendering
  render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], edges: Edge[], camera: Camera, frame?: PresentationFrame): void;
  
  // Hit testing
  hitTest(worldX: number, worldY: number, nodes: HierarchicalNode[]): NodeEvent | null;
  
  // Node bounds calculation
  getNodeBounds(node: HierarchicalNode): Bounds;
  
  // Selection rendering
  renderSelection(ctx: CanvasRenderingContext2D, node: HierarchicalNode, camera: Camera): void;

  // Allow renderers to drop cached state when geometry mutates outside layout frames
  invalidateCache?(affectedNodeIds?: ReadonlyArray<string>): void;
  
  // Renderer-specific configuration
  getName(): string;
  getDefaultNodeStyle(type: string): any;
}

// Abstract base renderer with common functionality
export abstract class BaseRenderer implements IRenderer {
  
  abstract render(
    ctx: CanvasRenderingContext2D,
    nodes: HierarchicalNode[],
    edges: Edge[],
    camera: Camera,
    frame?: PresentationFrame
  ): void;
  abstract getName(): string;
  abstract getDefaultNodeStyle(type: string): any;

  // Common hit testing logic
  hitTest(worldX: number, worldY: number, nodes: HierarchicalNode[]): NodeEvent | null {
    const testNode = (nodeList: HierarchicalNode[], currentPath: HierarchicalNode[] = []): NodeEvent | null => {
      // Test children first (they render on top)
      for (const node of nodeList) {
        // SKIP INVISIBLE NODES: Don't hit-test hidden children
        if (node.visible === false) continue;
        
        const path = [...currentPath, node];
        
        // Test children first (only if not collapsed)
        if (!node.collapsed) {
          const childResult = testNode(node.children, path);
          if (childResult) return childResult;
        }
        
        // Then test this node
        const bounds = this.getNodeBounds(node);
        const worldPos = this.getAbsolutePositionFromPath(path);
        
        if (worldX >= worldPos.x && worldX <= worldPos.x + bounds.width &&
            worldY >= worldPos.y && worldY <= worldPos.y + bounds.height) {
          return {
            node,
            worldPosition: { x: worldPos.x, y: worldPos.y },
            screenPosition: { x: 0, y: 0 }, // Will be filled by caller
            path
          };
        }
      }
      return null;
    };
    
    return testNode(nodes);
  }

  // Common bounds calculation
  getNodeBounds(node: HierarchicalNode): Bounds {
    return {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    };
  }

  // Common coordinate utilities
  protected getAbsolutePositionFromPath(path: HierarchicalNode[]): Point {
    let x = 0, y = 0;
    path.forEach(node => {
      x += node.x;
      y += node.y;
    });
    return { x, y };
  }

  protected worldToScreen(worldPoint: Point, camera: Camera): Point {
    return {
      x: (worldPoint.x - camera.x) * camera.zoom,
      y: (worldPoint.y - camera.y) * camera.zoom
    };
  }

  // Default selection rendering - must be overridden by specific renderers
  renderSelection(ctx: CanvasRenderingContext2D, node: HierarchicalNode, camera: Camera): void {
    // This should be implemented by each renderer since they know the correct positioning
    // Base implementation for fallback
    const screenWidth = node.width * camera.zoom;
    const screenHeight = node.height * camera.zoom;
    
    ctx.strokeStyle = '#6ea8fe';
    ctx.lineWidth = 2;
    ctx.setLineDash([5 * camera.zoom, 5 * camera.zoom]);
    ctx.strokeRect(50, 50, screenWidth + 4, screenHeight + 4); // Fallback position
    ctx.setLineDash([]);
  }

  invalidateCache(_affectedNodeIds?: ReadonlyArray<string>): void {
    // Default no-op; specific renderers can override
  }
}
