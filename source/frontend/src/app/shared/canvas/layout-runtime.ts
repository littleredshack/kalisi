import { CanvasData, HierarchicalNode, Edge } from './types';
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
import { OverlayStore } from './overlay/overlay-store';
import { OverlayResolver } from './overlay/overlay-resolver';
import { ResolvedConfig } from './node-config-manager';
import { processRawDataToGraph, validateRawData } from '../layouts/utils/raw-data-processor';

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
  private readonly viewOverlay: RuntimeViewOverlay;
  private readonly eventBus: CanvasEventBus;
  private frame: PresentationFrame | null = null;
  private readonly workerBridge: LayoutWorkerBridge;
  private lensId: string | undefined;
  private readonly defaultEngine: string;
  private overlayStore: OverlayStore | null = null;
  private overlayResolver: OverlayResolver | null = null;

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
    this.modelData = this.cloneCanvasData(initialData);
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
    // Treat incoming data as canonical model (no deep copies)
    this.modelData = this.cloneCanvasData(data);
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
   * Apply a mutation function to nodes in the canonical model by GUID
   * Used to keep modelData in sync with runtime overrides without replacing hierarchy.
   */
  updateModelNodesById(nodeIds: ReadonlyArray<string>, mutator: (node: HierarchicalNode) => void): void {
    if (!nodeIds || nodeIds.length === 0) {
      return;
    }
    const targetIds = new Set(
      nodeIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    if (targetIds.size === 0) {
      return;
    }

    const applyMutator = (nodes: HierarchicalNode[]): void => {
      nodes.forEach(node => {
        const guid = node.GUID ?? node.id;
        if (guid && targetIds.has(guid)) {
          mutator(node);
        }
        if (node.children && node.children.length > 0) {
          applyMutator(node.children);
        }
      });
    };

    applyMutator(this.modelData.nodes);
  }

  /**
   * Set data from raw entities and relationships
   * Uses the current engine's processRawData() if available,
   * otherwise falls back to default transformation
   */
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
    const canonical = this.cloneCanvasData({
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      originalEdges: snapshot.edges,
      camera: this.canvasData?.camera ?? undefined,
      metadata: snapshot.metadata
    });
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

    const presentationOptions = this.overlayResolver ? {
      overlayResolver: this.overlayResolver,
      baseLayoutConfig: this.resolveBaseLayoutProfile(),
      baseContainmentMode: this.viewOverlay.global.containmentMode
    } : undefined;

    this.frame = buildPresentationFrame(result, this.frame ?? undefined, this.lensId, presentationOptions);

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

  private cloneCanvasData(data: CanvasData): CanvasData {
    const cloneNode = (node: HierarchicalNode): HierarchicalNode => ({
      ...node,
      metadata: node.metadata ? { ...node.metadata } : undefined,
      style: { ...(node.style ?? { fill: '#1f2937', stroke: '#4b5563' }) },
      children: node.children ? node.children.map(child => cloneNode(child)) : []
    });

    const cloneEdge = (edge: Edge): Edge => ({
      ...edge,
      metadata: edge.metadata ? { ...edge.metadata } : undefined,
      style: { ...(edge.style ?? { stroke: '#6ea8fe', strokeWidth: 2, strokeDashArray: null }) },
      waypoints: edge.waypoints ? edge.waypoints.map(point => ({ ...point })) : undefined
    });

    return {
      nodes: data.nodes ? data.nodes.map(node => cloneNode(node)) : [],
      edges: data.edges ? data.edges.map(edge => cloneEdge(edge)) : [],
      originalEdges: (data.originalEdges ?? data.edges ?? []).map(edge => cloneEdge(edge)),
      camera: data.camera ? { ...data.camera } : undefined,
      metadata: data.metadata ? { ...data.metadata } : undefined
    };
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

  setOverlayStore(store: OverlayStore | null): void {
    this.overlayStore = store;
    this.overlayResolver = store ? new OverlayResolver(store) : null;
  }

  getOverlayResolver(): OverlayResolver | null {
    return this.overlayResolver;
  }

  private resolveBaseLayoutProfile(): ResolvedConfig {
    const layoutMode = this.viewOverlay.global.layoutMode;
    const containmentMode = this.viewOverlay.global.containmentMode;
    const edgeRouting = this.viewOverlay.global.edgeRouting;

    return {
      layoutStrategy: layoutMode === 'force' ? 'force' : 'grid',
      layoutOptions: {},
      renderStyle: {
        nodeMode: containmentMode === 'flat' ? 'flat' : 'container',
        edgeRouting: edgeRouting === 'straight' ? 'straight' : 'orthogonal',
        showContainsEdges: containmentMode === 'flat'
      }
    };
  }
}
