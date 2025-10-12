import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult } from '../core/layout-contract';
import { layoutGraphToHierarchical, hierarchicalToLayoutGraph } from '../core/layout-graph-utils';
import { HierarchicalNode, Camera } from '../../canvas/types';
import { LayoutPrimitives } from '../../canvas/layout-primitives';

const DEFAULT_RADIUS = 350;

export class ForceLayoutEngine implements LayoutEngine {
  readonly name = 'force-directed';

  readonly capabilities = {
    supportsIncremental: true,
    deterministic: false,
    canHandleRealtime: true
  } as const;

  layout(graph: LayoutGraph, options: LayoutOptions): LayoutResult {
    const snapshot = layoutGraphToHierarchical(graph);
    const roots = snapshot.nodes.map(node => this.cloneNode(node));
    const flatNodes: HierarchicalNode[] = [];
    this.collectNodes(roots, flatNodes);

    LayoutPrimitives.calculateForceDirectedPositions(flatNodes, 0, 0, DEFAULT_RADIUS);
    flatNodes.forEach(node => {
      node.metadata = {
        ...(node.metadata ?? {}),
        displayMode: 'force-directed',
        defaultWidth: node.width,
        defaultHeight: node.height
      };
    });

    const updatedGraph = hierarchicalToLayoutGraph({
      nodes: roots,
      edges: snapshot.edges,
      metadata: snapshot.metadata
    });

    const camera: Camera | undefined = options.reason === 'initial' || options.reason === 'engine-switch'
      ? { x: -400, y: -300, zoom: 0.6 }
      : undefined;

    return {
      graph: updatedGraph,
      camera
    };
  }

  private cloneNode(node: HierarchicalNode): HierarchicalNode {
    return {
      ...node,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : [],
      metadata: node.metadata ? { ...node.metadata } : undefined,
      style: node.style ? { ...node.style } : node.style
    };
  }

  private collectNodes(nodes: HierarchicalNode[], acc: HierarchicalNode[]): void {
    nodes.forEach(node => {
      acc.push(node);
      if (node.children.length > 0) {
        this.collectNodes(node.children, acc);
      }
    });
  }
}
