import { BaseLayoutEngine, ILayoutEngine, LayoutResult } from '../canvas/layout';
import { HierarchicalNode } from '../canvas/types';
import { LayoutPrimitives } from '../canvas/layout-primitives';
import { HierarchicalLayoutStrategy } from '../canvas/layout-strategies';

export class GridLayoutEngine extends BaseLayoutEngine {
  private layoutStrategy = new HierarchicalLayoutStrategy();

  getName(): string {
    return 'grid';
  }

  applyLayout(entities: any[], relationships: any[]): LayoutResult {
    // Delegate to layout strategy using primitives
    const canvasData = this.layoutStrategy.processEntities(entities, relationships);
    return {
      nodes: canvasData.nodes,
      camera: canvasData.camera
    };
  }

}