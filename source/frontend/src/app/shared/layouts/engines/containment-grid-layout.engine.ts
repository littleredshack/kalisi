import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult, RawDataInput } from '../core/layout-contract';
import { layoutGraphToHierarchical, hierarchicalToLayoutGraph } from '../core/layout-graph-utils';
import { HierarchicalNode } from '../../canvas/types';
import { LayoutPrimitives } from '../../canvas/layout-primitives';
import { processRawDataToGraph } from '../utils/raw-data-processor';

const CONTAINER_PADDING = 40;
const CHILD_SPACING = 24;

export class ContainmentGridLayoutEngine implements LayoutEngine {
  readonly name = 'containment-grid';

  readonly capabilities = {
    supportsIncremental: true,
    deterministic: true,
    canHandleRealtime: true
  } as const;

  layout(graph: LayoutGraph, _options: LayoutOptions): LayoutResult {
    const snapshot = layoutGraphToHierarchical(graph);
    const roots = snapshot.nodes.map(node => this.cloneNode(node));

    roots.forEach(root => this.layoutContainer(root));

    const updatedGraph = hierarchicalToLayoutGraph({
      nodes: roots,
      edges: snapshot.edges,
      metadata: snapshot.metadata
    });

    return {
      graph: updatedGraph
    };
  }

  /**
   * Process raw entities and relationships into a LayoutGraph
   * Implements the optional processRawData interface for direct data loading
   */
  processRawData(input: RawDataInput, _options?: LayoutOptions): LayoutGraph {
    // Use default transformation utility
    const graph = processRawDataToGraph(input);

    // Add containment-grid specific metadata
    const enhancedNodes: Record<string, typeof graph.nodes[string]> = {};
    Object.entries(graph.nodes).forEach(([nodeId, node]) => {
      enhancedNodes[nodeId] = {
        ...node,
        metadata: {
          ...node.metadata,
          displayMode: 'containment-grid'
        }
      };
    });

    return {
      ...graph,
      nodes: enhancedNodes
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

  private layoutContainer(node: HierarchicalNode): void {
    const defaults = LayoutPrimitives.getMinimumNodeSize(node.type);
    node.width = node.metadata?.['defaultWidth'] ?? node.width ?? defaults.width;
    node.height = node.metadata?.['defaultHeight'] ?? node.height ?? defaults.height;

    node.metadata = {
      ...(node.metadata ?? {}),
      displayMode: 'containment-grid',
      defaultWidth: node.width,
      defaultHeight: node.height
    };

    if (node.children.length === 0) {
      return;
    }

    node.children.forEach(child => {
      const childDefaults = LayoutPrimitives.getMinimumNodeSize(child.type);
      child.width = child.metadata?.['defaultWidth'] ?? child.width ?? childDefaults.width;
      child.height = child.metadata?.['defaultHeight'] ?? child.height ?? childDefaults.height;
    });

    const headerOffset = LayoutPrimitives.computeHeaderOffset(node);

    LayoutPrimitives.calculateGridPositions(
      node.children,
      node.width - CONTAINER_PADDING,
      node.height - CONTAINER_PADDING,
      CONTAINER_PADDING / 2,
      headerOffset + LayoutPrimitives.HEADER_GAP,
      CHILD_SPACING
    );

    LayoutPrimitives.resizeToFitChildren(node, CONTAINER_PADDING / 2, CONTAINER_PADDING / 2);

    node.children.forEach(child => this.layoutContainer(child));
  }
}
