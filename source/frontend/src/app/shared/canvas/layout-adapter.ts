import { ILayoutEngine, LayoutResult } from './layout';
import { HierarchicalNode } from './types';
import { ILayoutService, IDataTransformer } from '../../core/services/layout.interfaces';

/**
 * Adapter to bridge new composable services with existing ILayoutEngine interface
 * This allows gradual migration without breaking existing code
 */
export class LayoutEngineAdapter implements ILayoutEngine {
  constructor(
    private transformer: IDataTransformer,
    private layoutService: ILayoutService
  ) {}

  getName(): string {
    return this.layoutService.getName();
  }

  /**
   * Pass viewport bounds to layout service if it supports it
   */
  setViewportBounds(bounds: { width: number; height: number }): void {
    if ('setViewportBounds' in this.layoutService) {
      (this.layoutService as any).setViewportBounds(bounds);
    }
  }

  applyLayout(entities: any[], relationships: any[]): LayoutResult {
    // Step 1: Transform entities to layout nodes
    let layoutNodes = this.transformer.transformEntities(entities, relationships);

    // Step 2: Build hierarchy if this is a hierarchical layout
    if (this.layoutService.getName() === 'grid' || this.layoutService.getName() === 'hierarchical') {
      layoutNodes = this.transformer.buildHierarchy(layoutNodes, relationships);
    }

    // Step 3: Calculate positions using the layout service
    const positions = this.layoutService.calculatePositions(layoutNodes);

    // Step 4: Apply positions and convert back to HierarchicalNodes
    const hierarchicalNodes = this.transformer.applyPositions(layoutNodes, positions, entities);

    return {
      nodes: hierarchicalNodes,
      // Layout adapter doesn't calculate camera - leave undefined for default
      camera: undefined
    };
  }
}