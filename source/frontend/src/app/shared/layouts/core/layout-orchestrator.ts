import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult } from './layout-contract';
import { CanvasEventBus, CanvasEventSource } from './layout-events';

interface CanvasLayoutContext {
  activeEngineName: string | null;
  readonly eventBus: CanvasEventBus;
  lastGraph: LayoutGraph | null;
  lastResult: LayoutResult | null;
}

export interface LayoutRunOptions extends Partial<Omit<LayoutOptions, 'previousGraph' | 'timestamp'>> {
  readonly engineName?: string;
  readonly reason?: LayoutOptions['reason'];
  readonly timestamp?: number;
  readonly source?: CanvasEventSource;
}

export class LayoutOrchestrator {
  private readonly engines = new Map<string, LayoutEngine>();
  private readonly contexts = new Map<string, CanvasLayoutContext>();

  registerEngine(engine: LayoutEngine): void {
    if (this.engines.has(engine.name)) {
      console.warn(`[LayoutOrchestrator] Engine "${engine.name}" already registered, overriding.`);
    }
    this.engines.set(engine.name, engine);
  }

  unregisterEngine(engineName: string): void {
    this.engines.delete(engineName);
  }

  getRegisteredEngines(): ReadonlyArray<string> {
    return Array.from(this.engines.keys());
  }

  getEventBus(canvasId: string): CanvasEventBus {
    return this.ensureContext(canvasId).eventBus;
  }

  getActiveEngineName(canvasId: string): string | null {
    return this.ensureContext(canvasId).activeEngineName;
  }

  setActiveEngine(canvasId: string, engineName: string, source: CanvasEventSource = 'system'): void {
    const context = this.ensureContext(canvasId);
    if (context.activeEngineName === engineName) {
      return;
    }

    const engine = this.engines.get(engineName);
    if (!engine) {
      throw new Error(`[LayoutOrchestrator] Engine "${engineName}" is not registered`);
    }

    const previousEngine = context.activeEngineName;
    context.activeEngineName = engine.name;
    context.eventBus.emit({
      type: 'EngineSwitched',
      engineName: engine.name,
      previousEngineName: previousEngine ?? undefined,
      canvasId,
      source,
      timestamp: Date.now()
    });
  }

  runLayout(canvasId: string, graph: LayoutGraph, runOptions: LayoutRunOptions = {}): LayoutResult {
    const context = this.ensureContext(canvasId);
    const activeEngineName = runOptions.engineName ?? context.activeEngineName;
    if (!activeEngineName) {
      throw new Error(`[LayoutOrchestrator] No active engine set for canvas "${canvasId}"`);
    }

    const engine = this.engines.get(activeEngineName);
    if (!engine) {
      throw new Error(`[LayoutOrchestrator] Engine "${activeEngineName}" is not registered`);
    }

    const previousGraph = context.lastGraph;
    const timestamp = runOptions.timestamp ?? Date.now();
    const source = runOptions.source ?? 'system';

    context.eventBus.emit({
      type: 'LayoutRequested',
      engineName: engine.name,
      canvasId,
      source,
      timestamp,
      payload: runOptions.engineOptions
    });

    const options: LayoutOptions = {
      reason: runOptions.reason ?? 'data-update',
      viewport: runOptions.viewport,
      timestamp,
      previousGraph: previousGraph ?? undefined,
      engineOptions: runOptions.engineOptions
    };

    const result = engine.layout(graph, options);
    context.lastGraph = result.graph;
    context.lastResult = result;

    context.eventBus.emit({
      type: 'LayoutApplied',
      engineName: engine.name,
      canvasId,
      source,
      timestamp,
      result
    });

    return result;
  }

  private ensureContext(canvasId: string): CanvasLayoutContext {
    let context = this.contexts.get(canvasId);
    if (!context) {
      context = {
        activeEngineName: null,
        eventBus: new CanvasEventBus(),
        lastGraph: null,
        lastResult: null
      };
      this.contexts.set(canvasId, context);
    }
    return context;
  }
}
