import { CanvasData, HierarchicalNode, Edge, NodeStyleSnapshot, EdgeStyleOverrides } from './types';
import { LayoutOrchestrator, LayoutPriority, LayoutRunOptions } from '../layouts/core/layout-orchestrator';
import { registerDefaultLayoutEngines } from '../layouts/engine-registry';
import { canvasDataToLayoutGraph, layoutGraphToHierarchical } from '../layouts/core/layout-graph-utils';
import { LayoutGraph, RawDataInput } from '../layouts/core/layout-contract';
import { GraphStore, GraphPresentationSnapshot } from '../graph/graph-store';
import { ViewPresetDescriptor } from '../graph/view-presets';
import { PresentationFrame, buildPresentationFrame } from '../render/presentation-frame';
import { CanvasEventBus, CanvasEventSource } from '../layouts/core/layout-events';
import { LayoutWorkerBridge } from '../layouts/async/layout-worker-bridge';
import { ensureRelativeNodeCoordinates } from './utils/relative-coordinates';
import { processRawDataToGraph, validateRawData } from '../layouts/utils/raw-data-processor';
import { OverlayResolver } from './overlay/overlay-resolver';
import { OverlayStore } from './overlay/overlay-store';
import { ResolvedConfig } from './node-config-manager';
import { GraphDataSet, graphDataSetToRawDataInput } from '../graph/graph-data-set';

export interface CanvasLayoutRuntimeConfig {
  readonly defaultEngine?: string;
  readonly runLayoutOnInit?: boolean;
  readonly useWorker?: boolean;
  readonly initialViewConfig?: Partial<RuntimeViewConfig>;
}

/**
 * Runtime view configuration for layout and rendering modes
 * Supports independent choice of layout algorithm and rendering style
 */
export interface RuntimeViewConfig {
  readonly containmentMode: 'containers' | 'flat';
  readonly layoutMode: 'grid' | 'force';
  readonly edgeRouting: 'orthogonal' | 'straight';
}

export type RuntimeViewConfigPatch = Partial<RuntimeViewConfig>;

interface RuntimeViewOverlay {
  global: RuntimeViewConfig;
  overrides: Map<string, RuntimeViewConfigPatch>;
}

interface SerializedViewOverlay {
  readonly global: RuntimeViewConfig;
  readonly overrides: ReadonlyArray<{ nodeId: string; profile: RuntimeViewConfig }>;
}

export class CanvasLayoutRuntime {
  private readonly orchestrator: LayoutOrchestrator;
  private readonly canvasId: string;
  private readonly store: GraphStore;
  private canvasData: CanvasData;
  private modelData: CanvasData;
  private canonicalModelData: CanvasData;
  private readonly viewOverlay: RuntimeViewOverlay;
  private readonly eventBus: CanvasEventBus;
  private frame: PresentationFrame | null = null;
  private readonly workerBridge: LayoutWorkerBridge;
  private lensId: string | undefined;
  private readonly defaultEngine: string;
  private overlayStore: OverlayStore | null = null;
  private overlayResolver: OverlayResolver | null = null;
  private graphDataSet: GraphDataSet | null = null;

  constructor(canvasId: string, initialData: CanvasData, config: CanvasLayoutRuntimeConfig = {}) {
    this.canvasId = canvasId;
    this.orchestrator = registerDefaultLayoutEngines(new LayoutOrchestrator());
    this.workerBridge = new LayoutWorkerBridge(this.orchestrator, { useWorker: config.useWorker });
    const initialGraph = canvasDataToLayoutGraph(initialData);
    this.store = new GraphStore(initialGraph);

    // Store default engine to check if coordinate normalization should be skipped
    this.defaultEngine = config.defaultEngine ?? this.inferEngineFromData(initialData);

    // Initialize view config with defaults and optional overrides
    const defaultProfile: RuntimeViewConfig = {
      containmentMode: 'containers',
      layoutMode: 'grid',
      edgeRouting: 'orthogonal'
    };
    const initialProfile: RuntimeViewConfig = {
      ...defaultProfile,
      ...(config.initialViewConfig ?? {})
    };
    this.viewOverlay = {
      global: initialProfile,
      overrides: new Map()
    };

    // Skip coordinate normalization for runtime engines that output correctly positioned nodes
    const isRuntimeEngine = this.isRuntimeEngine(this.defaultEngine);
    if (!isRuntimeEngine) {
      ensureRelativeNodeCoordinates(initialData.nodes, 0, 0);
    }

    // Store canonical model as an immutable clone
    this.canonicalModelData = initialData;
    this.modelData = initialData;
    this.canvasData = initialData;

    const initialEngine = this.normaliseEngineName(this.defaultEngine);
    this.orchestrator.setActiveEngine(canvasId, initialEngine);
    this.eventBus = this.orchestrator.getEventBus(canvasId);

    if (config.runLayoutOnInit) {
      const result = this.orchestrator.runLayout(canvasId, this.store.current.graph, {
        reason: 'initial',
        source: 'system'
      });
      this.store.update(result);
      this.frame = buildPresentationFrame(result, undefined, this.lensId);
      this.canvasData = this.frame.canvasData;
    }
  }

  getEventBus(): CanvasEventBus {
    return this.eventBus;
  }

  getAvailableEngines(): string[] {
    return [...this.orchestrator.getRegisteredEngines()];
  }

  getActiveEngineName(): string | null {
    return this.orchestrator.getActiveEngineName(this.canvasId);
  }

  getCanvasData(): CanvasData {
    return this.canvasData;
  }

  getPresentationFrame(): PresentationFrame | null {
    if (!this.frame) {
      return null;
    }
    return {
      version: this.frame.version,
      camera: this.frame.camera ? { ...this.frame.camera } : undefined,
      canvasData: this.frame.canvasData,
      lastResult: this.frame.lastResult,
      delta: this.frame.delta,
      lensId: this.frame.lensId,
      rendererId: this.frame.rendererId,
      metadata: this.frame.metadata ? { ...this.frame.metadata } : undefined
    };
  }

  getLayoutGraph(): LayoutGraph {
    return this.store.current.graph;
  }

  getViewConfig(): RuntimeViewConfig {
    return { ...this.viewOverlay.global };
  }

  setViewConfig(config: RuntimeViewConfigPatch): void {
    this.viewOverlay.global = {
      ...this.viewOverlay.global,
      ...config
    };
  }

  setNodeViewConfig(nodeId: string, patch: RuntimeViewConfigPatch | null): void {
    if (!nodeId) {
      return;
    }
    if (patch === null) {
      this.viewOverlay.overrides.delete(nodeId);
      return;
    }
    const existing = this.viewOverlay.overrides.get(nodeId) ?? {};
    this.viewOverlay.overrides.set(nodeId, {
      ...existing,
      ...patch
    });
  }

  computePresentation(preset: ViewPresetDescriptor): GraphPresentationSnapshot {
    return this.store.computePresentation(preset);
  }

  setCanvasData(data: CanvasData, runLayout = false, source: CanvasEventSource = 'system'): void {
    this.graphDataSet = null;
    this.canonicalModelData = data;
    this.modelData = data;
    this.canvasData = data;

    const baseGraph = canvasDataToLayoutGraph(this.modelData, this.store.current.version + 1);
    this.store.replace(baseGraph);
    this.frame = {
      version: this.store.current.version,
      camera: this.canvasData.camera,
      canvasData: this.canvasData,
      lastResult: {
        graph: baseGraph,
        camera: this.canvasData.camera,
        diagnostics: undefined
      },
      delta: {
        nodes: [],
        edges: []
      },
      lensId: this.lensId,
      metadata: this.canvasData.metadata ? { ...this.canvasData.metadata } : undefined
    };

    if (runLayout) {
      this.runLayout({ reason: 'data-update', source });
    }
  }

  /**
   * Promote the current canvas snapshot to become the canonical baseline.
   * Useful when interactive mutations (dragging, resizing) should persist
   * across subsequent layout runs.
   */
  commitCanvasData(): void {
    this.canonicalModelData = this.canvasData;
  }

  /**
   * Set data from raw entities and relationships
   * Uses the current engine's processRawData() if available,
   * otherwise falls back to default transformation
   */
  setGraphDataSet(dataset: GraphDataSet, runLayout = false, source: CanvasEventSource = 'system'): void {
    this.graphDataSet = dataset;
    const rawInput = graphDataSetToRawDataInput(dataset);
    this.setRawData(rawInput, runLayout, source);
  }

  getGraphDataSet(): GraphDataSet | null {
    return this.graphDataSet;
  }

  setRawData(input: RawDataInput, runLayout = true, source: CanvasEventSource = 'system'): void {
    // Validate input
    const validation = validateRawData(input);
    if (!validation.valid) {
      console.error('[LayoutRuntime] Invalid raw data:', validation.errors);
      throw new Error(`Invalid raw data: ${validation.errors.join(', ')}`);
    }

    const engineName = this.orchestrator.getActiveEngineName(this.canvasId);

    // Check if current engine supports raw data processing
    const engine = engineName ? this.orchestrator.getEngine(engineName) : null;

    let graph: LayoutGraph;

    if (engine && engine.processRawData) {
      // Use engine's custom processing
      graph = engine.processRawData(input);
    } else {
      // Use default transformation
      graph = processRawDataToGraph(input);
    }

    const snapshot = layoutGraphToHierarchical(graph);
    const canonical: CanvasData = {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      originalEdges: snapshot.edges,
      camera: this.canvasData?.camera ?? undefined,
      metadata: snapshot.metadata
    };
    this.canonicalModelData = canonical;
    this.modelData = canonical;
    this.canvasData = canonical;

    this.store.replace(graph);

    this.frame = {
      version: this.store.current.version,
      camera: this.canvasData.camera,
      canvasData: this.canvasData,
      lastResult: {
        graph,
        camera: this.canvasData.camera,
        diagnostics: undefined
      },
      delta: {
        nodes: [],
        edges: []
      },
      lensId: this.lensId,
      metadata: this.canvasData.metadata ? { ...this.canvasData.metadata } : undefined
    };

    // Run layout to position nodes
    if (runLayout) {
      this.runLayout({ reason: 'initial', source });
    }
  }

  setActiveEngine(engineName: string, source: CanvasEventSource = 'system'): void {
    this.orchestrator.setActiveEngine(this.canvasId, this.normaliseEngineName(engineName), source);
  }

  setLens(lensId: string | undefined): void {
    this.lensId = lensId;
    if (this.frame) {
      this.frame = {
        ...this.frame,
        lensId
      };
    }
  }

  async runLayout(options: LayoutRunOptions = {}): Promise<CanvasData> {
    const preservedCamera = this.canvasData?.camera ? { ...this.canvasData.camera } : undefined;
    this.modelData = this.canonicalModelData;
    if (preservedCamera) {
      this.modelData.camera = preservedCamera;
    }
    this.applyOverlayProfiles(this.modelData);

    const normalisedEngine = options.engineName ? this.normaliseEngineName(options.engineName) : undefined;
    if (normalisedEngine) {
      this.orchestrator.setActiveEngine(this.canvasId, normalisedEngine, options.source ?? 'system');
    }

    const activeProfile = this.resolveProfileForNode((options.engineOptions as any)?.targetNodeId);
    const engineOptions = {
      ...(options.engineOptions ?? {}),
      containmentMode: activeProfile.containmentMode,
      layoutMode: activeProfile.layoutMode,
      edgeRouting: activeProfile.edgeRouting,
      viewOverlay: this.serialiseOverlay()
    };

    const nextVersion = this.store.current.version + 1;
    const baseGraph = canvasDataToLayoutGraph(this.modelData, nextVersion);
    this.store.replace(baseGraph);
    const result = await this.workerBridge.run(this.canvasId, baseGraph, {
      ...options,
      engineName: normalisedEngine,
      engineOptions,
      priority: this.resolvePriority(options)
    });

    Object.entries(result.graph.nodes).forEach(([id, node]) => {
      if (node.children.length > 0) {
      }
    });

    this.store.update(result);

    Object.entries(result.graph.nodes).forEach(([id, node]) => {
      if (node.children.length > 0) {
      }
    });

    this.frame = buildPresentationFrame(result, this.frame ?? undefined, this.lensId);

    if (this.frame) {
      const rendererId = this.viewOverlay.global.containmentMode === 'containers'
        ? 'runtime-containment-renderer'
        : 'runtime-flat-renderer';
      this.frame = {
        ...this.frame,
        rendererId
      };
    }

    this.canvasData = this.frame.canvasData;
    return this.canvasData;
  }

  private inferEngineFromData(data: CanvasData): string {
    if (data.nodes.some(node => node.metadata?.['displayMode'] === 'tree')) {
      return 'tree';
    }
    if (data.nodes.some(node => node.metadata?.['displayMode'] === 'containment-runtime')) {
      return 'containment-runtime';
    }
    return 'containment-grid';
  }

  private normaliseEngineName(engineName: string): string {
    const key = engineName.trim().toLowerCase();
    switch (key) {
      case 'tree':
      case 'tree-table':
      case 'code-model-tree':
        return 'tree';
      case 'force':
      case 'force-directed':
      case 'flat-graph':
        return 'force-directed';
      case 'containment-runtime':
      case 'containment-live':
        return 'containment-runtime';
      case 'orthogonal':
      case 'containment-orthogonal':
        return 'orthogonal';
      case 'containment-grid':
      case 'grid':
      case 'hierarchical':
      case 'codebase-hierarchical':
      case 'containment':
        return 'containment-grid';
      default:
        if (key === 'tree' || key === 'orthogonal' || key === 'force-directed' || key === 'containment-grid') {
          return key;
        }
        return 'containment-grid';
    }
  }

  private resolvePriority(options: LayoutRunOptions): LayoutPriority {
    if (options.priority) {
      return options.priority;
    }

    if (options.reason === 'initial') {
      return 'critical';
    }

    if (options.reason === 'engine-switch' || options.reason === 'user-command' || options.reason === 'reflow') {
      return 'high';
    }

    if (options.source === 'user') {
      return 'high';
    }

    return 'normal';
  }

  private isRuntimeEngine(engineName: string): boolean {
    // Runtime engines that calculate positions correctly and should not have
    // their positions overwritten by ensureRelativeNodeCoordinates
    const runtimeEngines = new Set([
      'containment-runtime',
      'containment-grid',
      'orthogonal'
    ]);
    return runtimeEngines.has(engineName);
  }

  private resolveProfileForNode(nodeId?: string): RuntimeViewConfig {
    if (!nodeId) {
      return { ...this.viewOverlay.global };
    }
    const override = this.viewOverlay.overrides.get(nodeId);
    if (!override) {
      return { ...this.viewOverlay.global };
    }
    return {
      ...this.viewOverlay.global,
      ...override
    };
  }

  setOverlayStore(store: OverlayStore | null): void {
    this.overlayStore = store;
    this.overlayResolver = store ? new OverlayResolver(store) : null;
  }

  getOverlayResolver(): OverlayResolver | null {
    return this.overlayResolver;
  }

  private applyOverlayProfiles(data: CanvasData): void {
    if (!this.overlayResolver) {
      return;
    }

    const clearFlags = (node: HierarchicalNode): void => {
      if (node.metadata) {
        delete node.metadata['hiddenByCollapse'];
        delete node.metadata['badges'];
      }
      node.children?.forEach(child => clearFlags(child));
    };
    data.nodes.forEach(clearFlags);

    const traverse = (node: HierarchicalNode, ancestors: string[]): void => {
      const guid = node.GUID ?? node.id;
      if (!guid) {
        return;
      }

      const baseLayout = this.buildResolvedLayoutConfig(guid);
      const baseContainment = baseLayout.renderStyle.nodeMode === 'flat' ? 'flat' : 'containers';

      const profile = this.overlayResolver!.resolveNode({
        nodeId: guid,
        ancestorIds: ancestors,
        baseStyle: this.buildNodeStyleSnapshot(node),
        baseLayout,
        baseContainmentMode: baseContainment,
        baseVisibility: node.visible === false ? 'hidden' : 'visible',
        baseCollapseState: 'expanded'
      });

      node.metadata = {
        ...(node.metadata ?? {}),
        resolvedProfile: profile,
        collapseState: profile.collapseState
      };

      node.style = {
        ...node.style,
        fill: profile.style.fill,
        stroke: profile.style.stroke,
        icon: profile.style.icon
      };

      node.visible = profile.visibility !== 'hidden';
      node.collapsed = profile.collapseState === 'collapsed';

      if (profile.collapseState === 'collapsed') {
        markDescendantsHidden(node.children ?? []);
        const totalDescendants = countDescendants(node);
        if (totalDescendants > 0) {
          node.metadata['badges'] = [{ text: String(totalDescendants), color: 'rgba(30, 64, 175, 0.9)' }];
        }
      } else {
        showDescendants(node.children ?? []);
      }

      const nextAncestors = [...ancestors, guid];
      node.children?.forEach(child => traverse(child, nextAncestors));
    };

    data.nodes.forEach(root => traverse(root, []));

    data.edges?.forEach(edge => {
      const edgeProfile = this.overlayResolver!.resolveEdge({
        edgeId: edge.id,
        baseStyle: this.buildEdgeStyleSnapshot(edge),
        baseVisibility: edge.metadata?.['visible'] === false ? 'hidden' : 'visible'
      });

      edge.style = {
        ...edge.style,
        stroke: edgeProfile.style.stroke ?? edge.style?.stroke ?? '#6ea8fe',
        strokeWidth: edgeProfile.style.strokeWidth ?? edge.style?.strokeWidth ?? 2,
        strokeDashArray: edgeProfile.style.strokeDashArray !== undefined
          ? edgeProfile.style.strokeDashArray
          : edge.style?.strokeDashArray ?? null
      };

      if (edgeProfile.style.label !== undefined) {
        edge.label = edgeProfile.style.label ?? '';
      }

      edge.metadata = {
        ...(edge.metadata ?? {}),
        visible: edgeProfile.visibility !== 'hidden',
        labelVisible: edgeProfile.style.labelVisible !== undefined ? edgeProfile.style.labelVisible : edge.metadata?.['labelVisible']
      };
    });

    function markDescendantsHidden(children: HierarchicalNode[]): void {
      children.forEach(child => {
        child.metadata = {
          ...(child.metadata ?? {}),
          hiddenByCollapse: true
        };
        child.visible = false;
        markDescendantsHidden(child.children ?? []);
      });
    }

    function countDescendants(node: HierarchicalNode): number {
      if (!node.children || node.children.length === 0) {
        return 0;
      }
      return node.children.reduce((acc, child) => acc + 1 + countDescendants(child), 0);
    }

    function showDescendants(children: HierarchicalNode[]): void {
      children.forEach(child => {
        if (child.metadata && child.metadata['hiddenByCollapse']) {
          delete child.metadata['hiddenByCollapse'];
        }
        child.visible = child.visible !== false;
        child.visible = true;
        showDescendants(child.children ?? []);
      });
    }
  }

  private buildNodeStyleSnapshot(node: HierarchicalNode): NodeStyleSnapshot {
    return {
      fill: node.style.fill,
      stroke: node.style.stroke,
      icon: node.style.icon,
      shape: (node.metadata?.['shape'] as NodeStyleSnapshot['shape']) ?? 'rounded',
      cornerRadius: (node.metadata?.['cornerRadius'] as number | undefined) ?? 8,
      labelVisible: node.metadata?.['labelVisible'] !== false
    };
  }

  private buildEdgeStyleSnapshot(edge: Edge): EdgeStyleOverrides {
    return {
      stroke: edge.style?.stroke ?? '#6ea8fe',
      strokeWidth: edge.style?.strokeWidth ?? 2,
      strokeDashArray: edge.style?.strokeDashArray ?? undefined,
      label: edge.label,
      labelVisible: edge.metadata?.['labelVisible'] !== false
    };
  }

  private buildResolvedLayoutConfig(nodeId: string): ResolvedConfig {
    const runtimeConfig = this.resolveProfileForNode(nodeId);
    return {
      layoutStrategy: runtimeConfig.layoutMode === 'force' ? 'force' : 'grid',
      layoutOptions: {},
      renderStyle: {
        nodeMode: runtimeConfig.containmentMode === 'flat' ? 'flat' : 'container',
        edgeRouting: runtimeConfig.edgeRouting === 'straight' ? 'straight' : 'orthogonal',
        showContainsEdges: runtimeConfig.containmentMode === 'flat'
      }
    };
  }

  private serialiseOverlay(): SerializedViewOverlay {
    const overrides = Array.from(this.viewOverlay.overrides.entries()).map(([nodeId, patch]) => ({
      nodeId,
      profile: {
        ...this.viewOverlay.global,
        ...patch
      }
    }));
    return {
      global: { ...this.viewOverlay.global },
      overrides
    };
  }
}
