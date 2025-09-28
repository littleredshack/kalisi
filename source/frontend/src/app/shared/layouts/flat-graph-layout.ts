import { BaseLayoutEngine, ILayoutEngine, LayoutResult } from '../canvas/layout';
import { HierarchicalNode } from '../canvas/types';
import { FlatGraphLayoutStrategy } from '../canvas/layout-strategies';

export class FlatGraphLayoutEngine extends BaseLayoutEngine {
  private layoutStrategy = new FlatGraphLayoutStrategy();

  getName(): string {
    return 'flat-graph';
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