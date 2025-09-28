import { HierarchicalNode, Edge } from '../../shared/canvas/types';

/**
 * Simple position interface for layout calculations
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Size interface for nodes
 */
export interface Size {
  width: number;
  height: number;
}

/**
 * Simplified node for layout calculations
 */
export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  children?: LayoutNode[];
  parentId?: string;
}

/**
 * Clean interface for layout services - just positioning
 */
export interface ILayoutService {
  /**
   * Calculate positions for nodes
   * @param nodes - Nodes to position
   * @returns Map of node ID to position
   */
  calculatePositions(nodes: LayoutNode[]): Map<string, Position>;

  /**
   * Get layout name for debugging
   */
  getName(): string;
}

/**
 * Interface for data transformation - separate from layout
 */
export interface IDataTransformer {
  /**
   * Transform Neo4j entities to layout nodes
   */
  transformEntities(entities: any[], relationships: any[]): LayoutNode[];

  /**
   * Build hierarchy from relationships
   */
  buildHierarchy(nodes: LayoutNode[], relationships: any[]): LayoutNode[];

  /**
   * Convert layout nodes to HierarchicalNodes with positions
   */
  applyPositions(nodes: LayoutNode[], positions: Map<string, Position>, entities?: any[]): HierarchicalNode[];
}