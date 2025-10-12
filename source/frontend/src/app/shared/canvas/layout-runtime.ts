import { CanvasData } from './types';
import { LayoutOrchestrator, LayoutRunOptions } from '../layouts/core/layout-orchestrator';
import { registerDefaultLayoutEngines } from '../layouts/engine-registry';
import { canvasDataToLayoutGraph, layoutResultToCanvasData } from '../layouts/core/layout-graph-utils';
import { LayoutGraph } from '../layouts/core/layout-contract';
import { CanvasEventBus, CanvasEventSource } from '../layouts/core/layout-events';

export interface CanvasLayoutRuntimeConfig {
  readonly defaultEngine?: string;
  readonly runLayoutOnInit?: boolean;
}

export class CanvasLayoutRuntime {
  private readonly orchestrator: LayoutOrchestrator;
  private readonly canvasId: string;
  private layoutGraph: LayoutGraph;
  private canvasData: CanvasData;
  private readonly eventBus: CanvasEventBus;

  constructor(canvasId: string, initialData: CanvasData, config: CanvasLayoutRuntimeConfig = {}) {
    this.canvasId = canvasId;
    this.orchestrator = registerDefaultLayoutEngines(new LayoutOrchestrator());
    this.layoutGraph = canvasDataToLayoutGraph(initialData);
    this.canvasData = {
      ...initialData,
      nodes: initialData.nodes.map(node => ({ ...node })),
      edges: initialData.edges.map(edge => ({ ...edge })),
      originalEdges: initialData.originalEdges ?? initialData.edges.map(edge => ({ ...edge }))
    };

    const initialEngine = config.defaultEngine ?? this.inferEngineFromData(initialData);
    this.orchestrator.setActiveEngine(canvasId, initialEngine);
    this.eventBus = this.orchestrator.getEventBus(canvasId);

    if (config.runLayoutOnInit) {
      const result = this.orchestrator.runLayout(canvasId, this.layoutGraph, {
        reason: 'initial',
        source: 'system'
      });
      this.layoutGraph = result.graph;
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
    return this.layoutGraph;
  }

  setCanvasData(data: CanvasData, runLayout = false, source: CanvasEventSource = 'system'): void {
    this.canvasData = {
      ...data,
      nodes: data.nodes.map(node => ({ ...node })),
      edges: data.edges.map(edge => ({ ...edge })),
      originalEdges: data.originalEdges ?? data.edges.map(edge => ({ ...edge }))
    };
    this.layoutGraph = canvasDataToLayoutGraph(this.canvasData, (this.layoutGraph.metadata.layoutVersion ?? 0) + 1);

    if (runLayout) {
      this.runLayout({ reason: 'data-update', source });
    }
  }

  setActiveEngine(engineName: string, source: CanvasEventSource = 'system'): void {
    this.orchestrator.setActiveEngine(this.canvasId, engineName, source);
  }

  runLayout(options: LayoutRunOptions = {}): CanvasData {
    const result = this.orchestrator.runLayout(this.canvasId, this.layoutGraph, options);
    this.layoutGraph = result.graph;
    this.canvasData = layoutResultToCanvasData(result, this.canvasData);
    return this.canvasData;
  }

  private inferEngineFromData(data: CanvasData): string {
    return data.nodes.some(node => node.metadata?.['displayMode'] === 'tree') ? 'tree' : 'containment-grid';
  }
}
