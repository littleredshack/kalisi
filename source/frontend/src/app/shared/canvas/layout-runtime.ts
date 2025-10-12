import { CanvasData } from './types';
import { LayoutOrchestrator, LayoutRunOptions } from '../layouts/core/layout-orchestrator';
import { registerDefaultLayoutEngines } from '../layouts/engine-registry';
import { canvasDataToLayoutGraph } from '../layouts/core/layout-graph-utils';
import { LayoutGraph } from '../layouts/core/layout-contract';
import { GraphStore } from '../graph/graph-store';
import { PresentationFrame, buildPresentationFrame } from '../render/presentation-frame';
import { CanvasEventBus, CanvasEventSource } from '../layouts/core/layout-events';
import { LayoutWorkerBridge } from '../layouts/async/layout-worker-bridge';

export interface CanvasLayoutRuntimeConfig {
  readonly defaultEngine?: string;
  readonly runLayoutOnInit?: boolean;
  readonly useWorker?: boolean;
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

  constructor(canvasId: string, initialData: CanvasData, config: CanvasLayoutRuntimeConfig = {}) {
    this.canvasId = canvasId;
    this.orchestrator = registerDefaultLayoutEngines(new LayoutOrchestrator());
    this.workerBridge = new LayoutWorkerBridge(this.orchestrator, { useWorker: config.useWorker });
    const initialGraph = canvasDataToLayoutGraph(initialData);
    this.store = new GraphStore(initialGraph);
    this.canvasData = {
      ...initialData,
      nodes: initialData.nodes.map(node => ({ ...node })),
      edges: initialData.edges.map(edge => ({ ...edge })),
      originalEdges: initialData.originalEdges ?? initialData.edges.map(edge => ({ ...edge }))
    };

    const initialEngine = this.normaliseEngineName(config.defaultEngine ?? this.inferEngineFromData(initialData));
    this.orchestrator.setActiveEngine(canvasId, initialEngine);
    this.eventBus = this.orchestrator.getEventBus(canvasId);

    if (config.runLayoutOnInit) {
      const result = this.orchestrator.runLayout(canvasId, this.store.current.graph, {
        reason: 'initial',
        source: 'system'
      });
      this.store.update(result);
      this.frame = buildPresentationFrame(result, undefined, this.lensId);
      this.canvasData = this.cloneCanvasData(this.frame.canvasData);
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
    return this.cloneCanvasData(this.canvasData);
  }

  getPresentationFrame(): PresentationFrame | null {
    if (!this.frame) {
      return null;
    }
    return {
      version: this.frame.version,
      camera: this.frame.camera ? { ...this.frame.camera } : undefined,
      canvasData: this.cloneCanvasData(this.frame.canvasData),
      lastResult: this.frame.lastResult,
      delta: this.frame.delta
    };
  }

  getLayoutGraph(): LayoutGraph {
    return this.store.current.graph;
  }

  setCanvasData(data: CanvasData, runLayout = false, source: CanvasEventSource = 'system'): void {
    this.canvasData = {
      ...data,
      nodes: data.nodes.map(node => ({ ...node })),
      edges: data.edges.map(edge => ({ ...edge })),
      originalEdges: data.originalEdges ?? data.edges.map(edge => ({ ...edge }))
    };
    const graph = canvasDataToLayoutGraph(this.canvasData, this.store.current.version + 1);
    this.store.replace(graph);
    this.frame = {
      version: this.store.current.version,
      camera: this.canvasData.camera,
      canvasData: this.cloneCanvasData(this.canvasData),
      lastResult: {
        graph,
        camera: this.canvasData.camera,
        diagnostics: undefined
      },
      delta: {
        nodes: [],
        edges: []
      }
    };

    if (runLayout) {
      this.runLayout({ reason: 'data-update', source });
    }
  }

  setActiveEngine(engineName: string, source: CanvasEventSource = 'system'): void {
    this.orchestrator.setActiveEngine(this.canvasId, this.normaliseEngineName(engineName), source);
  }

  setLens(lensId: string | undefined): void {
    this.lensId = lensId;
  }

  async runLayout(options: LayoutRunOptions = {}): Promise<CanvasData> {
    const normalisedEngine = options.engineName ? this.normaliseEngineName(options.engineName) : undefined;
    if (normalisedEngine) {
      this.orchestrator.setActiveEngine(this.canvasId, normalisedEngine, options.source ?? 'system');
    }

    const result = await this.workerBridge.run(this.canvasId, this.store.current.graph, {
      ...options,
      engineName: normalisedEngine
    });
    this.store.update(result);
    this.frame = buildPresentationFrame(result, this.frame ?? undefined, this.lensId);
    this.canvasData = this.cloneCanvasData(this.frame.canvasData);
    return this.canvasData;
  }

  private inferEngineFromData(data: CanvasData): string {
    return data.nodes.some(node => node.metadata?.['displayMode'] === 'tree') ? 'tree' : 'containment-grid';
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

  private cloneCanvasData(data: CanvasData): CanvasData {
    const structured = (globalThis as unknown as { structuredClone?: <T>(input: T) => T }).structuredClone;
    if (typeof structured === 'function') {
      return structured(data);
    }
    return JSON.parse(JSON.stringify(data));
  }
}
