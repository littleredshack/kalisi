import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult, RawDataInput } from '../core/layout-contract';
import { buildRuntimeGraphSnapshot, runtimeSnapshotToLayoutGraph } from '../utils/runtime-graph-normalizer';
import { layoutGraphToHierarchical, hierarchicalToLayoutGraph } from '../core/layout-graph-utils';
import { HierarchicalNode, Edge } from '../../canvas/types';
import { LayoutPrimitives } from '../../canvas/layout-primitives';
import { RuntimeViewConfig } from '../../canvas/layout-runtime';
import { flattenHierarchyWithEdges, applyFlatGridLayout, setAbsoluteWorldPositions } from '../helpers/flat-layout-helper';
import { NodeConfigManager } from '../../canvas/node-config-manager';

interface ContainmentMetrics {
  readonly padding: number;
  readonly gap: number;
}

interface EngineRuntimeConfig {
  readonly containmentMode: 'containers' | 'flat';
  readonly layoutMode: 'grid' | 'force' | 'tree';
  readonly edgeRouting: 'orthogonal' | 'straight';
}

interface FlatLayoutFrame {
  readonly nodes: HierarchicalNode[];
  readonly rootIds: string[];
  readonly containsEdges: Edge[];
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
    const hiddenByCollapse = new Set<string>();
    const collapsedNodes = new Set<string>();

    const collectHidden = (node: HierarchicalNode): void => {
      const guid = node.GUID ?? node.id;
      if (guid) {
        if (node.metadata?.['hiddenByCollapse']) {
          hiddenByCollapse.add(guid);
        }
        if (node.metadata?.['collapseState'] === 'collapsed') {
          collapsedNodes.add(guid);
        }
      }
      node.children?.forEach(child => collectHidden(child));
    };
    snapshot.nodes.forEach(collectHidden);

    // Extract runtime config from engineOptions
    const runtimeConfig = this.extractRuntimeConfig(options.engineOptions);
    const nodeConfigManager = options.engineOptions?.['nodeConfigManager'] as NodeConfigManager | undefined;

    const layoutMetrics: ContainmentMetrics = {
      padding: DEFAULT_PADDING,
      gap: DEFAULT_GAP
    };

    let processedNodes: HierarchicalNode[];
    let rootIds: string[] | undefined;

    let generatedContainsEdges: Edge[] = [];

    if (runtimeConfig.containmentMode === 'flat') {
      // FLAT MODE: Flatten hierarchy and generate CONTAINS edges from structure
      const visibleRoots = snapshot.nodes.filter(node => !hiddenByCollapse.has(node.GUID ?? node.id));
      const flatFrame = this.layoutFlatFromHierarchy(visibleRoots, layoutMetrics, runtimeConfig, hiddenByCollapse);
      processedNodes = flatFrame.nodes;
      rootIds = flatFrame.rootIds;
      generatedContainsEdges = flatFrame.containsEdges;
    } else {
      // CONTAINERS MODE: Process hierarchically (but collect per-node CONTAINS edges)
      const perNodeContainsEdges: Edge[] = [];
      processedNodes = snapshot.nodes
        .filter(node => !hiddenByCollapse.has(node.GUID ?? node.id))
        .map(node => this.layoutContainer(node, layoutMetrics, runtimeConfig, hiddenByCollapse, collapsedNodes, nodeConfigManager, perNodeContainsEdges));
      processedNodes.forEach(root => this.updateWorldMetadata(root));
      rootIds = processedNodes
        .map(node => node.GUID ?? node.id)
        .filter((value): value is string => Boolean(value));
      generatedContainsEdges = perNodeContainsEdges;
    }

    // Collect generated edges from flattened nodes' metadata
    const collectGeneratedEdges = (nodes: HierarchicalNode[]): Edge[] => {
      const collected: Edge[] = [];
      nodes.forEach(node => {
        const flattenedEdges = node.metadata?.['flattenedEdges'] as Edge[] | undefined;
        if (flattenedEdges) {
          collected.push(...flattenedEdges);
        }
        if (node.children) {
          collected.push(...collectGeneratedEdges(node.children));
        }
      });
      return collected;
    };
    const metadataGeneratedEdges = collectGeneratedEdges(processedNodes);

    // Merge original edges with generated CONTAINS edges
    const allEdges = [...snapshot.edges, ...generatedContainsEdges, ...metadataGeneratedEdges];

    const edgesToRender = allEdges.map(edge => {
      const existingMetadata = edge.metadata ?? {};
      const relationTypeSource =
        typeof existingMetadata['relationType'] === 'string'
          ? existingMetadata['relationType']
          : typeof edge.label === 'string' && edge.label.length > 0
            ? edge.label
            : '';
      const normalisedType = relationTypeSource.toUpperCase();
      const isContainmentEdge = normalisedType ? CONTAINMENT_EDGE_TYPES.has(normalisedType) : false;

      // CONTAINS edges are visible if:
      // - Global mode is 'flat', OR
      // - This is a generated edge from per-node flattening (has isGenerated metadata)
      const isGeneratedContainsEdge = existingMetadata['isGenerated'] === true;
      const shouldShowContainsEdge = runtimeConfig.containmentMode === 'flat' || isGeneratedContainsEdge;

      const metadata: Record<string, unknown> = {
        ...existingMetadata,
        relationType: existingMetadata['relationType'] ?? relationTypeSource,
        visible:
          (shouldShowContainsEdge || !isContainmentEdge) &&
          !hiddenByCollapse.has(edge.from) &&
          !hiddenByCollapse.has(edge.to)
      };

      return {
        ...edge,
        metadata
      };
    });

    const augmentedEdges = this.addInheritedEdges(edgesToRender, snapshot.nodes, hiddenByCollapse);

    const routedEdges = this.computeEdgeWaypoints(processedNodes, augmentedEdges, runtimeConfig);


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

  private layoutContainer(
    node: HierarchicalNode,
    metrics: ContainmentMetrics,
    config: EngineRuntimeConfig,
    hiddenByCollapse: Set<string>,
    collapsedNodes: Set<string>,
    nodeConfigManager?: NodeConfigManager,
    containsEdgeCollector?: Edge[]
  ): HierarchicalNode {
    // Early exits for simple cases
    if (!node.children || node.children.length === 0) {
      return this.ensureDefaults({ ...node, children: [] });
    }

    const guid = node.GUID ?? node.id;
    const isCollapsed = guid ? collapsedNodes.has(guid) : false;
    if (isCollapsed) {
      return this.ensureDefaults({ ...node, children: [] });
    }

    const visibleChildren = node.children.filter(child => !hiddenByCollapse.has(child.GUID ?? child.id));
    if (visibleChildren.length === 0) {
      return this.ensureDefaults({ ...node, children: [] });
    }

    // Resolve effective configuration for this node
    const effectiveConfig = this.resolveEffectiveConfiguration(node, config, nodeConfigManager);

    // Branch on containment mode: flat vs hierarchical
    if (effectiveConfig.containmentMode === 'flat') {
      return this.layoutNodeAsFlat(node, visibleChildren, metrics, hiddenByCollapse, containsEdgeCollector);
    } else {
      return this.layoutNodeAsHierarchical(
        node,
        visibleChildren,
        metrics,
        config,
        hiddenByCollapse,
        collapsedNodes,
        nodeConfigManager,
        containsEdgeCollector,
        effectiveConfig
      );
    }
  }

  /**
   * Resolve effective configuration for a node (global + per-node overrides)
   */
  private resolveEffectiveConfiguration(
    node: HierarchicalNode,
    globalConfig: EngineRuntimeConfig,
    nodeConfigManager?: NodeConfigManager
  ): { containmentMode: 'containers' | 'flat'; layoutMode: 'grid' | 'force' | 'tree' } {
    let containmentMode = globalConfig.containmentMode;
    let layoutMode = globalConfig.layoutMode;

    if (nodeConfigManager) {
      const guid = node.GUID ?? node.id;
      if (guid) {
        const resolved = nodeConfigManager.getResolvedConfig(node);

        // Override containment mode if specified
        if (resolved.renderStyle.nodeMode === 'flat') {
          containmentMode = 'flat';
        } else if (resolved.renderStyle.nodeMode === 'container' || resolved.renderStyle.nodeMode === 'compact') {
          containmentMode = 'containers';
        }

        // Override layout strategy if specified
        if (resolved.layoutStrategy !== 'manual') {
          layoutMode = resolved.layoutStrategy as 'grid' | 'force' | 'tree';
        }
      }
    }

    return { containmentMode, layoutMode };
  }

  /**
   * Layout node in FLAT mode - children become siblings with CONTAINS edges
   * NON-DESTRUCTIVE: Original hierarchy preserved in node.children
   * Flattened representation stored in metadata.flattenedChildren
   */
  private layoutNodeAsFlat(
    node: HierarchicalNode,
    visibleChildren: HierarchicalNode[],
    metrics: ContainmentMetrics,
    hiddenByCollapse: Set<string>,
    containsEdgeCollector?: Edge[]
  ): HierarchicalNode {
    // Flatten hierarchy and extract CONTAINS edges
    const flatResult = flattenHierarchyWithEdges(visibleChildren, hiddenByCollapse);

    // Apply grid layout to flattened nodes
    this.applyGridLayoutToNodes(flatResult.nodes, metrics);

    // Collect generated CONTAINS edges
    if (containsEdgeCollector) {
      containsEdgeCollector.push(...flatResult.containsEdges);
    }

    // CRITICAL: Keep original children intact, store flattened view in metadata
    const result = {
      ...node,
      children: node.children,  // ← PRESERVE original hierarchy
      metadata: {
        ...(node.metadata ?? {}),
        perNodeFlattened: true,
        flattenedChildren: flatResult.nodes,        // ← Visual transform
        flattenedEdges: flatResult.containsEdges    // ← Generated edges
      }
    };

    // Resize parent to fit flattened children
    LayoutPrimitives.resizeToFitChildren(result, metrics.padding, metrics.padding);

    return this.ensureDefaults(result);
  }

  /**
   * Layout node in HIERARCHICAL mode - children nested with containment
   */
  private layoutNodeAsHierarchical(
    node: HierarchicalNode,
    visibleChildren: HierarchicalNode[],
    metrics: ContainmentMetrics,
    globalConfig: EngineRuntimeConfig,
    hiddenByCollapse: Set<string>,
    collapsedNodes: Set<string>,
    nodeConfigManager: NodeConfigManager | undefined,
    containsEdgeCollector: Edge[] | undefined,
    effectiveConfig: { layoutMode: 'grid' | 'force' | 'tree' }
  ): HierarchicalNode {
    // Recursively layout children first
    const laidOutChildren = visibleChildren.map(child =>
      this.layoutContainer(child, metrics, globalConfig, hiddenByCollapse, collapsedNodes, nodeConfigManager, containsEdgeCollector)
    );

    // Create result with positioned children
    const result = {
      ...node,
      children: laidOutChildren
    };

    // Apply layout strategy to position children within parent
    this.applyLayoutStrategy(result, laidOutChildren, metrics, effectiveConfig.layoutMode);

    // Resize parent to fit children
    LayoutPrimitives.resizeToFitChildren(result, metrics.padding, metrics.padding);

    return this.ensureDefaults(result);
  }

  /**
   * Apply layout strategy to position children (strategy pattern entry point)
   */
  private applyLayoutStrategy(
    parent: HierarchicalNode,
    children: HierarchicalNode[],
    metrics: ContainmentMetrics,
    strategy: 'grid' | 'force' | 'tree'
  ): void {
    switch (strategy) {
      case 'grid':
        this.applyAdaptiveGrid(parent, children, metrics);
        break;
      case 'force':
        // TODO: Implement force-directed layout
        this.applyAdaptiveGrid(parent, children, metrics);
        break;
      case 'tree':
        // TODO: Implement tree layout
        this.applyAdaptiveGrid(parent, children, metrics);
        break;
      default:
        this.applyAdaptiveGrid(parent, children, metrics);
    }
  }

  /**
   * Apply grid layout to flat list of nodes
   */
  private applyGridLayoutToNodes(nodes: HierarchicalNode[], metrics: ContainmentMetrics): void {
    const cols = Math.ceil(Math.sqrt(nodes.length));
    let x = metrics.padding;
    let y = metrics.padding + 40; // Header offset

    nodes.forEach((node, idx) => {
      node.x = x;
      node.y = y;
      x += (node.width ?? 180) + metrics.gap;
      if ((idx + 1) % cols === 0) {
        x = metrics.padding;
        y += (node.height ?? 100) + metrics.gap;
      }
    });
  }

  private addInheritedEdges(
    edges: Edge[],
    hierarchyRoots: HierarchicalNode[],
    hiddenByCollapse: Set<string>
  ): Edge[] {
    const augmented = new Map<string, Edge>();
    edges.forEach(edge => augmented.set(edge.id, edge));

    const visibilityMap = this.buildVisibilityMap(hierarchyRoots, hiddenByCollapse);

    edges.forEach(edge => {
      const sourceInfo = visibilityMap.get(edge.from);
      const targetInfo = visibilityMap.get(edge.to);
      if (!sourceInfo || !targetInfo) {
        return;
      }

      if (sourceInfo.visible && targetInfo.visible) {
        return;
      }

      const finalSource = sourceInfo.visible ? edge.from : sourceInfo.visibleAncestor;
      const finalTarget = targetInfo.visible ? edge.to : targetInfo.visibleAncestor;

      if (!finalSource || !finalTarget || finalSource === finalTarget) {
        return;
      }

      const inheritedId = `inherited-${edge.id}-${finalSource}-${finalTarget}`;
      if (augmented.has(inheritedId)) {
        return;
      }

      augmented.set(inheritedId, {
        ...edge,
        id: inheritedId,
        from: finalSource,
        to: finalTarget,
        fromGUID: finalSource,
        toGUID: finalTarget,
        metadata: {
          ...(edge.metadata ?? {}),
          inherited: true,
          visible: true
        },
        style: {
          ...edge.style,
          stroke: '#1e3a8a',
          strokeWidth: Math.min(6, (edge.style?.strokeWidth ?? 2) + 1),
          strokeDashArray: [4, 4]
        }
      });
    });

    return Array.from(augmented.values());
  }

  private buildVisibilityMap(
    roots: HierarchicalNode[],
    hiddenByCollapse: Set<string>
  ): Map<string, { visible: boolean; visibleAncestor?: string }> {
    const parentMap = new Map<string, string | null>();

    const register = (node: HierarchicalNode, parentId: string | null): void => {
      const id = node.GUID ?? node.id;
      if (!id) {
        return;
      }
      parentMap.set(id, parentId);
      node.children?.forEach(child => register(child, id));
    };
    roots.forEach(root => register(root, null));

    const visibleSet = new Set<string>();
    parentMap.forEach((_parent, id) => {
      if (!hiddenByCollapse.has(id)) {
        visibleSet.add(id);
      }
    });

    const cache = new Map<string, { visible: boolean; visibleAncestor?: string }>();

    const resolve = (id: string): { visible: boolean; visibleAncestor?: string } => {
      if (cache.has(id)) {
        return cache.get(id)!;
      }

      if (visibleSet.has(id)) {
        const info = { visible: true, visibleAncestor: id };
        cache.set(id, info);
        return info;
      }

      const parentId = parentMap.get(id);
      if (!parentId) {
        const info = { visible: false, visibleAncestor: undefined };
        cache.set(id, info);
        return info;
      }

      const parentInfo = resolve(parentId);
      const info = { visible: false, visibleAncestor: parentInfo.visibleAncestor };
      cache.set(id, info);
      return info;
    };

    parentMap.forEach((_parent, id) => {
      resolve(id);
    });

    return cache;
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

  // cloneNode removed - using shallow spread only


  /**
   * Layout in FLAT mode: Flatten hierarchy and layout as grid
   * NOTE: CONTAINS edges come from original backend data in snapshot.edges, not generated here
   */
  private layoutFlatFromHierarchy(
    hierarchyRoots: HierarchicalNode[],
    metrics: ContainmentMetrics,
    config: EngineRuntimeConfig,
    hiddenByCollapse: Set<string>
  ): FlatLayoutFrame {
    // Flatten hierarchy (but don't generate edges - they already exist in original data)
    const flatResult = flattenHierarchyWithEdges(hierarchyRoots, hiddenByCollapse);

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
      rootIds: Array.from(new Set(rootIds)),
      containsEdges: flatResult.containsEdges
    };
  }
}
