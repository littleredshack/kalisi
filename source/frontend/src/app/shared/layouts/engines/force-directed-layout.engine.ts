import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult } from '../core/layout-contract';
import { applyForceDirectedLayout } from './force-directed-layout';

export class ForceDirectedLayoutEngine implements LayoutEngine {
  readonly name = 'force-directed';

  readonly capabilities = {
    supportsIncremental: false,
    deterministic: false,
    canHandleRealtime: false
  } as const;

  layout(graph: LayoutGraph, options: LayoutOptions): LayoutResult {
    // Convert LayoutGraph nodes/edges Records to arrays
    const nodes = Object.values(graph.nodes);
    const edges = Object.values(graph.edges);

    // Apply force-directed layout (modifies nodes in place)
    applyForceDirectedLayout(nodes as any, edges as any, {
      width: 1200,
      height: 800,
      iterations: 100
    });

    // Return the modified graph
    return { graph };
  }
}
