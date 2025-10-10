import { BaseRenderer } from '../../canvas/renderer';
import { HierarchicalNode, Edge, Camera, Point, Bounds, NodeEvent } from '../../canvas/types';
import { HierarchicalNodePrimitive } from '../primitives/hierarchical-node-primitive';
import { HierarchicalEdgePrimitive } from '../primitives/hierarchical-edge-primitive';

/**
 * Composable Hierarchical Graph Renderer
 * EXACT replica of HierarchicalRenderingStrategy but using composable primitives
 *
 * This renderer:
 * 1. Uses 3-pass rendering: nodes → edges → inherited edges
 * 2. Handles recursive parent/child coordinate transformation
 * 3. Supports hierarchical hit testing with parent/child paths
 * 4. Uses exact same visual specifications and z-ordering
 */
export class ComposableHierarchicalRenderer extends BaseRenderer {

  getName(): string {
    return 'composable-hierarchical';
  }

  /**
   * Get default node style - EXACT same as ShapeRenderer
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
   * Main render method - orchestrates 3-pass rendering EXACT same as HierarchicalRenderingStrategy
   */
  render(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], edges: Edge[], camera: Camera): void {
    // Render in proper z-order for hierarchical layout (EXACT same approach):
    // 1. Draw nodes level by level
    // 2. Draw edges on top (so they're visible even if they cross parent nodes)
    // 3. Draw inherited edges from folded nodes

    // First pass: Draw all nodes using composable primitive
    nodes.forEach(node => this.renderNodeHierarchy(ctx, node, 0, 0, camera));

    // Second pass: Draw edges on top using composable primitive
    edges.forEach(edge => this.renderEdge(ctx, edge, nodes, camera));

    // Third pass: Draw inherited edges from folded nodes using composable primitive
    this.renderInheritedEdges(ctx, nodes, camera);
  }

  /**
   * Render node hierarchy recursively using HierarchicalNodePrimitive
   */
  private renderNodeHierarchy(ctx: CanvasRenderingContext2D, node: HierarchicalNode, parentX: number, parentY: number, camera: Camera): void {
    // Use composable primitive for node rendering - handles all the complexity
    HierarchicalNodePrimitive.draw(ctx, node, parentX, parentY, camera);
  }

  /**
   * Render edge using HierarchicalEdgePrimitive
   */
  private renderEdge(ctx: CanvasRenderingContext2D, edge: Edge, nodes: HierarchicalNode[], camera: Camera): void {
    // Use composable primitive for edge rendering - handles all the complexity
    HierarchicalEdgePrimitive.draw(ctx, edge, nodes, camera);
  }

  /**
   * Render inherited edges from folded nodes
   * EXACT replica of HierarchicalRenderingStrategy.renderInheritedEdges()
   */
  private renderInheritedEdges(ctx: CanvasRenderingContext2D, nodes: HierarchicalNode[], camera: Camera): void {
    // Render inherited edges from all folded nodes (EXACT same logic)
    const renderInheritedFromNode = (node: HierarchicalNode) => {
      if (node.inheritedEdges && node.inheritedEdges.length > 0) {
        node.inheritedEdges.forEach(edge => {
          // Use composable primitive for inherited edge rendering
          HierarchicalEdgePrimitive.drawInheritedEdge(ctx, edge, nodes, camera, node.inheritedEdges!.length);
        });
      }

      // Recursively check children (EXACT same recursion)
      node.children.forEach(child => renderInheritedFromNode(child));
    };

    nodes.forEach(node => renderInheritedFromNode(node));
  }

  /**
   * Hit testing for hierarchical nodes - returns full parent/child path
   */
  override hitTest(worldX: number, worldY: number, nodes: HierarchicalNode[]): NodeEvent | null {
    // Test nodes recursively, returning deepest hit (child takes precedence over parent)
    const hitTestRecursive = (nodeList: HierarchicalNode[], parentX: number, parentY: number, path: HierarchicalNode[] = []): NodeEvent | null => {
      // Test children first (deeper nodes take precedence)
      for (let i = nodeList.length - 1; i >= 0; i--) {
        const node = nodeList[i];
        if (node.visible === false) continue;

        const currentPath = [...path, node];

        // Test children first
        if (!node.collapsed && node.children && node.children.length > 0) {
          const worldNodeX = parentX + node.x;
          const worldNodeY = parentY + node.y;
          const childHit = hitTestRecursive(node.children, worldNodeX, worldNodeY, currentPath);
          if (childHit) return childHit;
        }

        // Then test this node using primitive hit test
        if (HierarchicalNodePrimitive.hitTest(node, parentX, parentY, worldX, worldY, 'full-size')) {
          return {
            node,
            worldPosition: { x: parentX + node.x, y: parentY + node.y },
            screenPosition: { x: 0, y: 0 }, // Will be filled by caller
            path: currentPath
          };
        }
      }
      return null;
    };

    return hitTestRecursive(nodes, 0, 0);
  }

  /**
   * Get node bounds for a hierarchical node
   */
  override getNodeBounds(node: HierarchicalNode): Bounds {
    // For hierarchical nodes, we need to know the parent context
    // This is a simplified version - in practice we'd need parent position
    return {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height
    };
  }

  /**
   * Render selection for hierarchical node
   */
  override renderSelection(ctx: CanvasRenderingContext2D, node: HierarchicalNode, camera: Camera): void {
    // Selection outline handled by ComposableHierarchicalCanvasEngine for accuracy.
  }
}
