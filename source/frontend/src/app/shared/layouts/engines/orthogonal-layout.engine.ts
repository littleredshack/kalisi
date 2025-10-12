import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult, RawDataInput } from '../core/layout-contract';
import { layoutGraphToHierarchical, hierarchicalToLayoutGraph } from '../core/layout-graph-utils';
import { HierarchicalNode, Camera } from '../../canvas/types';
import { LayoutPrimitives } from '../../canvas/layout-primitives';
import { processRawDataToGraph } from '../utils/raw-data-processor';

const LAYER_HORIZONTAL_SPACING = 360;
const NODE_VERTICAL_SPACING = 40;
const LAYER_VERTICAL_PADDING = 140;

export class OrthogonalLayoutEngine implements LayoutEngine {
  readonly name = 'orthogonal';

  readonly capabilities = {
    supportsIncremental: true,
    deterministic: true,
    canHandleRealtime: true
  } as const;

  layout(graph: LayoutGraph, options: LayoutOptions): LayoutResult {
    const snapshot = layoutGraphToHierarchical(graph);
    const roots = snapshot.nodes.map(node => this.cloneNode(node));

    const layers = new Map<number, HierarchicalNode[]>();
    roots.forEach(root => this.collectLayers(root, 0, layers));

    const layerKeys = Array.from(layers.keys()).sort((a, b) => a - b);
    let currentY = 0;
    layerKeys.forEach(depth => {
      const nodes = layers.get(depth) ?? [];
      let layerCursorY = currentY;
      nodes.forEach(node => {
        const size = this.ensureNodeSize(node);
        node.x = depth * LAYER_HORIZONTAL_SPACING;
        node.y = layerCursorY;
        node.metadata = {
          ...(node.metadata ?? {}),
          displayMode: 'orthogonal',
          defaultWidth: size.width,
          defaultHeight: size.height
        };
        layerCursorY += size.height + NODE_VERTICAL_SPACING;
      });

      currentY = layerCursorY + LAYER_VERTICAL_PADDING;
    });

    this.alignParents(roots);
    const bounds = this.calculateAbsoluteBounds(roots);
    roots.forEach(root => this.convertAbsoluteToRelative(root, 0, 0));

    const updatedGraph = hierarchicalToLayoutGraph({
      nodes: roots,
      edges: snapshot.edges,
      metadata: snapshot.metadata
    });

    const camera: Camera | undefined = options.reason === 'initial' || options.reason === 'engine-switch'
      ? this.calculateCamera(bounds)
      : undefined;

    return {
      graph: updatedGraph,
      camera
    };
  }

  /**
   * Process raw entities and relationships into a LayoutGraph
   * Implements the optional processRawData interface for direct data loading
   */
  processRawData(input: RawDataInput, _options?: LayoutOptions): LayoutGraph {
    console.debug('[OrthogonalLayoutEngine] Processing raw data:', {
      entities: input.entities.length,
      relationships: input.relationships.length
    });

    // Use default transformation utility
    const graph = processRawDataToGraph(input);

    // Add orthogonal specific metadata
    const enhancedNodes: Record<string, typeof graph.nodes[string]> = {};
    Object.entries(graph.nodes).forEach(([nodeId, node]) => {
      enhancedNodes[nodeId] = {
        ...node,
        metadata: {
          ...node.metadata,
          displayMode: 'orthogonal'
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

  private collectLayers(node: HierarchicalNode, depth: number, layers: Map<number, HierarchicalNode[]>): void {
    const layer = layers.get(depth) ?? [];
    layer.push(node);
    layers.set(depth, layer);
    node.children.forEach(child => this.collectLayers(child, depth + 1, layers));
  }

  private ensureNodeSize(node: HierarchicalNode): { width: number; height: number } {
    const defaults = LayoutPrimitives.getMinimumNodeSize(node.type);
    if (!Number.isFinite(node.width) || node.width <= 0) {
      node.width = defaults.width;
    }
    if (!Number.isFinite(node.height) || node.height <= 0) {
      node.height = defaults.height;
    }
    return { width: node.width, height: node.height };
  }

  private alignParents(nodes: HierarchicalNode[]): void {
    nodes.forEach(node => {
      if (node.children.length > 0) {
        this.alignParents(node.children);
        const centre = this.computeChildrenCentre(node);
        node.y = Math.max(0, centre - node.height / 2);
      }
    });
  }

  private computeChildrenCentre(node: HierarchicalNode): number {
    if (node.children.length === 0) {
      return node.y + node.height / 2;
    }

    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    return (firstChild.y + firstChild.height / 2 + lastChild.y + lastChild.height / 2) / 2;
  }

  private calculateAbsoluteBounds(nodes: HierarchicalNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const visit = (nodeList: HierarchicalNode[], offsetX: number, offsetY: number): void => {
      nodeList.forEach(node => {
        const absX = offsetX + node.x;
        const absY = offsetY + node.y;
        minX = Math.min(minX, absX);
        minY = Math.min(minY, absY);
        maxX = Math.max(maxX, absX + node.width);
        maxY = Math.max(maxY, absY + node.height);
        if (node.children.length > 0) {
          visit(node.children, absX, absY);
        }
      });
    };

    visit(nodes, 0, 0);

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    return { minX, minY, maxX, maxY };
  }

  private calculateCamera(bounds: { minX: number; minY: number; maxX: number; maxY: number }): Camera {
    const padding = 200;
    return {
      x: bounds.minX - padding,
      y: Math.max(0, bounds.minY - padding),
      zoom: 0.65
    };
  }

  private convertAbsoluteToRelative(node: HierarchicalNode, parentX: number, parentY: number): void {
    const absX = node.x;
    const absY = node.y;
    node.x = absX - parentX;
    node.y = absY - parentY;
    node.children.forEach(child => this.convertAbsoluteToRelative(child, absX, absY));
  }
}
