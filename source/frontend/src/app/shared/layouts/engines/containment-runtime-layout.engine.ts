import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult, RawDataInput } from '../core/layout-contract';
import { buildRuntimeGraphSnapshot, runtimeSnapshotToLayoutGraph } from '../utils/runtime-graph-normalizer';
import { layoutGraphToHierarchical, hierarchicalToLayoutGraph } from '../core/layout-graph-utils';
import { HierarchicalNode, Edge } from '../../canvas/types';
import { LayoutPrimitives } from '../../canvas/layout-primitives';
import { RuntimeViewConfig } from '../../canvas/layout-runtime';
import { flattenHierarchyWithEdges, applyFlatGridLayout, setAbsoluteWorldPositions } from '../helpers/flat-layout-helper';

interface ContainmentMetrics {
  readonly padding: number;
  readonly gap: number;
}

interface EngineRuntimeConfig {
  readonly containmentMode: 'containers' | 'flat';
  readonly layoutMode: 'grid' | 'force';
  readonly edgeRouting: 'orthogonal' | 'straight';
}

interface FlatLayoutFrame {
  readonly nodes: HierarchicalNode[];
  readonly rootIds: string[];
}

const DEFAULT_PADDING = 48;
const DEFAULT_GAP = 24;

// Containment edge types should NOT be rendered as lines - they define the hierarchy instead
const CONTAINMENT_EDGE_TYPES = new Set(['CONTAINS', 'HAS_CHILD', 'HAS_COMPONENT', 'PARENT_OF']);

export class ContainmentRuntimeLayoutEngine implements LayoutEngine {
  readonly name = 'containment-runtime';

  readonly capabilities = {
    supportsIncremental: true,
    deterministic: true,
    canHandleRealtime: true
  } as const;

  layout(graph: LayoutGraph, options: LayoutOptions): LayoutResult {
    const snapshot = layoutGraphToHierarchical(graph);

    // Extract runtime config from engineOptions
    const runtimeConfig = this.extractRuntimeConfig(options.engineOptions);

    const layoutMetrics: ContainmentMetrics = {
      padding: DEFAULT_PADDING,
      gap: DEFAULT_GAP
    };

    let processedNodes: HierarchicalNode[];
    let rootIds: string[] | undefined;

    if (runtimeConfig.containmentMode === 'flat') {
      // FLAT MODE: Flatten hierarchy (CONTAINS edges already exist in snapshot.edges from backend)
      const flatFrame = this.layoutFlatFromHierarchy(snapshot.nodes, layoutMetrics, runtimeConfig);
      processedNodes = flatFrame.nodes;
      rootIds = flatFrame.rootIds;
    } else {
      // CONTAINERS MODE: Process hierarchically
      processedNodes = snapshot.nodes.map(node => this.layoutContainer(node, layoutMetrics, runtimeConfig));
      processedNodes.forEach(root => this.updateWorldMetadata(root));
      rootIds = processedNodes
        .map(node => node.GUID ?? node.id)
        .filter((value): value is string => Boolean(value));
    }

    // Preserve all edges but toggle visibility via metadata so canonical data stays intact
    const edgesToRender = snapshot.edges.map(edge => {
      const existingMetadata = edge.metadata ?? {};
      const relationTypeSource =
        typeof existingMetadata['relationType'] === 'string'
          ? existingMetadata['relationType']
          : typeof edge.label === 'string' && edge.label.length > 0
            ? edge.label
            : '';
      const normalisedType = relationTypeSource.toUpperCase();
      const isContainmentEdge = normalisedType ? CONTAINMENT_EDGE_TYPES.has(normalisedType) : false;

      const metadata: Record<string, unknown> = {
        ...existingMetadata
      };

      if (!metadata['relationType'] && relationTypeSource) {
        metadata['relationType'] = relationTypeSource;
      }

      if (isContainmentEdge) {
        metadata['visible'] = runtimeConfig.containmentMode !== 'containers';
      } else if (metadata['visible'] === undefined) {
        metadata['visible'] = true;
      }

      return {
        ...edge,
        metadata
      };
    });

    const routedEdges = this.computeEdgeWaypoints(processedNodes, edgesToRender, runtimeConfig);


    const resolvedRootIds = rootIds && rootIds.length > 0
      ? Array.from(new Set(rootIds))
      : processedNodes
          .map(node => node.GUID ?? node.id)
          .filter((value): value is string => Boolean(value));

    const updatedGraph = hierarchicalToLayoutGraph({
      nodes: processedNodes,
      edges: routedEdges,
      metadata: {
        ...snapshot.metadata,
        layoutVersion: (graph.metadata.layoutVersion ?? 0) + 1,
        displayMode: runtimeConfig.containmentMode === 'flat' ? 'runtime-flat' : 'containment-runtime',
        rootIds: resolvedRootIds
      }
    });
    const diagnosticMetrics: Record<string, number> = {
      nodeCount: processedNodes.length,
      edgeCount: routedEdges.length
    };
    if (typeof options.timestamp === 'number') {
      diagnosticMetrics['runtimeMs'] = Math.max(0, Date.now() - options.timestamp);
    }

    return {
      graph: updatedGraph,
      diagnostics: {
        metrics: diagnosticMetrics
      }
    };
  }

  processRawData(input: RawDataInput): LayoutGraph {
    const runtimeSnapshot = buildRuntimeGraphSnapshot(input);
    return runtimeSnapshotToLayoutGraph(runtimeSnapshot);
  }

  private extractRuntimeConfig(engineOptions?: Readonly<Record<string, unknown>>): EngineRuntimeConfig {
    // Default config if not provided
    const defaults: EngineRuntimeConfig = {
      containmentMode: 'containers',
      layoutMode: 'grid',
      edgeRouting: 'orthogonal'
    };

    if (!engineOptions) {
      return defaults;
    }

    return {
      containmentMode: (engineOptions['containmentMode'] as 'containers' | 'flat') ?? defaults.containmentMode,
      layoutMode: (engineOptions['layoutMode'] as 'grid' | 'force') ?? defaults.layoutMode,
      edgeRouting: (engineOptions['edgeRouting'] as 'orthogonal' | 'straight') ?? defaults.edgeRouting
    };
  }

  private layoutContainer(node: HierarchicalNode, metrics: ContainmentMetrics, config: EngineRuntimeConfig): HierarchicalNode {
    const clone = this.ensureDefaults(this.cloneNode(node));
    if (!clone.children || clone.children.length === 0) {
      return clone;
    }

    const children = clone.children ?? [];

    // Recursively layout children first to get their sizes
    const laidOutChildren = children.map(child => this.layoutContainer(child, metrics, config));

    // Apply layout algorithm based on layoutMode
    if (config.layoutMode === 'grid') {
      this.applyAdaptiveGrid(clone, laidOutChildren, metrics);
    } else if (config.layoutMode === 'force') {
      // TODO: Implement force-directed layout delegation
      this.applyAdaptiveGrid(clone, laidOutChildren, metrics); // Fallback to grid for now
    }
    clone.children = laidOutChildren;

    // In 'containers' mode: resize parent to fit children (visual containment)
    // In 'flat' mode: skip resize, let nodes have independent sizes
    if (config.containmentMode === 'containers') {
      LayoutPrimitives.resizeToFitChildren(clone, metrics.padding, metrics.padding);
    }

    return clone;
  }

  private ensureDefaults(node: HierarchicalNode): HierarchicalNode {
    const defaults = LayoutPrimitives.getMinimumNodeSize(node.type);
    node.width = Number.isFinite(node.width) ? node.width : defaults.width;
    node.height = Number.isFinite(node.height) ? node.height : defaults.height;
    node.metadata = {
      ...(node.metadata ?? {}),
      defaultWidth: node.width,
      defaultHeight: node.height,
      displayMode: 'containment-runtime'
    };
    return node;
  }

  private applyAdaptiveGrid(parent: HierarchicalNode, children: HierarchicalNode[], metrics: ContainmentMetrics): void {
    if (children.length === 0) {
      return;
    }

    const padding = metrics.padding;
    const gap = metrics.gap;
    const headerOffset = LayoutPrimitives.computeHeaderOffset(parent);

    // Simple vertical stack layout - don't resize children, just position them
    let y = headerOffset + LayoutPrimitives.HEADER_GAP;

    children.forEach((child, index) => {
      child.x = padding;
      child.y = y;
      y += (child.height ?? 0) + (index < children.length - 1 ? gap : 0);
    });
  }

  private clampChildrenToParent(parent: HierarchicalNode, children: HierarchicalNode[], metrics: ContainmentMetrics): void {
    if (!children || children.length === 0) {
      return;
    }
    const headerOffset = LayoutPrimitives.computeHeaderOffset(parent);
    children.forEach(child => {
      LayoutPrimitives.clampChildWithinParent(child, parent, metrics.padding, headerOffset);
    });
  }

  private applyWorldRelativePositions(parent: HierarchicalNode, children: HierarchicalNode[]): void {
    if (!children || children.length === 0) {
      return;
    }
    const parentWorld = this.readWorldPosition(parent) ?? { x: parent.x ?? 0, y: parent.y ?? 0 };
    children.forEach(child => {
      const childWorld = this.readWorldPosition(child);
      if (childWorld) {
        child.x = childWorld.x - parentWorld.x;
        child.y = childWorld.y - parentWorld.y;
      } else {
        child.x = Number.isFinite(child.x) ? child.x : 0;
        child.y = Number.isFinite(child.y) ? child.y : 0;
      }
    });
  }

  private readWorldPosition(node: HierarchicalNode): { x: number; y: number } | null {
    const metadata = node.metadata;
    if (metadata && typeof metadata['worldPosition'] === 'object') {
      const value = metadata['worldPosition'] as { x?: number; y?: number };
      const x = Number((value?.x ?? Number.NaN));
      const y = Number((value?.y ?? Number.NaN));
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x, y };
      }
    }
    return null;
  }

  private computeEdgeWaypoints(nodes: HierarchicalNode[], edges: Edge[], config: EngineRuntimeConfig): Edge[] {
    if (!edges || edges.length === 0) {
      return edges;
    }

    const nodeMap = new Map<string, HierarchicalNode>();
    const worldPositions = new Map<string, { x: number; y: number }>();

    // Check if nodes are already flat (all at root level)
    const isFlat = config.containmentMode === 'flat' ||
                   nodes.every(node => !node.children || node.children.length === 0);

    const collect = (node: HierarchicalNode, offsetX = 0, offsetY = 0) => {
      const worldX = offsetX + (node.x ?? 0);
      const worldY = offsetY + (node.y ?? 0);
      nodeMap.set(node.GUID ?? node.id, node);
      worldPositions.set(node.GUID ?? node.id, { x: worldX, y: worldY });

      // Only recurse if not in flat mode
      if (!isFlat && node.children && node.children.length > 0) {
        node.children.forEach(child => collect(child, worldX, worldY));
      }
    };
    nodes.forEach(root => collect(root));

    return edges.map(edge => {
      const fromNode = nodeMap.get(edge.fromGUID ?? edge.from);
      const toNode = nodeMap.get(edge.toGUID ?? edge.to);

      if (!fromNode || !toNode) {
        return edge;
      }

      const fromWorld = worldPositions.get(fromNode.GUID ?? fromNode.id) ?? { x: 0, y: 0 };
      const toWorld = worldPositions.get(toNode.GUID ?? toNode.id) ?? { x: 0, y: 0 };
      const fromCenter = {
        x: fromWorld.x + (fromNode.width ?? 0) / 2,
        y: fromWorld.y + (fromNode.height ?? 0) / 2
      };

      const toCenter = {
        x: toWorld.x + (toNode.width ?? 0) / 2,
        y: toWorld.y + (toNode.height ?? 0) / 2
      };

      // Apply edge routing based on edgeRouting config
      let waypoints;
      if (config.edgeRouting === 'orthogonal') {
        const gridOffset = 24;
        waypoints = [
          { x: fromCenter.x, y: fromCenter.y },
          { x: fromCenter.x, y: toCenter.y - gridOffset },
          { x: toCenter.x, y: toCenter.y - gridOffset },
          { x: toCenter.x, y: toCenter.y }
        ];
      } else {
        // Straight routing - direct line
        waypoints = [
          { x: fromCenter.x, y: fromCenter.y },
          { x: toCenter.x, y: toCenter.y }
        ];
      }

      return {
        ...edge,
        waypoints
      };
    });
  }

  private updateWorldMetadata(node: HierarchicalNode, parentWorld?: { x: number; y: number }): void {
    const parentX = parentWorld?.x ?? 0;
    const parentY = parentWorld?.y ?? 0;
    const localX = Number(node.x ?? 0);
    const localY = Number(node.y ?? 0);
    const worldX = parentX + localX;
    const worldY = parentY + localY;
    node.metadata = {
      ...(node.metadata ?? {}),
      worldPosition: { x: worldX, y: worldY }
    };
    node.children?.forEach(child => this.updateWorldMetadata(child, { x: worldX, y: worldY }));
  }

  private cloneNode(node: HierarchicalNode): HierarchicalNode {
    return {
      ...node,
      style: node.style ? { ...node.style } : node.style,
      metadata: node.metadata ? { ...node.metadata } : undefined,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : []
    };
  }

  /**
   * Layout in FLAT mode: Flatten hierarchy and layout as grid
   * NOTE: CONTAINS edges come from original backend data in snapshot.edges, not generated here
   */
  private layoutFlatFromHierarchy(
    hierarchyRoots: HierarchicalNode[],
    metrics: ContainmentMetrics,
    config: EngineRuntimeConfig
  ): FlatLayoutFrame {
    // Flatten hierarchy (but don't generate edges - they already exist in original data)
    const flatResult = flattenHierarchyWithEdges(hierarchyRoots);

    // Ensure all nodes have proper defaults
    flatResult.nodes.forEach(node => this.ensureDefaults(node));

    // Apply grid layout to all flat nodes
    applyFlatGridLayout(flatResult.nodes, { gap: metrics.gap, padding: metrics.padding });

    // Set absolute world positions
    setAbsoluteWorldPositions(flatResult.nodes);

    const rootIds = flatResult.nodes
      .map(node => node.GUID ?? node.id)
      .filter((value): value is string => Boolean(value));

    return {
      nodes: flatResult.nodes,
      rootIds: Array.from(new Set(rootIds))
    };
  }
}
