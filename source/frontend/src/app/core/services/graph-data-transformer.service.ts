import { Injectable } from '@angular/core';
import { IDataTransformer, LayoutNode, Position } from './layout.interfaces';
import { HierarchicalNode } from '../../shared/canvas/types';

/**
 * Service to transform Neo4j data to layout nodes and back
 * Extracted from BaseLayoutEngine and layout strategies
 */
@Injectable({
  providedIn: 'root'
})
export class GraphDataTransformerService implements IDataTransformer {

  transformEntities(entities: any[], relationships: any[]): LayoutNode[] {
    const nodes: LayoutNode[] = [];

    entities.forEach(entity => {
      // Use GUID for identification, skip test roots
      const entityGUID = entity.properties?.GUID || entity.GUID;
      if (!entityGUID || entityGUID === 'test-modular-root') return; // Skip root and invalid

      const nodeSize = this.getNodeSize(entity.properties?.type);
      nodes.push({
        id: entityGUID,  // Use GUID only
        width: nodeSize.width,
        height: nodeSize.height,
        children: []
      });
    });

    return nodes;
  }

  buildHierarchy(nodes: LayoutNode[], relationships: any[]): LayoutNode[] {
    const nodeMap = new Map<string, LayoutNode>();
    const rootNodes: LayoutNode[] = [];

    // Build map for quick lookup using GUID
    nodes.forEach(node => {
      nodeMap.set(node.id, node);  // node.id is already GUID from transformEntities
    });

    // Build hierarchy from CONTAINS relationships using GUID-based matching
    relationships.forEach(rel => {
      if (rel.type === 'CONTAINS') {
        // Use fromGUID/toGUID instead of source/target
        const parentGUID = rel.fromGUID;
        const childGUID = rel.toGUID;

        const parent = nodeMap.get(parentGUID);
        const child = nodeMap.get(childGUID);

        if (parent && child) {
          if (!parent.children) parent.children = [];
          parent.children.push(child);
          child.parentId = parent.id;  // parent.id is GUID
        }
      }
    });

    // Find root nodes (no parent)
    nodes.forEach(node => {
      if (!node.parentId) {
        rootNodes.push(node);
      }
    });

    return rootNodes.length > 0 ? rootNodes : nodes;
  }

  applyPositions(nodes: LayoutNode[], positions: Map<string, Position>, entities?: any[]): HierarchicalNode[] {
    const hierarchicalNodes: HierarchicalNode[] = [];
    const entityMap = new Map<string, any>();

    // Build entity map for metadata using GUID
    if (entities) {
      entities.forEach(entity => {
        const entityGUID = entity.properties?.GUID || entity.GUID || entity.id;
        entityMap.set(entityGUID, entity);
      });
    }

    // Convert layout nodes to hierarchical nodes with positions
    const convertNode = (layoutNode: LayoutNode): HierarchicalNode => {
      const position = positions.get(layoutNode.id) || { x: 0, y: 0 };
      const entity = entityMap.get(layoutNode.id);
      const colors = this.getNodeColor(entity?.properties?.type || 'node');

      // Get the original intended size for this node type, don't use layout-modified size
      const originalSize = this.getNodeSize(entity?.properties?.type || 'node');

      const hierarchicalNode: HierarchicalNode = {
        id: entity?.name || layoutNode.id,
        GUID: layoutNode.id,  // layoutNode.id is already GUID from transformEntities
        type: entity?.properties?.type || 'node',
        x: position.x,
        y: position.y,
        width: layoutNode.children && layoutNode.children.length > 0 ? layoutNode.width : originalSize.width,
        height: layoutNode.children && layoutNode.children.length > 0 ?
          Math.min(layoutNode.height, 400) : // Cap container height at 400px max
          originalSize.height,
        text: entity?.name || layoutNode.id,
        style: colors,
        selected: false,
        visible: true,
        collapsed: false,
        dragging: false,
        children: []
      };

      // Recursively convert children
      if (layoutNode.children && layoutNode.children.length > 0) {
        hierarchicalNode.children = layoutNode.children.map(child => convertNode(child));
      }

      return hierarchicalNode;
    };

    // Convert root nodes or all nodes if flat
    nodes.forEach(node => {
      if (!node.parentId) {
        hierarchicalNodes.push(convertNode(node));
      }
    });

    return hierarchicalNodes.length > 0 ? hierarchicalNodes : nodes.map(convertNode);
  }

  private getNodeSize(type: string): { width: number; height: number } {
    const sizes = {
      'container': { width: 200, height: 120 },
      'folder': { width: 200, height: 120 }, // Folder nodes should be container-sized
      'frontend': { width: 200, height: 120 }, // Frontend nodes should be container-sized
      'node': { width: 160, height: 80 },
      'component': { width: 120, height: 60 },
      'file': { width: 120, height: 60 }
    };
    return sizes[type as keyof typeof sizes] || sizes.node;
  }

  private getNodeColor(type: string): { fill: string; stroke: string } {
    const colors = {
      'container': { fill: '#1f2937', stroke: '#4b5563' },
      'node': { fill: '#22384f', stroke: '#5b7287' },
      'component': { fill: '#2d4f22', stroke: '#5b8729' }
    };
    return colors[type as keyof typeof colors] || colors.node;
  }
}