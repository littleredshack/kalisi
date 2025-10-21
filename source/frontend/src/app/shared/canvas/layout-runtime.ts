import { CanvasData } from './types';
import { LayoutOrchestrator, LayoutPriority, LayoutRunOptions } from '../layouts/core/layout-orchestrator';
import { registerDefaultLayoutEngines } from '../layouts/engine-registry';
import { canvasDataToLayoutGraph } from '../layouts/core/layout-graph-utils';
import { LayoutGraph, RawDataInput } from '../layouts/core/layout-contract';
import { GraphStore, GraphPresentationSnapshot } from '../graph/graph-store';
import { ViewPresetDescriptor } from '../graph/view-presets';
import { PresentationFrame, buildPresentationFrame } from '../render/presentation-frame';
import { CanvasEventBus, CanvasEventSource } from '../layouts/core/layout-events';
import { LayoutWorkerBridge } from '../layouts/async/layout-worker-bridge';
import { ensureRelativeNodeCoordinates } from './utils/relative-coordinates';
import { processRawDataToGraph, validateRawData } from '../layouts/utils/raw-data-processor';

export interface CanvasLayoutRuntimeConfig {
  readonly defaultEngine?: string;
  readonly runLayoutOnInit?: boolean;
  readonly useWorker?: boolean;
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

export class CanvasLayoutRuntime {
  private readonly orchestrator: LayoutOrchestrator;
  private readonly canvasId: string;
  private readonly store: GraphStore;
  private canvasData: CanvasData;
  private readonly eventBus: CanvasEventBus;
  private frame: PresentationFrame | null = null;
  private readonly workerBridge: LayoutWorkerBridge;
  private lensId: string | undefined;
  private readonly defaultEngine: string;
  private viewConfig: RuntimeViewConfig;

  constructor(canvasId: string, initialData: CanvasData, config: CanvasLayoutRuntimeConfig = {}) {
    this.canvasId = canvasId;
    this.orchestrator = registerDefaultLayoutEngines(new LayoutOrchestrator());
    this.workerBridge = new LayoutWorkerBridge(this.orchestrator, { useWorker: config.useWorker });
    const initialGraph = canvasDataToLayoutGraph(initialData);
    this.store = new GraphStore(initialGraph);

    // Store default engine to check if coordinate normalization should be skipped
    this.defaultEngine = config.defaultEngine ?? this.inferEngineFromData(initialData);

    // Initialize view config with defaults
    this.viewConfig = {
      containmentMode: 'containers',
      layoutMode: 'grid',
      edgeRouting: 'orthogonal'
    };

    // Skip coordinate normalization for runtime engines that output correctly positioned nodes
    const isRuntimeEngine = this.isRuntimeEngine(this.defaultEngine);
    if (!isRuntimeEngine) {
      ensureRelativeNodeCoordinates(initialData.nodes, 0, 0);
    }

    // Store reference directly - no deep copying to avoid stale reference issues
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
    return { ...this.viewConfig };
  }

  setViewConfig(config: Partial<RuntimeViewConfig>): void {
    this.viewConfig = {
      ...this.viewConfig,
      ...config
    };
  }

  computePresentation(preset: ViewPresetDescriptor): GraphPresentationSnapshot {
    return this.store.computePresentation(preset);
  }

  setCanvasData(data: CanvasData, runLayout = false, source: CanvasEventSource = 'system'): void {
    // Store reference directly - no deep copying to avoid stale reference issues
    this.canvasData = data;

    // Skip coordinate normalization for runtime engines that output correctly positioned nodes
    if (!this.isRuntimeEngine(this.defaultEngine)) {
      ensureRelativeNodeCoordinates(this.canvasData.nodes, 0, 0);
    }
    const graph = canvasDataToLayoutGraph(this.canvasData, this.store.current.version + 1);
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

    if (runLayout) {
      this.runLayout({ reason: 'data-update', source });
    }
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

    // Update store with processed graph
    this.store.replace({
      ...graph,
      metadata: {
        ...graph.metadata,
        layoutVersion: this.store.current.version + 1
      }
    });

    // Build initial presentation frame
    this.frame = {
      version: this.store.current.version,
      camera: undefined,
      canvasData: this.canvasData,
      lastResult: {
        graph: this.store.current.graph,
        camera: undefined,
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

    // Pass viewConfig as engineOptions so layout engine can respond to config
    const engineOptions = {
      ...this.viewConfig,
      ...(options.engineOptions ?? {})
    };

    const result = await this.workerBridge.run(this.canvasId, this.store.current.graph, {
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

    // Set rendererId based on containmentMode
    if (this.frame) {
      const rendererId = this.viewConfig.containmentMode === 'containers'
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
}
