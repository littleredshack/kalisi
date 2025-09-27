import { Injectable } from '@angular/core';
import { ILayoutService, LayoutNode, Position } from './layout.interfaces';

/**
 * Grid layout service - extracted from GridLayoutEngine/HierarchicalLayoutStrategy
 * Positions children in grid within parent containers
 */
@Injectable({
  providedIn: 'root'
})
export class GridLayoutService implements ILayoutService {
  private viewportBounds?: { width: number; height: number };

  getName(): string {
    return 'grid';
  }

  /**
   * Set viewport bounds to constrain initial layout
   */
  setViewportBounds(bounds: { width: number; height: number }): void {
    this.viewportBounds = bounds;
  }

  calculatePositions(nodes: LayoutNode[]): Map<string, Position> {
    const positions = new Map<string, Position>();

    // Calculate positions for hierarchical structure
    this.calculateHierarchicalLayout(nodes, positions);

    // Position root nodes horizontally
    this.positionRootNodes(nodes, positions);

    return positions;
  }

  private calculateHierarchicalLayout(nodes: LayoutNode[], positions: Map<string, Position>): void {
    // Process bottom-up to size parents based on children
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        // Recursively process children first
        this.calculateHierarchicalLayout(node.children, positions);

        // Layout children in grid within parent
        this.layoutChildrenInParent(node, positions);
      } else {
        // Leaf nodes get their initial position (will be adjusted by parent)
        positions.set(node.id, { x: 0, y: 0 });
      }
    });
  }

  private layoutChildrenInParent(parent: LayoutNode, positions: Map<string, Position>): void {
    if (!parent.children || parent.children.length === 0) return;

    const padding = 20;
    const topPadding = 40; // Extra space for title
    const sidePadding = padding;
    const bottomPadding = padding;
    const nodeSpacing = 20;

    // Calculate dynamic nodes per row based on available width and node sizes
    const availableWidth = this.getAvailableParentWidth(parent);
    const avgChildWidth = parent.children.reduce((sum, child) => sum + child.width, 0) / parent.children.length;
    const nodesPerRow = Math.max(1, Math.floor((availableWidth - sidePadding * 2) / (avgChildWidth + nodeSpacing)));

    let x = sidePadding;
    let y = topPadding;
    let maxRowHeight = 0;
    let maxX = 0;
    let maxY = topPadding;

    parent.children.forEach((child, index) => {
      // Start new row if needed
      if (index > 0 && index % nodesPerRow === 0) {
        x = sidePadding;
        y += maxRowHeight + nodeSpacing;
        maxRowHeight = 0;
      }

      // Set child position relative to parent
      positions.set(child.id, { x, y });

      // Track max dimensions for resizing parent
      maxRowHeight = Math.max(maxRowHeight, child.height);
      maxX = Math.max(maxX, x + child.width);
      maxY = Math.max(maxY, y + child.height);

      // Move to next column
      x += child.width + nodeSpacing;
    });

    // Update parent dimensions to contain all children, but respect viewport bounds
    let newWidth = Math.max(parent.width, maxX + sidePadding);
    let newHeight = Math.max(parent.height, maxY + bottomPadding);

    // Constrain width to viewport, but be more generous with height for large datasets
    if (this.viewportBounds) {
      newWidth = Math.min(newWidth, this.viewportBounds.width * 0.95);
      // Allow height to grow much larger for containers with many children
      const minRequiredHeight = Math.max(newHeight, 800); // Minimum 800px for containers
      newHeight = Math.min(minRequiredHeight, this.viewportBounds.height * 5.0); // Allow up to 5x viewport height
    }

    parent.width = newWidth;
    parent.height = newHeight;

    // Store parent position (will be set by its parent or root positioning)
    if (!positions.has(parent.id)) {
      positions.set(parent.id, { x: 0, y: 0 });
    }
  }

  private positionRootNodes(nodes: LayoutNode[], positions: Map<string, Position>, spacing: number = 50): void {
    // Separate nodes into containers (with children) and leaf nodes (no children)
    const containerNodes = nodes.filter(node => node.children && node.children.length > 0);
    const leafNodes = nodes.filter(node => !node.children || node.children.length === 0);


    // Position container nodes first - give main container full width
    let x = spacing;
    let maxContainerHeight = 0;

    containerNodes.forEach((node, index) => {
      if (index === 0 && this.viewportBounds) {
        // First container (usually Kalisi) gets full viewport width
        node.width = this.viewportBounds.width * 0.95;

        // Re-layout children now that parent width changed
        this.layoutChildrenInParent(node, positions);

      }

      positions.set(node.id, { x, y: spacing });
      maxContainerHeight = Math.max(maxContainerHeight, node.height);
      x += node.width + spacing;
    });

    // Position leaf nodes below the containers in a compact grid
    if (leafNodes.length > 0) {
      this.positionLeafNodesBelow(leafNodes, positions, spacing, maxContainerHeight + spacing * 2);
    }
  }

  /**
   * Position leaf nodes in a compact grid below the main containers
   */
  private positionLeafNodesBelow(
    leafNodes: LayoutNode[],
    positions: Map<string, Position>,
    spacing: number,
    startY: number
  ): void {
    const availableWidth = this.viewportBounds ? this.viewportBounds.width * 0.9 : 1200;
    const avgLeafWidth = leafNodes.reduce((sum, node) => sum + node.width, 0) / leafNodes.length;
    const leafNodesPerRow = Math.max(1, Math.floor(availableWidth / (avgLeafWidth + spacing)));

    let x = spacing;
    let y = startY;
    let currentRow = 0;
    let maxRowHeight = 0;

    leafNodes.forEach((node, index) => {
      // Start new row if needed
      if (index > 0 && index % leafNodesPerRow === 0) {
        x = spacing;
        y += maxRowHeight + spacing;
        maxRowHeight = 0;
      }

      positions.set(node.id, { x, y });
      maxRowHeight = Math.max(maxRowHeight, node.height);
      x += node.width + spacing;
    });
  }

  /**
   * Get available width for laying out children within a parent
   * Considers viewport constraints to prevent overflow
   */
  private getAvailableParentWidth(parent: LayoutNode): number {
    // If viewport bounds are set and parent is large, use viewport constraint
    if (this.viewportBounds && parent.width > this.viewportBounds.width) {
      return this.viewportBounds.width * 0.9; // Use 90% of viewport width
    }

    // Otherwise use the parent's actual width
    return parent.width;
  }
}