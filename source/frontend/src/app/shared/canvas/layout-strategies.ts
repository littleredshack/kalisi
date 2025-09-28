import { HierarchicalNode, Edge, CanvasData } from './types';
import { LayoutPrimitives } from './layout-primitives';

/**
 * Layout strategy interface for different data structuring approaches
 */
export interface ILayoutStrategy {
  processEntities(entities: any[], relationships: any[]): CanvasData;
  getName(): string;
}

/**
 * Hierarchical layout strategy - creates parent/child containment structure
 * Extracted logic from GridLayoutEngine
 */
export class HierarchicalLayoutStrategy implements ILayoutStrategy {
  
  getName(): string {
    return 'hierarchical';
  }

  processEntities(entities: any[], relationships: any[]): CanvasData {
    const nodeMap = new Map<string, HierarchicalNode>();
    const rootNodes: HierarchicalNode[] = [];

    // Step 1: Create all nodes with minimum sizes
    entities.forEach(entity => {
      if (entity.id === 'test-modular-root') return; // Skip root

      const nodeSize = LayoutPrimitives.getMinimumNodeSize(entity.properties?.type);
      const node = this.createHierarchicalNode(
        entity,
        0, 0, // Position will be calculated later
        nodeSize.width,
        nodeSize.height
      );

      nodeMap.set(entity.id, node);

      // Identify root level nodes (containers)
      if (entity.properties?.type === 'container') {
        rootNodes.push(node);
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

    // Step 3: Calculate sizes and positions bottom-up
    this.calculateHierarchicalLayout(rootNodes);

    // Step 4: Position root nodes
    LayoutPrimitives.positionRootNodes(rootNodes);

    // Create edges from non-CONTAINS relationships only (hierarchical uses CONTAINS for structure)
    const edges: Edge[] = [];
    relationships.forEach(rel => {
      if (rel.type !== 'CONTAINS') {
        // Use GUID fields for edge connections
        const fromGUID = rel.fromGUID || rel.source;
        const toGUID = rel.toGUID || rel.target;

        const fromNode = nodeMap.get(fromGUID);
        const toNode = nodeMap.get(toGUID);

        if (fromNode && toNode) {
          const edgeObj = {
            id: rel.id,
            from: fromNode.GUID,     // Use GUID not text
            to: toNode.GUID,         // Use GUID not text
            fromGUID: fromNode.GUID, // Explicit GUID reference
            toGUID: toNode.GUID,     // Explicit GUID reference
            label: rel.type,         // Show relationship type as label
            style: {
              stroke: '#6ea8fe',
              strokeWidth: 2,
              strokeDashArray: null
            },
            ...rel
          };
          edges.push(edgeObj);
        }
      }
    });

    return {
      nodes: rootNodes,
      edges,
      originalEdges: edges
    };
  }

  private buildNodeMap(entities: any[]): Map<string, HierarchicalNode> {
    const nodeMap = new Map<string, HierarchicalNode>();
    entities.forEach(entity => {
      if (entity.id !== 'test-modular-root') { // Skip root entities
        nodeMap.set(entity.id, entity);
      }
    });
    return nodeMap;
  }

  private createHierarchicalNode(entity: any, x: number, y: number, width: number, height: number): HierarchicalNode {
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

  private getNodeColor(type: string): { fill: string, stroke: string } {
    const colors = {
      'container': { fill: '#1f2937', stroke: '#4b5563' },
      'node': { fill: '#22384f', stroke: '#5b7287' },
      'component': { fill: '#2d4f22', stroke: '#5b8729' }
    };
    return colors[type as keyof typeof colors] || colors.node;
  }

  private calculateHierarchicalLayout(nodes: HierarchicalNode[]): void {
    nodes.forEach(node => {
      // Recursively layout children first
      if (node.children.length > 0) {
        this.calculateHierarchicalLayout(node.children);
        
        // Calculate grid layout for children using primitives
        LayoutPrimitives.calculateGridPositions(
          node.children,
          node.width,
          node.height
        );
        
        // Resize parent to fit children using primitives
        LayoutPrimitives.resizeToFitChildren(node);
      }
    });
  }
}

/**
 * Flat graph layout strategy - creates peer network structure
 * For future graph view implementation
 */
export class FlatGraphLayoutStrategy implements ILayoutStrategy {
  
  getName(): string {
    return 'flat-graph';
  }

  processEntities(entities: any[], relationships: any[]): CanvasData {
    const nodes: HierarchicalNode[] = [];
    
    // Convert all entities to peer nodes (no hierarchy)
    entities.forEach((entity, index) => {
      if (entity.id === 'test-modular-root') return; // Skip root
      
      const node = this.createFlatNode(entity);
      nodes.push(node);
    });

    // Apply force-directed positioning using primitives
    LayoutPrimitives.calculateForceDirectedPositions(nodes);

    // Create edges from ALL relationships (CONTAINS and LINK become connection lines)
    const edges: Edge[] = [];
    relationships.forEach(rel => {
      // Use GUID fields for edge connections
      const fromGUID = rel.fromGUID || rel.source;
      const toGUID = rel.toGUID || rel.target;

      const fromEntity = entities.find(e => e.id === fromGUID);
      const toEntity = entities.find(e => e.id === toGUID);

      if (fromEntity && toEntity) {
        const edgeObj = {
          id: rel.id,
          from: fromEntity.id,     // Use GUID not name
          to: toEntity.id,         // Use GUID not name
          fromGUID: fromEntity.id, // Explicit GUID reference
          toGUID: toEntity.id,     // Explicit GUID reference
          label: rel.type,         // Show relationship type as label
          style: {
            stroke: rel.type === 'CONTAINS' ? '#3b82f6' : '#6ea8fe',
            strokeWidth: 2,
            strokeDashArray: null  // Original edges should be solid, not dashed
          },
          ...rel
        };
        edges.push(edgeObj);
      }
    });

    return {
      nodes,
      edges,
      originalEdges: edges
    };
  }

  private createFlatNode(entity: any): HierarchicalNode {
    const colors = this.getNodeColor(entity.properties?.type || 'node');

    return {
      id: entity.name,
      GUID: entity.id, // CRITICAL: Must preserve GUID for edge matching
      type: entity.properties?.type || 'node',
      x: 0, // Will be positioned by force-directed algorithm
      y: 0,
      width: 120, // FORCE uniform size for all nodes in flat graph view
      height: 80,  // FORCE uniform size for all nodes in flat graph view
      text: entity.name,
      style: colors,
      selected: false,
      visible: true,
      collapsed: false,
      dragging: false,
      children: [] // Always empty in flat graph
    };
  }

  private getNodeColor(type: string): { fill: string, stroke: string } {
    const colors = {
      'container': { fill: '#1f2937', stroke: '#4b5563' },
      'node': { fill: '#22384f', stroke: '#5b7287' },
      'component': { fill: '#2d4f22', stroke: '#5b8729' }
    };
    return colors[type as keyof typeof colors] || colors.node;
  }
}