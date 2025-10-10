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
    const nodeMap = new Map<string, HierarchicalNode>();
    const childIds = new Set<string>();

    entities.forEach(entity => {
      if (!entity || entity.id === 'test-modular-root') {
        return;
      }

      const guid = entity.id || entity.properties?.GUID || entity.properties?.guid;
      if (!guid) {
        return;
      }

      const kind = entity.properties?.kind || entity.properties?.type || '';
      const layoutType = this.mapKindToLayoutType(kind);
      const nodeSize = this.getNodeSize(layoutType);

      const node = this.createHierarchicalNodeWithMetadata(
        entity,
        guid,
        nodeSize.width,
        nodeSize.height,
        layoutType,
        kind
      );

      nodeMap.set(entity.id, node);
    });

    relationships.forEach(rel => {
      if (rel.type !== 'CONTAINS') {
        return;
      }
      const parentId = rel.fromGUID || rel.source || rel.from;
      const childId = rel.toGUID || rel.target || rel.to;
      const parent = parentId ? nodeMap.get(parentId) : undefined;
      const child = childId ? nodeMap.get(childId) : undefined;
      if (parent && child) {
        parent.children.push(child);
        childIds.add(child.GUID ?? child.id);
      }
    });

    const allNodes = Array.from(nodeMap.values());
    console.log('[Layout] nodeMap size', allNodes.length, 'relationships', relationships.length);
    const rootNodes = allNodes.filter(node => {
      const guid = node.GUID ?? node.id;
      if (!guid) {
        return false;
      }
      return !childIds.has(guid);
    });

    if (rootNodes.length === 0 && allNodes.length > 0) {
      const fallbackRoot = allNodes.find(node => {
        const type = node.type?.toLowerCase();
        return type === 'workspace' || type === 'container';
      }) || allNodes[0];
      rootNodes.push(fallbackRoot);
    }

    const workspaceRoot = rootNodes.find(node => node.type?.toLowerCase() === 'workspace') || rootNodes[0];
    const orderedRoots = workspaceRoot ? [workspaceRoot, ...rootNodes.filter(node => node !== workspaceRoot)] : rootNodes;
    console.log('[Layout] root nodes after ordering', orderedRoots.map(node => node.text));

    this.calculateHierarchicalLayout(orderedRoots);
    this.positionRootNodes(orderedRoots);

    const camera = this.calculateOptimalCamera(orderedRoots);

    return {
      nodes: orderedRoots,
      camera
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
  private createHierarchicalNodeWithMetadata(
    entity: any,
    guid: string,
    width: number,
    height: number,
    layoutType: string,
    kind: string
  ): HierarchicalNode {
    const colors = this.getNodeColor(layoutType);
    const label = this.getNodeLabel(kind, entity.name);

    return {
      id: guid,
      GUID: guid,
      type: layoutType,
      x: 0,
      y: 0,
      width,
      height,
      text: label,
      style: colors,
      selected: false,
      visible: true,
      collapsed: false,
      dragging: false,
      children: []
    };
  }

  private mapKindToLayoutType(kind: string): 'container' | 'node' | 'component' {
    const normalized = kind.toLowerCase();
    const containerKinds = new Set(['workspace', 'project', 'repository', 'directory', 'package', 'module']);
    if (containerKinds.has(normalized)) {
      return 'container';
    }
    return 'component';
  }

  private getNodeLabel(kind: string, name: string): string {
    if (!kind) {
      return name;
    }
    if (kind.toLowerCase() === name.toLowerCase()) {
      return kind;
    }
    return `${kind}: ${name}`;
  }
}
