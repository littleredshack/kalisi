import { BaseLayoutEngine, ILayoutEngine, LayoutResult } from '../canvas/layout';
import { HierarchicalNode, Edge, Camera } from '../canvas/types';

/**
 * Clean layout engine for hierarchical codebase visualization
 * Replaces the messy LayoutEngineAdapter pattern with direct implementation
 *
 * This engine:
 * 1. Transforms CodebaseNode entities to HierarchicalNodes
 * 2. Builds hierarchy from CONTAINS relationships
 * 3. Positions children in grid layout within parents
 * 4. Creates edges for non-CONTAINS relationships
 */
export class CodebaseHierarchicalLayoutEngine extends BaseLayoutEngine {

  getName(): string {
    return 'codebase-hierarchical';
  }

  applyLayout(entities: any[], relationships: any[]): LayoutResult {
    // Step 1: Transform entities to hierarchical nodes
    console.log(`LAYOUT DEBUG: Processing ${entities.length} entities, ${relationships.length} relationships`);
    const nodeMap = new Map<string, HierarchicalNode>();
    const rootNodes: HierarchicalNode[] = [];

    // Create all nodes first
    entities.forEach(entity => {
      if (entity.id === 'test-modular-root') return; // Skip root

      const nodeSize = this.getNodeSize(entity.properties?.type);
      const node = this.createHierarchicalNode(
        entity,
        0, 0, // Position will be calculated later
        nodeSize.width,
        nodeSize.height
      );

      nodeMap.set(entity.id, node);

      // Identify root level nodes (usually containers)
      if (entity.properties?.type === 'container' || entity.name === 'Kalisi') {
        rootNodes.push(node);
        console.log(`LAYOUT DEBUG: Added root node: ${entity.name} (${entity.id})`);
      }
    });

    // Step 2: Build hierarchy from CONTAINS relationships
    relationships.forEach(rel => {
      if (rel.type === 'CONTAINS') {
        const parent = nodeMap.get(rel.source);
        const child = nodeMap.get(rel.target);
        if (parent && child) {
          parent.children.push(child);
        }
      }
    });

    // Step 3: Calculate positions using grid layout
    this.calculateHierarchicalLayout(rootNodes);
    this.positionRootNodes(rootNodes);

    // Step 4: Calculate appropriate camera positioning for the content
    const camera = this.calculateOptimalCamera(rootNodes);

    return {
      nodes: rootNodes,
      camera: camera
    };
  }

  /**
   * Calculate optimal camera positioning to center on all content
   */
  private calculateOptimalCamera(rootNodes: HierarchicalNode[]): Camera {
    if (rootNodes.length === 0) {
      return { x: 0, y: 0, zoom: 1.0 };
    }

    // Calculate bounding box of all content
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const calculateBounds = (nodes: HierarchicalNode[], parentX = 0, parentY = 0) => {
      nodes.forEach(node => {
        const worldX = parentX + node.x;
        const worldY = parentY + node.y;

        minX = Math.min(minX, worldX);
        minY = Math.min(minY, worldY);
        maxX = Math.max(maxX, worldX + node.width);
        maxY = Math.max(maxY, worldY + node.height);

        // Recursively check children
        if (node.children && node.children.length > 0) {
          calculateBounds(node.children, worldX, worldY);
        }
      });
    };

    calculateBounds(rootNodes);

    // Calculate center of content
    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    console.log(`LAYOUT BOUNDS: minX:${minX.toFixed(1)} maxX:${maxX.toFixed(1)} minY:${minY.toFixed(1)} maxY:${maxY.toFixed(1)}`);
    console.log(`LAYOUT BOUNDS: width:${(maxX-minX).toFixed(1)} height:${(maxY-minY).toFixed(1)}`);
    console.log(`LAYOUT BOUNDS: center:(${centerX.toFixed(1)}, ${centerY.toFixed(1)})`);

    // Debug: Check where root nodes are actually positioned after layout
    rootNodes.forEach(node => {
      console.log(`LAYOUT DEBUG: Root node "${node.text}" positioned at (${node.x.toFixed(1)}, ${node.y.toFixed(1)}) size:(${node.width}x${node.height})`);
    });

    return {
      x: centerX,
      y: centerY,
      zoom: 1.0
    };
  }

  /**
   * Calculate optimal nodes per row for large-scale layouts
   * Creates roughly square grids with reasonable aspect ratios
   */
  private calculateOptimalNodesPerRow(childCount: number): number {
    if (childCount <= 6) return Math.min(3, childCount);
    if (childCount <= 25) return Math.ceil(Math.sqrt(childCount));
    if (childCount <= 100) return Math.ceil(Math.sqrt(childCount * 1.2)); // Slightly wider

    // For very large containers (like Kalisi with 1000+ nodes)
    // Use wider grids to create better aspect ratios
    return Math.ceil(Math.sqrt(childCount * 1.5));
  }

  /**
   * Get node size based on type
   */
  private getNodeSize(type: string): { width: number; height: number } {
    const sizes = {
      'container': { width: 300, height: 200 }, // Larger for big hierarchies
      'node': { width: 140, height: 70 },       // Slightly smaller to fit more
      'component': { width: 110, height: 55 }   // Compact for leaf nodes
    };
    return sizes[type as keyof typeof sizes] || sizes.node;
  }

  /**
   * Calculate hierarchical layout - process bottom-up to size parents based on children
   */
  private calculateHierarchicalLayout(nodes: HierarchicalNode[]): void {
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        // Recursively process children first
        this.calculateHierarchicalLayout(node.children);

        // Layout children in grid within parent
        this.layoutChildrenInParent(node);
      }
    });
  }

  /**
   * Layout children in grid within parent container
   * Optimized for large-scale codebase with 7000+ nodes
   */
  private layoutChildrenInParent(parent: HierarchicalNode): void {
    if (!parent.children || parent.children.length === 0) return;

    const padding = 20;
    const topPadding = 40; // Extra space for title
    const sidePadding = padding;
    const bottomPadding = padding;
    const nodeSpacing = 15; // Tighter spacing for large codebases

    // Dynamic grid sizing based on child count for better large-scale layout
    const childCount = parent.children.length;
    const nodesPerRow = this.calculateOptimalNodesPerRow(childCount);

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
      child.x = x;
      child.y = y;

      // Track max dimensions for resizing parent
      maxRowHeight = Math.max(maxRowHeight, child.height);
      maxX = Math.max(maxX, x + child.width);
      maxY = Math.max(maxY, y + child.height);

      // Move to next column
      x += child.width + nodeSpacing;
    });

    // Update parent dimensions to contain all children
    parent.width = Math.max(parent.width, maxX + sidePadding);
    parent.height = Math.max(parent.height, maxY + bottomPadding);
  }

  /**
   * Position root nodes horizontally with spacing
   */
  private positionRootNodes(nodes: HierarchicalNode[], spacing: number = 50): void {
    let x = spacing;

    nodes.forEach(node => {
      node.x = x;
      node.y = spacing;

      x += node.width + spacing;
    });
  }

  /**
   * Override createHierarchicalNode to add GUID for proper edge matching
   */
  protected override createHierarchicalNode(entity: any, x: number, y: number, width: number, height: number): HierarchicalNode {
    const colors = this.getNodeColor(entity.properties?.type || 'node');

    return {
      id: entity.name,
      GUID: entity.id, // CRITICAL: Must preserve GUID for edge matching
      type: entity.properties?.type || 'node',
      x,
      y,
      width,
      height,
      text: entity.name,
      style: colors,
      selected: false,
      visible: true,
      collapsed: false,
      dragging: false,
      children: []
    };
  }
}