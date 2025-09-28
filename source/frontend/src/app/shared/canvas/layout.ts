import { HierarchicalNode, Edge, Camera } from './types';

// Layout result that can include optional camera positioning
export interface LayoutResult {
  nodes: HierarchicalNode[];
  camera?: Camera;
}

// Layout engine interface for positioning hierarchical nodes
export interface ILayoutEngine {
  /**
   * Apply layout to flat entity data and convert to positioned hierarchical structure
   * @param entities - Flat array of entities from Neo4j
   * @param relationships - Relationships defining hierarchy and connections
   * @returns Positioned hierarchical node tree ready for rendering, optionally with camera
   */
  applyLayout(entities: any[], relationships: any[]): LayoutResult;
  
  /**
   * Get layout engine name for debugging/logging
   */
  getName(): string;
}

// Base layout engine with common utilities
export abstract class BaseLayoutEngine implements ILayoutEngine {
  abstract applyLayout(entities: any[], relationships: any[]): LayoutResult;
  abstract getName(): string;

  // Common utility methods for all layout engines
  protected buildNodeMap(entities: any[]): Map<string, any> {
    const nodeMap = new Map<string, any>();
    entities.forEach(entity => {
      if (entity.id !== 'test-modular-root') { // Skip root entities
        nodeMap.set(entity.id, entity);
      }
    });
    return nodeMap;
  }

  protected getNodeColor(type: string): { fill: string, stroke: string } {
    const colors = {
      'container': { fill: '#1f2937', stroke: '#4b5563' },
      'node': { fill: '#22384f', stroke: '#5b7287' },
      'component': { fill: '#2d4f22', stroke: '#5b8729' }
    };
    return colors[type as keyof typeof colors] || colors.node;
  }

  protected createHierarchicalNode(entity: any, x: number, y: number, width: number, height: number): HierarchicalNode {
    const colors = this.getNodeColor(entity.properties?.type || 'node');
    
    return {
      id: entity.name,
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