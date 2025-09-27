import { HierarchicalNode } from './types';

/**
 * Reusable layout calculation primitives
 * Extracted from GridLayoutEngine to eliminate code duplication
 */
export class LayoutPrimitives {

  /**
   * Calculate grid positions for children within a container
   */
  static calculateGridPositions(
    children: HierarchicalNode[],
    containerWidth: number,
    containerHeight: number,
    sidePadding: number = 20,
    topPadding: number = 50,
    childSpacing: number = 10
  ): void {
    if (children.length === 0) return;

    const cols = Math.ceil(Math.sqrt(children.length)); // Square-ish grid
    
    let x = sidePadding;
    let y = topPadding;
    let rowHeight = 0;

    children.forEach((child, index) => {
      // Position child
      child.x = x;
      child.y = y;
      
      // Track row height
      rowHeight = Math.max(rowHeight, child.height);
      
      // Move to next column
      x += child.width + childSpacing;
      
      // Move to next row if needed
      if ((index + 1) % cols === 0) {
        x = sidePadding;
        y += rowHeight + childSpacing;
        rowHeight = 0;
      }
    });
  }

  /**
   * Calculate force-directed positions for nodes
   */
  static calculateForceDirectedPositions(
    nodes: HierarchicalNode[],
    centerX: number = 400,
    centerY: number = 300,
    radius: number = 200
  ): void {
    // Simple circular layout for now (can be enhanced to proper force-directed)
    nodes.forEach((node, index) => {
      const angle = (index / nodes.length) * 2 * Math.PI;
      node.x = centerX + Math.cos(angle) * radius;
      node.y = centerY + Math.sin(angle) * radius;
    });
  }

  /**
   * Detect and resolve collisions between nodes
   */
  static detectCollisions(nodes: HierarchicalNode[]): boolean {
    // Simple collision detection - can be enhanced
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        
        if (this.nodesOverlap(nodeA, nodeB)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Resize parent to fit all children with padding
   */
  static resizeToFitChildren(
    parent: HierarchicalNode,
    sidePadding: number = 20,
    bottomPadding: number = 20
  ): void {
    if (parent.children.length === 0) return;

    let maxX = 0;
    let maxY = 0;

    parent.children.forEach(child => {
      maxX = Math.max(maxX, child.x + child.width);
      maxY = Math.max(maxY, child.y + child.height);
    });

    // Resize parent to contain all children + padding
    parent.width = Math.max(parent.width, maxX + sidePadding);
    parent.height = Math.max(parent.height, maxY + bottomPadding);
  }

  /**
   * Get minimum node size based on type
   */
  static getMinimumNodeSize(type: string): { width: number; height: number } {
    const sizes = {
      'container': { width: 200, height: 120 },
      'node': { width: 160, height: 80 },
      'component': { width: 120, height: 60 }
    };
    return sizes[type as keyof typeof sizes] || sizes.node;
  }

  /**
   * Position root nodes horizontally with spacing
   */
  static positionRootNodes(rootNodes: HierarchicalNode[], spacing: number = 50): void {
    let x = spacing;

    rootNodes.forEach(node => {
      node.x = x;
      node.y = spacing;
      x += node.width + spacing;
    });
  }

  /**
   * Check if two nodes overlap
   */
  private static nodesOverlap(nodeA: HierarchicalNode, nodeB: HierarchicalNode): boolean {
    return !(
      nodeA.x + nodeA.width < nodeB.x ||
      nodeB.x + nodeB.width < nodeA.x ||
      nodeA.y + nodeA.height < nodeB.y ||
      nodeB.y + nodeB.height < nodeA.y
    );
  }
}