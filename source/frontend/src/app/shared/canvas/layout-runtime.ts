import { CanvasData } from './types';
import { LayoutOrchestrator, LayoutRunOptions } from '../layouts/core/layout-orchestrator';
import { registerDefaultLayoutEngines } from '../layouts/engine-registry';
import { canvasDataToLayoutGraph, layoutResultToCanvasData } from '../layouts/core/layout-graph-utils';
import { LayoutGraph } from '../layouts/core/layout-contract';
import { GraphStore } from '../graph/graph-store';
import { CanvasEventBus, CanvasEventSource } from '../layouts/core/layout-events';

export interface CanvasLayoutRuntimeConfig {
  readonly defaultEngine?: string;
  readonly runLayoutOnInit?: boolean;
}

export class CanvasLayoutRuntime {
  private readonly orchestrator: LayoutOrchestrator;
  private readonly canvasId: string;
  private readonly store: GraphStore;
  private canvasData: CanvasData;
  private readonly eventBus: CanvasEventBus;

  constructor(canvasId: string, initialData: CanvasData, config: CanvasLayoutRuntimeConfig = {}) {
    this.canvasId = canvasId;
    this.orchestrator = registerDefaultLayoutEngines(new LayoutOrchestrator());
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
      this.canvasData = layoutResultToCanvasData(result, initialData);
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

    if (runLayout) {
      this.runLayout({ reason: 'data-update', source });
    }
  }

  setActiveEngine(engineName: string, source: CanvasEventSource = 'system'): void {
    this.orchestrator.setActiveEngine(this.canvasId, this.normaliseEngineName(engineName), source);
  }

  runLayout(options: LayoutRunOptions = {}): CanvasData {
    const normalisedEngine = options.engineName ? this.normaliseEngineName(options.engineName) : undefined;
    if (normalisedEngine) {
      this.orchestrator.setActiveEngine(this.canvasId, normalisedEngine, options.source ?? 'system');
    }

    const result = this.orchestrator.runLayout(this.canvasId, this.store.current.graph, {
      ...options,
      engineName: normalisedEngine
    });
    this.store.update(result);
    this.canvasData = layoutResultToCanvasData(result, this.canvasData);
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
}
