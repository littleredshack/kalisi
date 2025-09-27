import { Injectable } from '@angular/core';
import { HierarchicalNode } from '../../shared/canvas/types';
import { CollapseBehavior } from './view-node-state.service';

/**
 * Service to dynamically reflow node layouts when parents collapse/expand
 * Calculates new positions for sibling nodes to utilize freed space
 */
@Injectable({
  providedIn: 'root'
})
export class DynamicLayoutService {

  /**
   * Reflow sibling nodes when a node collapses or expands
   * @param nodes All top-level nodes
   * @param changedNodeId The node that was collapsed/expanded
   * @param collapseBehavior Current collapse behavior setting
   * @param containerBounds Optional container dimensions for optimal space utilization
   */
  reflowSiblings(
    nodes: HierarchicalNode[],
    changedNodeId: string,
    collapseBehavior: CollapseBehavior,
    containerBounds?: { width: number; height: number },
    viewportBounds?: { width: number; height: number }
  ): void {

    // Only reflow if we're in shrink mode
    if (collapseBehavior !== 'shrink') {
      return;
    }

    // Find the changed node and its parent context
    const context = this.findNodeContext(nodes, changedNodeId);
    if (!context) {
      return;
    }

    const { node: changedNode, siblings, parent } = context;


    // For a more complete reorganization, do a full container reflow
    // This will optimally position all siblings instead of just moving them slightly
    this.reflowContainer(siblings, containerBounds, viewportBounds);

    // Always check if parent needs to grow when children expand
    if (parent) {
      this.ensureParentContainsChildren(parent, viewportBounds);
    }

    // If this node has children and is expanded, reflow them too
    if (!changedNode.collapsed && changedNode.children && changedNode.children.length > 0) {
      this.reflowChildren(changedNode.children);
    }
  }

  /**
   * Find a node and its context (siblings and parent)
   * Uses GUID-based matching for consistency
   */
  private findNodeContext(
    nodes: HierarchicalNode[],
    nodeId: string,
    parent: HierarchicalNode | null = null
  ): { node: HierarchicalNode; siblings: HierarchicalNode[]; parent: HierarchicalNode | null } | null {
    for (const node of nodes) {
      // Check both GUID and id for compatibility
      if (node.GUID === nodeId || node.id === nodeId) {
        return { node, siblings: nodes, parent };
      }
      if (node.children) {
        const result = this.findNodeContext(node.children, nodeId, node);
        if (result) return result;
      }
    }
    return null;
  }

  /**
   * Calculate the space difference when a node collapses/expands
   */
  private calculateSpaceDifference(node: HierarchicalNode): number {
    if (!node.children || node.children.length === 0) {
      return 0;
    }

    // When collapsed, node shrinks from container size to standard node size
    const standardNodeHeight = 60;
    const containerHeight = node.height;

    if (node.collapsed) {
      // Node is now collapsed, it freed up space
      return containerHeight - standardNodeHeight;
    } else {
      // Node is now expanded, it needs more space
      return standardNodeHeight - containerHeight;
    }
  }

  /**
   * Reposition sibling nodes to utilize freed space or make room
   */
  private repositionSiblings(
    siblings: HierarchicalNode[],
    changedNode: HierarchicalNode,
    spaceDiff: number
  ): void {
    // Sort siblings by Y position
    const sortedSiblings = [...siblings].sort((a, b) => a.y - b.y);
    const changedNodeIndex = sortedSiblings.findIndex(n => n.id === changedNode.id);

    // Calculate the adjustment for nodes below the changed node
    const adjustment = spaceDiff;

    // Move all nodes below the changed node
    for (let i = changedNodeIndex + 1; i < sortedSiblings.length; i++) {
      const sibling = sortedSiblings[i];
      sibling.y -= adjustment; // Move up if space was freed, down if space is needed

      // Apply smooth transition by storing target position
      (sibling as any).targetY = sibling.y;
    }

    // Compact the layout - ensure minimum spacing
    this.ensureMinimumSpacing(sortedSiblings);
  }

  /**
   * Ensure minimum spacing between nodes
   */
  private ensureMinimumSpacing(nodes: HierarchicalNode[]): void {
    const MIN_VERTICAL_SPACING = 20;

    for (let i = 1; i < nodes.length; i++) {
      const prevNode = nodes[i - 1];
      const currNode = nodes[i];

      // Calculate the actual height of the previous node
      const prevHeight = this.getEffectiveHeight(prevNode);

      // Ensure minimum spacing
      const minY = prevNode.y + prevHeight + MIN_VERTICAL_SPACING;
      if (currNode.y < minY) {
        currNode.y = minY;
        (currNode as any).targetY = currNode.y;
      }
    }
  }

  /**
   * Get the effective height of a node (considering collapse state)
   */
  private getEffectiveHeight(node: HierarchicalNode): number {
    if (node.collapsed && node.children && node.children.length > 0) {
      return 60; // Standard node height when collapsed
    }
    return node.height;
  }

  /**
   * Reflow children within their parent container
   */
  private reflowChildren(children: HierarchicalNode[]): void {
    const PADDING = 20;
    const SPACING = 20;
    let currentY = PADDING;

    for (const child of children) {
      child.y = currentY;
      (child as any).targetY = currentY;

      const childHeight = this.getEffectiveHeight(child);
      currentY += childHeight + SPACING;

      // Recursively reflow nested children
      if (!child.collapsed && child.children && child.children.length > 0) {
        this.reflowChildren(child.children);
      }
    }
  }

  /**
   * Calculate optimal positions for all nodes in a level
   * Used for complete reflow of a container
   * @param containerBounds Optional container dimensions for optimal space utilization
   */
  reflowContainer(
    nodes: HierarchicalNode[],
    containerBounds?: { width: number; height: number },
    viewportBounds?: { width: number; height: number }
  ): void {
    if (nodes.length === 0) return;

    const PADDING = 20;
    const HORIZONTAL_SPACING = 30;
    const VERTICAL_SPACING = 20;

    // Use viewport-constrained layout by default to prevent infinite spreading
    const effectiveBounds = this.getEffectiveLayoutBounds(containerBounds, viewportBounds);


    // For optimal space utilization, prefer horizontal flow layout when bounds are available
    if (effectiveBounds && effectiveBounds.width > 800) {
      // Use grid layout to make best use of the available width
      this.applyOptimalGridLayout(nodes, PADDING, HORIZONTAL_SPACING, VERTICAL_SPACING, effectiveBounds);
    } else {
      // Fallback to current logic for smaller containers or when no bounds available
      const isHorizontalLayout = this.detectLayoutDirection(nodes);

      if (isHorizontalLayout) {
        // Horizontal flow layout (like a grid)
        this.applyHorizontalFlowLayout(nodes, PADDING, HORIZONTAL_SPACING, VERTICAL_SPACING, effectiveBounds);
      } else {
        // Vertical stack layout
        this.applyVerticalStackLayout(nodes, PADDING, VERTICAL_SPACING, effectiveBounds);
      }
    }
  }

  /**
   * Get effective layout bounds prioritizing viewport constraints over huge containers
   */
  private getEffectiveLayoutBounds(
    containerBounds?: { width: number; height: number },
    viewportBounds?: { width: number; height: number }
  ): { width: number; height: number } | undefined {
    if (!containerBounds && !viewportBounds) return undefined;

    if (!containerBounds) {
      // No container, use viewport with some margin
      return viewportBounds ? {
        width: viewportBounds.width * 0.9,
        height: viewportBounds.height * 0.9
      } : undefined;
    }

    if (!viewportBounds) {
      // No viewport info, use container bounds
      return containerBounds;
    }

    // Both available - use the smaller dimensions to prevent spreading beyond screen
    return {
      width: Math.min(containerBounds.width, viewportBounds.width * 0.9),
      height: Math.min(containerBounds.height, viewportBounds.height * 0.9)
    };
  }

  /**
   * Detect if nodes are arranged horizontally or vertically
   */
  private detectLayoutDirection(nodes: HierarchicalNode[]): boolean {
    if (nodes.length < 2) return false;

    // Calculate variance in X and Y positions
    const xPositions = nodes.map(n => n.x);
    const yPositions = nodes.map(n => n.y);

    const xVariance = this.calculateVariance(xPositions);
    const yVariance = this.calculateVariance(yPositions);

    // If X variance is much higher than Y variance, it's horizontal layout
    return xVariance > yVariance * 2;
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Apply horizontal flow layout (grid-like)
   */
  private applyHorizontalFlowLayout(
    nodes: HierarchicalNode[],
    padding: number,
    hSpacing: number,
    vSpacing: number,
    containerBounds?: { width: number; height: number }
  ): void {
    // Use actual container width if provided, otherwise estimate from node positions
    let containerWidth: number;
    if (containerBounds) {
      containerWidth = containerBounds.width - (padding * 2); // Account for padding on both sides
    } else {
      const maxX = Math.max(...nodes.map(n => n.x + n.width));
      containerWidth = Math.max(maxX, 1000); // Minimum 1000px width fallback
    }

    // Group nodes by row based on available width
    const rows: HierarchicalNode[][] = [];
    let currentRow: HierarchicalNode[] = [];
    let currentRowWidth = padding;

    for (const node of nodes) {
      const nodeWidth = this.getEffectiveWidth(node);

      if (currentRowWidth + nodeWidth + hSpacing > containerWidth && currentRow.length > 0) {
        // Start new row
        rows.push(currentRow);
        currentRow = [node];
        currentRowWidth = padding + nodeWidth;
      } else {
        currentRow.push(node);
        currentRowWidth += nodeWidth + hSpacing;
      }
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    // Position nodes in rows
    let currentY = padding;
    for (const row of rows) {
      let currentX = padding;
      let maxHeight = 0;

      for (const node of row) {
        node.x = currentX;
        node.y = currentY;

        const nodeWidth = this.getEffectiveWidth(node);
        const nodeHeight = this.getEffectiveHeight(node);

        currentX += nodeWidth + hSpacing;
        maxHeight = Math.max(maxHeight, nodeHeight);
      }

      currentY += maxHeight + vSpacing;
    }
  }

  /**
   * Apply vertical stack layout
   */
  private applyVerticalStackLayout(
    nodes: HierarchicalNode[],
    padding: number,
    vSpacing: number,
    containerBounds?: { width: number; height: number }
  ): void {
    // Sort nodes by current Y position to maintain relative order
    const sortedNodes = [...nodes].sort((a, b) => a.y - b.y);

    let currentY = padding;
    const startX = Math.min(...nodes.map(n => n.x));

    for (const node of sortedNodes) {
      node.x = startX;
      node.y = currentY;

      const nodeHeight = this.getEffectiveHeight(node);
      currentY += nodeHeight + vSpacing;
    }
  }

  /**
   * Apply optimal grid layout to utilize full container space
   * This method creates a balanced grid that makes best use of available width and height
   */
  private applyOptimalGridLayout(
    nodes: HierarchicalNode[],
    padding: number,
    hSpacing: number,
    vSpacing: number,
    containerBounds: { width: number; height: number }
  ): void {
    if (nodes.length === 0) return;

    const availableWidth = containerBounds.width - (padding * 2);
    const availableHeight = containerBounds.height - (padding * 2);

    // Calculate average node dimensions
    const avgNodeWidth = nodes.reduce((sum, n) => sum + this.getEffectiveWidth(n), 0) / nodes.length;
    const avgNodeHeight = nodes.reduce((sum, n) => sum + this.getEffectiveHeight(n), 0) / nodes.length;

    // Estimate optimal number of columns based on available width
    const idealCols = Math.floor(availableWidth / (avgNodeWidth + hSpacing));
    const actualCols = Math.max(1, Math.min(idealCols, nodes.length));


    // Calculate grid positions with boundary checking
    let currentX = padding;
    let currentY = padding;
    let currentCol = 0;
    let maxHeightInRow = 0;

    for (const node of nodes) {
      const nodeWidth = this.getEffectiveWidth(node);
      const nodeHeight = this.getEffectiveHeight(node);

      // Check if current node would overflow - if so, force new row
      if (currentX + nodeWidth > containerBounds.width - padding && currentCol > 0) {
        currentX = padding;
        currentY += maxHeightInRow + vSpacing;
        currentCol = 0;
        maxHeightInRow = 0;
      }

      // Check if we need to start a new row based on column count
      if (currentCol >= actualCols) {
        currentX = padding;
        currentY += maxHeightInRow + vSpacing;
        currentCol = 0;
        maxHeightInRow = 0;
      }

      // Position the node with boundary enforcement
      node.x = Math.min(currentX, containerBounds.width - nodeWidth - padding);
      node.y = currentY;


      // Update for next position
      currentX += nodeWidth + hSpacing;
      maxHeightInRow = Math.max(maxHeightInRow, nodeHeight);
      currentCol++;
    }
  }

  /**
   * Ensure parent container is large enough to contain all children
   * Always grows parent if needed, respects viewport bounds
   */
  ensureParentContainsChildren(
    parentNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number }
  ): void {
    if (!parentNode.children || parentNode.children.length === 0) return;

    const CONTAINER_PADDING = 40;
    const childBounds = this.calculateChildrenBounds(parentNode.children);

    // Calculate minimum required size to contain all children
    const requiredWidth = childBounds.maxX - childBounds.minX + CONTAINER_PADDING;
    const requiredHeight = childBounds.maxY - childBounds.minY + CONTAINER_PADDING;

    // Check if parent needs to grow (allow growing beyond current size)
    const needsWidthIncrease = requiredWidth > parentNode.width;
    const needsHeightIncrease = requiredHeight > parentNode.height;

    if (needsWidthIncrease || needsHeightIncrease) {
      // Grow parent to accommodate children, but respect viewport bounds
      let newWidth = Math.max(parentNode.width, requiredWidth);
      let newHeight = Math.max(parentNode.height, requiredHeight);

      if (viewportBounds) {
        newWidth = Math.min(newWidth, viewportBounds.width * 0.95);
        newHeight = Math.min(newHeight, viewportBounds.height * 0.95);
      }

      console.log('🔧 Parent growing to contain children:', {
        container: parentNode.text,
        currentSize: { width: parentNode.width, height: parentNode.height },
        requiredSize: { width: requiredWidth, height: requiredHeight },
        newSize: { width: newWidth, height: newHeight },
        reason: needsWidthIncrease ? 'width overflow' : 'height overflow'
      });

      parentNode.width = newWidth;
      parentNode.height = newHeight;
    } else {
      // Try to shrink if possible (existing logic)
      this.resizeContainerToFitChildren(parentNode, viewportBounds);
    }
  }

  /**
   * Determine if a container should be auto-resized or left as user-sized
   * Large containers that are much bigger than viewport are likely auto-generated
   * Reasonably-sized containers may have been manually set by user
   */
  private shouldAutoResizeContainer(
    parentNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number }
  ): boolean {
    // Always auto-resize top-level containers (like Kalisi) to fit content
    if (parentNode.text === 'Kalisi' || parentNode.type === 'root') {
      return true;
    }

    if (!viewportBounds) return true; // Always auto-resize if no viewport info

    // If container is much larger than viewport, it's likely auto-generated and should be resized
    const isHuge = parentNode.width > viewportBounds.width * 2 || parentNode.height > viewportBounds.height * 2;

    // If container seems reasonably sized relative to viewport, preserve user sizing
    const isReasonable = parentNode.width <= viewportBounds.width * 1.5 && parentNode.height <= viewportBounds.height * 1.5;

    return isHuge && !isReasonable;
  }

  /**
   * Resize a parent container to optimally fit its children after reflow
   * Respects viewport bounds to prevent containers from being too large
   */
  private resizeContainerToFitChildren(
    parentNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number }
  ): void {
    if (!parentNode.children || parentNode.children.length === 0) {
      return;
    }

    const CONTAINER_PADDING = 40; // Extra space around children

    // Calculate the bounding box of all children
    const childBounds = this.calculateChildrenBounds(parentNode.children);

    // Set new container size with padding
    let newWidth = childBounds.maxX - childBounds.minX + CONTAINER_PADDING;
    let newHeight = childBounds.maxY - childBounds.minY + CONTAINER_PADDING;

    // Constrain to viewport if provided (prevent containers larger than screen)
    if (viewportBounds) {
      newWidth = Math.min(newWidth, viewportBounds.width * 0.95);
      newHeight = Math.min(newHeight, viewportBounds.height * 0.95);
    }

    console.log('🖥️ Container resize analysis:', {
      container: parentNode.text,
      currentSize: { width: parentNode.width, height: parentNode.height },
      contentSize: { width: newWidth, height: newHeight },
      viewportSize: viewportBounds,
      sizeReduction: ((parentNode.width - newWidth) / parentNode.width * 100).toFixed(1) + '%'
    });

    // Resize if there's a significant change (shrinking OR expanding)
    const widthChange = Math.abs(parentNode.width - newWidth) / parentNode.width;
    const heightChange = Math.abs(parentNode.height - newHeight) / parentNode.height;

    // Be more aggressive about height changes for top-level containers
    const heightThreshold = (parentNode.text === 'Kalisi' || parentNode.type === 'root') ? 0.1 : 0.2;

    if (widthChange > 0.2 || heightChange > heightThreshold) { // Resize for significant changes
      // When expanding, respect viewport bounds to prevent going off-screen
      const finalWidth = viewportBounds ?
        Math.min(Math.max(newWidth, 400), viewportBounds.width * 0.95) :
        Math.max(newWidth, 400);
      const finalHeight = viewportBounds ?
        Math.min(Math.max(newHeight, 200), viewportBounds.height * 0.95) :
        Math.max(newHeight, 200);

      parentNode.width = finalWidth;
      parentNode.height = finalHeight;

      console.log('✅ Container resized:', {
        container: parentNode.text,
        change: widthChange > heightChange ? 'width' : 'height',
        direction: newWidth > parentNode.width ? 'expanded' : 'shrunk',
        newSize: { width: parentNode.width, height: parentNode.height }
      });
    }
  }

  /**
   * Calculate the bounding box that contains all children
   */
  private calculateChildrenBounds(children: HierarchicalNode[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    if (children.length === 0) {
      return { minX: 0, minY: 0, maxX: 400, maxY: 200 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const child of children) {
      const childWidth = this.getEffectiveWidth(child);
      const childHeight = this.getEffectiveHeight(child);

      minX = Math.min(minX, child.x);
      minY = Math.min(minY, child.y);
      maxX = Math.max(maxX, child.x + childWidth);
      maxY = Math.max(maxY, child.y + childHeight);
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Get the effective width of a node (considering collapse state)
   */
  private getEffectiveWidth(node: HierarchicalNode): number {
    if (node.collapsed && node.children && node.children.length > 0) {
      return 180; // Standard node width when collapsed
    }
    return node.width;
  }
}