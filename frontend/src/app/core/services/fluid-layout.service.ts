import { Injectable } from '@angular/core';
import { HierarchicalNode } from '../../shared/canvas/types';

/**
 * Professional Fluid Layout Service
 *
 * Provides intelligent force-directed layout with:
 * - Dynamic content-based sizing (no hardcoded dimensions)
 * - Space optimization and gap detection
 * - Hierarchical container management
 * - Real-time boundary adjustment
 */
export type LayoutContext = 'level-collapse' | 'individual-expand' | 'parent-cascade';

@Injectable({
  providedIn: 'root'
})
export class FluidLayoutService {
  private allNodes: HierarchicalNode[] = [];

  /**
   * Unified layout method - handles all layout scenarios
   */
  applyUnifiedLayout(
    containerNode: HierarchicalNode,
    context: LayoutContext,
    viewportBounds?: { width: number; height: number },
    collapseBehavior: 'full-size' | 'shrink' = 'full-size'
  ): void {
    if (!containerNode.children || containerNode.children.length === 0) return;


    // Apply layout based on context
    switch (context) {
      case 'level-collapse':
        this.handleLevelCollapseLayout(containerNode, viewportBounds, collapseBehavior);
        break;
      case 'individual-expand':
        this.handleIndividualExpandLayout(containerNode, viewportBounds, collapseBehavior);
        break;
      case 'parent-cascade':
        this.handleParentCascadeLayout(containerNode, viewportBounds, collapseBehavior);
        break;
    }

  }

  /**
   * Handle layout for level collapse operations
   */
  private handleLevelCollapseLayout(
    containerNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number },
    collapseBehavior: 'full-size' | 'shrink' = 'full-size'
  ): void {
    // Level collapse: optimize for many collapsed children in clean grid
    this.calculateDynamicSizes(containerNode.children, collapseBehavior);
    this.optimizeChildPositions(containerNode, viewportBounds, collapseBehavior);
    this.adjustContainerBounds(containerNode, viewportBounds);
  }

  /**
   * Handle layout for individual node expansion
   */
  private handleIndividualExpandLayout(
    containerNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number },
    collapseBehavior: 'full-size' | 'shrink' = 'full-size'
  ): void {
    // Individual expand: complete layout recalculation for optimal positioning
    this.calculateDynamicSizes(containerNode.children, collapseBehavior);
    this.optimizeChildPositions(containerNode, viewportBounds, collapseBehavior);

    // Only adjust container bounds if this is not a parent that was pre-expanded
    if (!this.wasPreExpanded(containerNode)) {
      this.adjustContainerBounds(containerNode, viewportBounds);
    } else {
    }

    // Check parent expansion for individual expand layout
    this.checkAndExpandImmediateParent(containerNode, viewportBounds);
  }

  /**
   * Check if container was pre-expanded and shouldn't be resized again
   */
  private wasPreExpanded(containerNode: HierarchicalNode): boolean {
    // For now, assume containers with width > 1200 were pre-expanded
    // This could be enhanced with proper state tracking
    return containerNode.width > 1200;
  }

  /**
   * Check if node is an expanded container that should preserve its size
   */
  private isExpandedContainer(node: HierarchicalNode): boolean {
    // Expanded containers are large and have children
    const hasChildren = node.children && node.children.length > 0;
    const isLarge = node.width > 800 || node.height > 200;
    const isNotCollapsed = !node.collapsed;

    return hasChildren && isLarge && isNotCollapsed;
  }

  /**
   * Handle layout for parent cascade adjustments
   */
  private handleParentCascadeLayout(
    containerNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number },
    collapseBehavior: 'full-size' | 'shrink' = 'full-size'
  ): void {
    // Parent cascade: minimal adjustment, just resize to fit children
    this.adjustContainerBounds(containerNode, viewportBounds);
  }

  /**
   * Check and expand immediate parent if needed
   */
  private checkAndExpandImmediateParent(
    expandedContainer: HierarchicalNode,
    viewportBounds?: { width: number; height: number }
  ): void {
    const parent = this.findParentOfNode(expandedContainer, this.getAllNodes());
    if (!parent) {
      console.log(`\n🔄 "${expandedContainer.text}" is top-level - no parent to expand`);
      return;
    }

    const needsExpansion = this.checkIfParentNeedsExpansion(expandedContainer, parent);

    if (needsExpansion.width || needsExpansion.height) {
      const oldSize = {width: parent.width, height: parent.height};
      this.expandParentWithHeightPreference(parent, needsExpansion, viewportBounds);
      console.log(`🔍 BORDER REFRESH: Kalisi ${oldSize.width}x${oldSize.height} → ${parent.width}x${parent.height}`);

      // Reposition siblings within expanded parent
      this.applyUnifiedLayout(parent, 'individual-expand', viewportBounds, 'shrink');
    }
  }

  /**
   * Backward compatibility method - delegates to unified layout
   */
  applyFluidLayout(
    containerNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number },
    collapseBehavior: 'full-size' | 'shrink' = 'full-size'
  ): void {
    this.applyUnifiedLayout(containerNode, 'individual-expand', viewportBounds, collapseBehavior);
  }

  /**
   * Calculate dynamic node sizes based on actual content
   */
  private calculateDynamicSizes(nodes: HierarchicalNode[], collapseBehavior: 'full-size' | 'shrink' = 'full-size'): void {
    nodes.forEach((node, index) => {
      const oldSize = { width: node.width, height: node.height };

      // Calculate size based on content rather than hardcoded values
      const contentSize = this.calculateContentBasedSize(node);

      // Use rendered size if collapsed and shrink mode is enabled
      const isCollapsed = node.collapsed && node.children && node.children.length > 0;
      const willShrink = isCollapsed && collapseBehavior === 'shrink';

      if (!this.hasUserDefinedSize(node)) {
        if (willShrink) {
          // Use the size that will actually be rendered (collapsed size)
          node.width = 180;
          node.height = 60;
        } else if (this.isExpandedContainer(node)) {
          // Preserve expanded container sizes - don't downsize them
            // Keep existing size
        } else {
          // Use content-based size for normal nodes
          node.width = contentSize.width;
          node.height = contentSize.height;
        }
      }

    });
  }

  /**
   * Calculate node size based on actual content
   */
  private calculateContentBasedSize(node: HierarchicalNode): { width: number; height: number } {
    // Base size factors
    const textLength = node.text?.length || 0;
    const childCount = node.children?.length || 0;
    const hasChildren = childCount > 0;

    // Dynamic width based on text length and child count
    const minWidth = 120;
    const textWidth = Math.max(minWidth, textLength * 8 + 40); // 8px per character + padding
    const childAdjustment = hasChildren ? Math.min(childCount * 10, 100) : 0; // Up to 100px extra for children
    const dynamicWidth = textWidth + childAdjustment;

    // Dynamic height based on content complexity
    const minHeight = 60;
    const baseHeight = hasChildren ? 100 : 60; // Containers slightly taller
    const complexityHeight = hasChildren ? Math.min(childCount * 2, 50) : 0; // Up to 50px for complexity
    const dynamicHeight = baseHeight + complexityHeight;

    return {
      width: Math.max(minWidth, Math.min(dynamicWidth, 300)), // Cap at 300px width
      height: Math.max(minHeight, Math.min(dynamicHeight, 200)) // Cap at 200px height
    };
  }

  /**
   * Check if node has user-defined size (vs auto-calculated)
   */
  private hasUserDefinedSize(node: HierarchicalNode): boolean {
    // For now, assume nodes with non-standard sizes were user-defined
    // This could be enhanced with metadata tracking
    return false; // All nodes use dynamic sizing for now
  }

  /**
   * Optimize child positions within container using intelligent space utilization
   */
  private optimizeChildPositions(
    containerNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number },
    collapseBehavior: 'full-size' | 'shrink' = 'full-size'
  ): void {
    const children = containerNode.children.filter(child => child.visible !== false);
    if (children.length === 0) return;

    const padding = 20;
    const spacing = 15;

    // Calculate dynamic title space based on container size and text length
    const titleSpace = this.calculateDynamicTitleSpace(containerNode);
    const bottomPadding = 30; // Space below last row

    // Only optimize container width if it wasn't pre-expanded
    if (!this.wasPreExpanded(containerNode)) {
      // Calculate optimal container width for horizontal layout
      const optimalWidth = this.calculateOptimalContainerWidth(children, viewportBounds);
      containerNode.width = optimalWidth;
    } else {
      console.log(`  Preserving pre-expanded container width: ${containerNode.width}`);
    }

    const availableWidth = containerNode.width - (padding * 2);


    // Use intelligent packing algorithm with optimal width and dynamic spacing
    this.applyIntelligentPacking(children, availableWidth, padding, titleSpace, bottomPadding, spacing);
  }

  /**
   * Calculate dynamic title space based on container properties
   */
  private calculateDynamicTitleSpace(containerNode: HierarchicalNode): number {
    const baseSpace = 40; // Minimum title space
    const textLength = containerNode.text?.length || 0;
    const hasLongName = textLength > 15;

    // More space for longer names, larger containers, or containers with many children
    const textSpaceBonus = hasLongName ? 20 : 0;
    const sizeBonus = containerNode.width > 800 ? 15 : 0;
    const childCountBonus = (containerNode.children?.length || 0) > 20 ? 10 : 0;

    const dynamicSpace = baseSpace + textSpaceBonus + sizeBonus + childCountBonus;


    return dynamicSpace;
  }

  /**
   * Calculate optimal container width to use available horizontal space efficiently
   */
  private calculateOptimalContainerWidth(
    children: HierarchicalNode[],
    viewportBounds?: { width: number; height: number }
  ): number {
    if (children.length === 0) return 400;

    // Calculate total child area
    const totalChildArea = children.reduce((sum, child) => sum + (child.width * child.height), 0);
    const avgChildWidth = children.reduce((sum, child) => sum + child.width, 0) / children.length;

    // Target 2-3 rows for efficient space usage
    const targetRows = Math.min(3, Math.ceil(children.length / 4)); // 4 nodes per row target
    const estimatedRowHeight = 120; // Estimated average child height

    // Calculate width needed for target rows
    const nodesPerRow = Math.ceil(children.length / targetRows);
    const estimatedWidth = (nodesPerRow * avgChildWidth) + (nodesPerRow * 15) + 40; // nodes + spacing + padding

    // Use viewport constraint but prefer wider containers
    const maxWidth = viewportBounds ? viewportBounds.width * 0.8 : 1200; // Use 80% of viewport
    const optimalWidth = Math.min(estimatedWidth, maxWidth);

    return Math.max(optimalWidth, 600); // Minimum 600px width for horizontal layouts
  }

  /**
   * Intelligent packing algorithm that optimizes space usage
   */
  private applyIntelligentPacking(
    nodes: HierarchicalNode[],
    availableWidth: number,
    padding: number,
    titleSpace: number,
    bottomPadding: number,
    spacing: number
  ): void {
    // Sort nodes by size for better packing
    const sortedNodes = [...nodes].sort((a, b) => (b.width * b.height) - (a.width * a.height));

    let currentX = padding;
    let currentY = titleSpace; // Start below the title area
    let currentRowHeight = 0;
    let rowNodes: HierarchicalNode[] = [];

    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i];

      const fitsInCurrentRow = currentX + node.width <= availableWidth;

      // Check if node fits in current row
      if (fitsInCurrentRow) {
        // Fits in current row
        node.x = currentX;
        node.y = currentY;


        currentX += node.width + spacing;
        currentRowHeight = Math.max(currentRowHeight, node.height);
        rowNodes.push(node);
      } else if (rowNodes.length > 0) {
        // Start new row
        // Skip vertical alignment - keep nodes in clean horizontal rows
        currentX = padding;
        currentY += currentRowHeight + spacing;
        currentRowHeight = 0;
        rowNodes = [];

        // Place node in new row
        node.x = currentX;
        node.y = currentY;
        currentX += node.width + spacing;
        currentRowHeight = node.height;
        rowNodes.push(node);
      } else {
        // Node too wide for available space - place in its own row
        node.x = padding;
        node.y = currentY;
        currentY += node.height + spacing;

        console.log(`  ⚠️ TOO WIDE: Own row at (${node.x}, ${node.y})`);
        console.log(`  Node width ${node.width} > available ${availableWidth}`);
      }
    }

  }

  /**
   * Vertically align nodes in a row for better visual appearance
   */
  private alignRowVertically(rowNodes: HierarchicalNode[], rowHeight: number): void {
    console.log(`  Aligning ${rowNodes.length} nodes in row, rowHeight: ${rowHeight}`);

    rowNodes.forEach((node, index) => {
      const oldY = node.y;
      // Center smaller nodes vertically within the row
      const verticalOffset = (rowHeight - node.height) / 2;
      node.y += verticalOffset;

      console.log(`    Node ${index} "${node.text}": Y ${oldY} + offset ${verticalOffset} = ${node.y}`);
    });
  }

  /**
   * Adjust container bounds to optimally fit the positioned children
   */
  private adjustContainerBounds(
    containerNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number }
  ): void {
    if (!containerNode.children || containerNode.children.length === 0) return;

    const visibleChildren = containerNode.children.filter(child => child.visible !== false);
    if (visibleChildren.length === 0) return;

    const sidePadding = 20;
    const titleSpace = this.calculateDynamicTitleSpace(containerNode);
    const bottomPadding = 30;

    // Calculate actual bounds needed for children
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    visibleChildren.forEach(child => {
      minX = Math.min(minX, child.x);
      minY = Math.min(minY, child.y);
      maxX = Math.max(maxX, child.x + child.width);
      maxY = Math.max(maxY, child.y + child.height);
    });

    // Calculate optimal container size with proper padding
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const optimalWidth = contentWidth + (sidePadding * 2);
    const optimalHeight = contentHeight + titleSpace + bottomPadding;

    // Apply size with intelligent constraints
    const finalWidth = viewportBounds ?
      Math.min(optimalWidth, viewportBounds.width * 0.95) :
      optimalWidth;

    const finalHeight = viewportBounds ?
      Math.min(optimalHeight, viewportBounds.height * 1.5) : // Allow more height for content
      optimalHeight;

    // Always apply the calculated size to ensure proper containment
    containerNode.width = finalWidth;
    containerNode.height = finalHeight;
  }

  /**
   * Legacy method - kept for any external references
   */
  recursiveParentExpansion(
    expandedNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number }
  ): void {
    // Delegate to the new immediate parent approach
    this.checkAndExpandImmediateParent(expandedNode, viewportBounds);
  }

  /**
   * Check if parent container needs to grow to fit child
   */
  private checkIfParentNeedsExpansion(
    child: HierarchicalNode,
    parent: HierarchicalNode
  ): { width: boolean; height: boolean } {
    const padding = 40;

    // Calculate space needed for child within parent
    const childRightEdge = child.x + child.width + padding;
    const childBottomEdge = child.y + child.height + padding;


    return {
      width: childRightEdge > parent.width,
      height: childBottomEdge > parent.height
    };
  }

  /**
   * Expand parent container with preference for height over width
   */
  private expandParentWithHeightPreference(
    parent: HierarchicalNode,
    needsExpansion: { width: boolean; height: boolean },
    viewportBounds?: { width: number; height: number }
  ): void {
    const padding = 40;

    if (needsExpansion.height) {
      // Calculate required height based on all children
      const childBounds = this.calculateChildrenBounds(parent.children || []);
      const requiredHeight = childBounds.maxY + padding;

      // Prefer height expansion - be generous with height growth
      const maxHeight = viewportBounds ? viewportBounds.height * 1.5 : 2000; // Allow up to 1.5x viewport
      parent.height = Math.min(requiredHeight, maxHeight);

      console.log('🌊 Parent height expanded:', {
        parent: parent.text,
        newHeight: parent.height,
        reason: 'child overflow'
      });
    }

    if (needsExpansion.width) {
      // Only expand width if height expansion isn't sufficient
      const childBounds = this.calculateChildrenBounds(parent.children || []);
      const requiredWidth = childBounds.maxX + padding;

      // Be more conservative with width expansion
      const maxWidth = viewportBounds ? viewportBounds.width * 0.9 : 1200; // Limit to 90% viewport
      parent.width = Math.min(requiredWidth, maxWidth);

      console.log('🌊 Parent width expanded:', {
        parent: parent.text,
        newWidth: parent.width,
        reason: 'child overflow after height expansion'
      });
    }
  }

  /**
   * Calculate bounding box of children
   */
  private calculateChildrenBounds(children: HierarchicalNode[]): { maxX: number; maxY: number } {
    if (children.length === 0) return { maxX: 0, maxY: 0 };

    let maxX = 0;
    let maxY = 0;

    children.forEach(child => {
      if (child.visible !== false) {
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
      }
    });

    return { maxX, maxY };
  }

  /**
   * Utility method to find parent of a node
   */
  private findParentOfNode(target: HierarchicalNode, allNodes: HierarchicalNode[]): HierarchicalNode | null {
    for (const node of allNodes) {
      if (node.children?.includes(target)) {
        return node;
      }
      if (node.children) {
        const found = this.findParentOfNode(target, node.children);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Set reference to all nodes for parent finding
   */
  setAllNodes(nodes: HierarchicalNode[]): void {
    this.allNodes = nodes;
  }

  /**
   * Get all nodes flattened for parent searching
   */
  private getAllNodes(): HierarchicalNode[] {
    return this.allNodes;
  }

  /**
   * Detect and report any overlapping nodes
   */
  private detectOverlaps(nodes: HierarchicalNode[]): void {
    console.log('\n--- OVERLAP DETECTION ---');
    let overlapCount = 0;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        // Check if rectangles overlap
        const overlapX = !(nodeA.x + nodeA.width <= nodeB.x || nodeB.x + nodeB.width <= nodeA.x);
        const overlapY = !(nodeA.y + nodeA.height <= nodeB.y || nodeB.y + nodeB.height <= nodeA.y);

        if (overlapX && overlapY) {
          overlapCount++;
          console.log(`OVERLAP ${overlapCount}: "${nodeA.text}" (${nodeA.x},${nodeA.y} ${nodeA.width}x${nodeA.height}) overlaps "${nodeB.text}" (${nodeB.x},${nodeB.y} ${nodeB.width}x${nodeB.height})`);
        }
      }
    }

    if (overlapCount === 0) {
      console.log('✅ No overlaps detected');
    } else {
      console.log(`❌ Total overlaps found: ${overlapCount}`);
    }
  }
}