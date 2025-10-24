import { BehaviorSubject, Observable } from 'rxjs';
import { CanvasData, HierarchicalNode, Edge, Camera } from './types';
import { LayoutOrchestrator, LayoutPriority, LayoutRunOptions } from '../layouts/core/layout-orchestrator';
import { registerDefaultLayoutEngines } from '../layouts/engine-registry';
import { canvasDataToLayoutGraph, layoutGraphToHierarchical } from '../layouts/core/layout-graph-utils';
import { LayoutGraph, LayoutResult, RawDataInput } from '../layouts/core/layout-contract';
import { GraphStore, GraphPresentationSnapshot } from '../graph/graph-store';
import { ViewPresetDescriptor } from '../graph/view-presets';
import { CanvasEventBus, CanvasEventSource } from '../layouts/core/layout-events';
import { LayoutWorkerBridge } from '../layouts/async/layout-worker-bridge';
import { processRawDataToGraph, validateRawData } from '../layouts/utils/raw-data-processor';
import { GraphDataSet, graphDataSetToRawDataInput } from '../graph/graph-data-set';
import { NodeConfigManager, NodeLayoutConfig } from './node-config-manager';
import { ViewState, createDefaultViewState } from './state/view-state.model';

export interface CanvasLayoutRuntimeConfig {
  readonly defaultEngine?: string;
  readonly runLayoutOnInit?: boolean;
  readonly useWorker?: boolean;
  readonly initialViewConfig?: Partial<RuntimeViewConfig>;
}

export interface RuntimeViewConfig {
  readonly containmentMode: 'containers' | 'flat';
  readonly layoutMode: 'grid' | 'force';
  readonly edgeRouting: 'orthogonal' | 'straight';
}

export type RuntimeViewConfigPatch = Partial<RuntimeViewConfig>;

export class CanvasLayoutRuntime {
  private readonly orchestrator: LayoutOrchestrator;
  private readonly workerBridge: LayoutWorkerBridge;
  private readonly canvasId: string;
  private readonly store: GraphStore;
  private viewGraph: CanvasData;
  private readonly viewStateSubject: BehaviorSubject<ViewState>;
  readonly viewState$: Observable<ViewState>;
  private runtimeConfig: RuntimeViewConfig;
  private frame: LayoutResult | null = null;
  private lensId: string | undefined;
  private readonly defaultEngine: string;
  private readonly eventBus: CanvasEventBus;
  private graphDataSet: GraphDataSet | null = null;
  private readonly nodeConfigManager: NodeConfigManager;

  constructor(canvasId: string, initialData: CanvasData, config: CanvasLayoutRuntimeConfig = {}) {
    this.canvasId = canvasId;
    this.orchestrator = registerDefaultLayoutEngines(new LayoutOrchestrator());
    this.workerBridge = new LayoutWorkerBridge(this.orchestrator, { useWorker: config.useWorker });

    const defaultProfile: RuntimeViewConfig = {
      containmentMode: 'containers',
      layoutMode: 'grid',
      edgeRouting: 'orthogonal'
    };

    this.runtimeConfig = {
      ...defaultProfile,
      ...(config.initialViewConfig ?? {})
    };

    // Initialize ViewState as observable - single source of truth
    const initialViewState = createDefaultViewState(
      canvasId,
      'default-dataset', // Will be updated when GraphDataSet is loaded
      this.runtimeConfig
    );
    this.viewStateSubject = new BehaviorSubject<ViewState>(initialViewState);
    this.viewState$ = this.viewStateSubject.asObservable();

    // NodeConfigManager is a facade over ViewState
    this.nodeConfigManager = new NodeConfigManager(this.viewStateSubject);

    this.viewGraph = this.initialiseViewGraph(initialData);

    const initialGraph = canvasDataToLayoutGraph(this.viewGraph);
    this.store = new GraphStore(initialGraph);

    this.defaultEngine = config.defaultEngine ?? this.inferEngineFromData(this.viewGraph);
    this.orchestrator.setActiveEngine(canvasId, this.defaultEngine);
    this.eventBus = this.orchestrator.getEventBus(canvasId);

    // ViewState subscription will be set up by RuntimeCanvasComponent
    // to avoid circular dependencies and infinite loops

    if (config.runLayoutOnInit) {
      const result = this.orchestrator.runLayout(canvasId, initialGraph, {
        reason: 'initial',
        source: 'system'
      });
      this.store.update(result);
      this.applyLayoutResult(result);
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

  setActiveEngine(engineName: string, source: CanvasEventSource = 'user'): void {
    this.orchestrator.setActiveEngine(this.canvasId, this.normaliseEngineName(engineName), source);
  }

  getCanvasData(): CanvasData {
    return this.viewGraph;
  }

  getPresentationFrame(): LayoutResult | null {
    return this.frame;
  }

  getLayoutGraph(): LayoutGraph {
    return this.store.current.graph;
  }

  getViewConfig(): RuntimeViewConfig {
    return { ...this.runtimeConfig };
  }

  getNodeConfigManager(): NodeConfigManager {
    return this.nodeConfigManager;
  }

  getCurrentViewState(): ViewState {
    return this.viewStateSubject.value;
  }

  setNodeLayoutConfig(nodeId: string, config: NodeLayoutConfig): void {
    this.nodeConfigManager.setNodeConfig(nodeId, config);
  }

  removeNodeLayoutConfig(nodeId: string): void {
    this.nodeConfigManager.removeNodeConfig(nodeId);
  }

  setViewConfig(config: RuntimeViewConfigPatch): void {
    const previousMode = this.runtimeConfig.containmentMode;
    this.runtimeConfig = {
      ...this.runtimeConfig,
      ...config
    } as RuntimeViewConfig;

    // When containment mode changes, rebuild from original dataset to restore hierarchy
    // Flat mode destroys hierarchy (children = []), so we need to rebuild from source
    if (config.containmentMode && config.containmentMode !== previousMode && this.graphDataSet) {
      // Preserve style overrides before rebuilding
      const styleOverrides = this.extractStyleOverrides(this.viewGraph.nodes);

      const raw = graphDataSetToRawDataInput(this.graphDataSet);
      this.setRawDataInternal(raw, false, 'system');

      // Reapply preserved style overrides
      this.applyStyleOverrides(this.viewGraph.nodes, styleOverrides);
    }
  }

  setCanvasData(data: CanvasData, runLayout = false, source: CanvasEventSource = 'system'): void {
    this.viewGraph = data;
    if (runLayout) {
      void this.runLayout({ reason: 'data-update', source });
    }
  }

  setGraphDataSet(dataset: GraphDataSet, runLayout = false, source: CanvasEventSource = 'system'): void {
    this.graphDataSet = dataset;
    const raw = graphDataSetToRawDataInput(dataset);
    this.setRawDataInternal(raw, runLayout, source);
  }

  getGraphDataSet(): GraphDataSet | null {
    return this.graphDataSet;
  }

  setRawData(input: RawDataInput, runLayout = true, source: CanvasEventSource = 'system'): void {
    this.graphDataSet = null;
    this.setRawDataInternal(input, runLayout, source);
  }

  setLens(lensId: string | undefined): void {
    this.lensId = lensId;
  }

  async runLayout(options: LayoutRunOptions = {}): Promise<CanvasData> {
    console.log('[LayoutRuntime] runLayout called, reason:', options.reason || 'unknown');
    console.log('[LayoutRuntime] Call stack:', new Error().stack?.split('\n').slice(1, 5).join('\n'));
    const preservedCamera = this.viewGraph?.camera;

    const nextVersion = this.store.current.version + 1;
    const baseGraph = canvasDataToLayoutGraph(this.viewGraph, nextVersion);
    this.store.replace(baseGraph);

    const normalisedEngine = options.engineName ? this.normaliseEngineName(options.engineName) : undefined;
    if (normalisedEngine) {
      this.orchestrator.setActiveEngine(this.canvasId, normalisedEngine, options.source ?? 'system');
    }

    const engineOptions = {
      ...(options.engineOptions ?? {}),
      containmentMode: this.runtimeConfig.containmentMode,
      layoutMode: this.runtimeConfig.layoutMode,
      edgeRouting: this.runtimeConfig.edgeRouting,
      nodeConfigManager: this.nodeConfigManager,
      graphDataSet: this.graphDataSet // Pass immutable source data
    };

    const result = await this.workerBridge.run(this.canvasId, baseGraph, {
      ...options,
      engineName: normalisedEngine,
      engineOptions,
      priority: this.resolvePriority(options)
    });

    this.store.update(result);
    this.applyLayoutResult(result, preservedCamera);
    return this.viewGraph;
  }

  switchEngine(engineName: string, source: CanvasEventSource = 'user'): Promise<CanvasData> {
    this.orchestrator.setActiveEngine(this.canvasId, this.normaliseEngineName(engineName), source);
    return this.runLayout({ reason: 'engine-switch', engineName, source });
  }

  computePresentation(preset: ViewPresetDescriptor): GraphPresentationSnapshot {
    return this.store.computePresentation(preset);
  }

  private setRawDataInternal(input: RawDataInput, runLayout: boolean, source: CanvasEventSource): void {
    const validation = validateRawData(input);
    if (!validation.valid) {
      console.error('[LayoutRuntime] Invalid raw data:', validation.errors);
      throw new Error(`Invalid raw data: ${validation.errors.join(', ')}`);
    }

    const graph = processRawDataToGraph(input);
    const snapshot = layoutGraphToHierarchical(graph);

    // Direct mutation - preserve camera, update structure
    const preservedCamera = this.viewGraph?.camera;
    this.viewGraph.nodes = snapshot.nodes;
    this.viewGraph.edges = snapshot.edges;
    this.viewGraph.originalEdges = snapshot.edges;
    this.viewGraph.camera = preservedCamera;
    this.viewGraph.metadata = snapshot.metadata;

    this.store.replace(graph);

    if (runLayout) {
      void this.runLayout({ reason: 'initial', source });
    }
  }

  private applyLayoutResult(result: LayoutResult, preservedCamera?: Camera): void {
    console.log('[LayoutRuntime] applyLayoutResult - OVERWRITING viewGraph.nodes');
    const snapshot = layoutGraphToHierarchical(result.graph);

    // Direct mutation - keep originalEdges in sync with latest layout outputs
    this.viewGraph.originalEdges = snapshot.edges;
    this.viewGraph.nodes = snapshot.nodes;
    this.viewGraph.edges = snapshot.edges;
    this.viewGraph.camera = preservedCamera ?? result.camera ?? this.viewGraph.camera;
    this.viewGraph.metadata = snapshot.metadata;

    // Debug: Check if we're overwriting flattened positions
    const flatNode = snapshot.nodes.find(n => n.metadata?.['perNodeFlattened']);
    if (flatNode) {
      const flatChildren = flatNode.metadata?.['flattenedChildren'] as any[] || [];
      console.log('[LayoutRuntime] After applyLayoutResult, flattened child positions:',
        flatChildren.map(c => ({ id: c.GUID || c.id, x: c.x, y: c.y })));
    }

    this.frame = result;
  }

  private initialiseViewGraph(data: CanvasData): CanvasData {
    const ensureOriginalEdges = data.originalEdges ?? data.edges;
    return {
      nodes: data.nodes,
      edges: data.edges,
      originalEdges: ensureOriginalEdges,
      camera: data.camera,
      metadata: data.metadata
    };
  }

  private inferEngineFromData(data: CanvasData): string {
    // Always use containment-runtime - it's the only engine
    return 'containment-runtime';
  }

  private normaliseEngineName(engineName: string): string {
    const key = engineName.trim().toLowerCase();
    // Only containment-runtime exists now
    if (key === 'containment-runtime' || key === 'containment-live' || key === 'runtime') {
      return 'containment-runtime';
    }
    // Default to containment-runtime
    return 'containment-runtime';
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

  private extractStyleOverrides(nodes: HierarchicalNode[]): Map<string, Record<string, unknown>> {
    const overrides = new Map<string, Record<string, unknown>>();

    const collect = (nodeList: HierarchicalNode[]) => {
      nodeList.forEach(node => {
        const guid = node.GUID ?? node.id;
        if (guid && node.metadata?.['styleOverrides']) {
          overrides.set(guid, node.metadata['styleOverrides'] as Record<string, unknown>);
        }
        if (node.children) {
          collect(node.children);
        }
      });
    };

    collect(nodes);
    return overrides;
  }

  private applyStyleOverrides(nodes: HierarchicalNode[], overrides: Map<string, Record<string, unknown>>): void {
    const apply = (nodeList: HierarchicalNode[]) => {
      nodeList.forEach(node => {
        const guid = node.GUID ?? node.id;
        if (guid && overrides.has(guid)) {
          if (!node.metadata) {
            node.metadata = {};
          }
          node.metadata['styleOverrides'] = overrides.get(guid);

          // Apply overrides to node style
          const styleOverrides = overrides.get(guid) as any;
          if (styleOverrides.fill !== undefined) {
            node.style.fill = styleOverrides.fill;
          }
          if (styleOverrides.stroke !== undefined) {
            node.style.stroke = styleOverrides.stroke;
          }
          if (styleOverrides.icon !== undefined) {
            node.style.icon = styleOverrides.icon;
          }
        }
        if (node.children) {
          apply(node.children);
        }
      });
    };

    apply(nodes);
  }
}
