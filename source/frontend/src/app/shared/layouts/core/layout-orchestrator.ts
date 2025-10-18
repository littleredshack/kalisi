import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult } from './layout-contract';
import { CanvasEventBus, CanvasEventSource } from './layout-events';

interface CanvasLayoutContext {
  activeEngineName: string | null;
  readonly eventBus: CanvasEventBus;
  lastGraph: LayoutGraph | null;
  lastResult: LayoutResult | null;
}

export type LayoutPriority = 'critical' | 'high' | 'normal' | 'low';

export interface LayoutRequestTelemetry {
  readonly enqueuedAt: number;
  readonly queueLength: number;
  readonly queueWaitMs: number;
  readonly priority: LayoutPriority;
}

export interface LayoutRunOptions extends Partial<Omit<LayoutOptions, 'previousGraph' | 'timestamp'>> {
  readonly engineName?: string;
  readonly reason?: LayoutOptions['reason'];
  readonly timestamp?: number;
  readonly source?: CanvasEventSource;
  readonly priority?: LayoutPriority;
  readonly telemetry?: LayoutRequestTelemetry;
}

interface PendingLayoutCommand {
  readonly id: number;
  readonly canvasId: string;
  readonly graph: LayoutGraph;
  readonly options: LayoutRunOptions;
  readonly priority: LayoutPriority;
  readonly enqueuedAt: number;
  resolve: (result: LayoutResult) => void;
  reject: (error: unknown) => void;
}

const PRIORITY_WEIGHT: Record<LayoutPriority, number> = {
  critical: 3,
  high: 2,
  normal: 1,
  low: 0
};

const now =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

export class LayoutOrchestrator {
  private readonly engines = new Map<string, LayoutEngine>();
  private readonly contexts = new Map<string, CanvasLayoutContext>();
  private readonly queues = new Map<string, PendingLayoutCommand[]>();
  private readonly activeCanvases = new Set<string>();
  private nextCommandId = 1;

  registerEngine(engine: LayoutEngine): void {
    if (this.engines.has(engine.name)) {
      console.warn(`[LayoutOrchestrator] Engine "${engine.name}" already registered; overriding.`);
    }
    this.engines.set(engine.name, engine);
  }

  unregisterEngine(engineName: string): void {
    this.engines.delete(engineName);
  }

  getRegisteredEngines(): ReadonlyArray<string> {
    return Array.from(this.engines.keys());
  }

  getEngine(engineName: string): LayoutEngine | undefined {
    return this.engines.get(engineName);
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

  scheduleLayout(canvasId: string, graph: LayoutGraph, options: LayoutRunOptions = {}): Promise<LayoutResult> {
    console.error('[LayoutOrchestrator] scheduleLayout() CALLED');
    const priority = options.priority ?? 'normal';
    return new Promise<LayoutResult>((resolve, reject) => {
      const command: PendingLayoutCommand = {
        id: this.nextCommandId++,
        canvasId,
        graph,
        options: {
          ...options,
          priority
        },
        priority,
        enqueuedAt: now(),
        resolve,
        reject
      };

      const queue = this.ensureQueue(canvasId);
      queue.push(command);
      queue.sort(this.compareCommands);
      this.dispatchNext(canvasId);
    });
  }

  runLayout(canvasId: string, graph: LayoutGraph, options: LayoutRunOptions = {}): LayoutResult {
    console.error('[LayoutOrchestrator] runLayout() CALLED');
    const context = this.ensureContext(canvasId);
    const engineName = options.engineName ?? context.activeEngineName;
    if (!engineName) {
      throw new Error(`[LayoutOrchestrator] No active engine set for canvas "${canvasId}"`);
    }

    const engine = this.engines.get(engineName);
    if (!engine) {
      throw new Error(`[LayoutOrchestrator] Engine "${engineName}" is not registered`);
    }

    const previousGraph = context.lastGraph;
    const timestamp = options.timestamp ?? Date.now();
    const source = options.source ?? 'system';

    const telemetry = options.telemetry;
    const payload: Record<string, unknown> | undefined = this.buildEventPayload(options, telemetry);

    context.eventBus.emit({
      type: 'LayoutRequested',
      engineName: engine.name,
      canvasId,
      source,
      timestamp,
      payload
    });

    const layoutOptions: LayoutOptions = {
      reason: options.reason ?? 'data-update',
      viewport: options.viewport,
      timestamp,
      previousGraph: previousGraph ?? undefined,
      engineOptions: options.engineOptions
    };

    const start = now();
    const result = engine.layout(graph, layoutOptions);
    const durationMs = now() - start;

    console.error('[LayoutOrchestrator] Engine returned, result.graph nodes:');
    Object.entries(result.graph.nodes).forEach(([id, node]) => {
      if (node.children.length > 0) {
        console.error(`[LayoutOrchestrator]   ${id}: geometry=(${node.geometry.x}, ${node.geometry.y})`);
      }
    });

    const metrics: Record<string, number> = {
      ...(result.diagnostics?.metrics ?? {})
    };

    if (telemetry) {
      metrics['queueWaitMs'] = telemetry.queueWaitMs;
      metrics['queueDepth'] = telemetry.queueLength;
      metrics['queuePriority'] = PRIORITY_WEIGHT[telemetry.priority];
    }

    const resultWithDiagnostics: LayoutResult = {
      graph: result.graph,  // Use the same reference - don't create a new wrapper yet
      camera: result.camera,
      diagnostics: {
        ...(result.diagnostics ?? {}),
        durationMs,
        metrics
      }
    };

    console.log('[LayoutOrchestrator] About to store in context, resultWithDiagnostics.graph nodes:');
    Object.entries(resultWithDiagnostics.graph.nodes).forEach(([id, node]) => {
      if (node.children.length > 0) {
        console.log(`[LayoutOrchestrator]   ${id}: geometry=(${node.geometry.x}, ${node.geometry.y})`);
      }
    });

    context.lastGraph = resultWithDiagnostics.graph;
    context.lastResult = resultWithDiagnostics;

    console.log('[LayoutOrchestrator] Stored in context, about to return');
    Object.entries(resultWithDiagnostics.graph.nodes).forEach(([id, node]) => {
      if (node.children.length > 0) {
        console.log(`[LayoutOrchestrator]   ${id}: geometry=(${node.geometry.x}, ${node.geometry.y})`);
      }
    });

    context.eventBus.emit({
      type: 'LayoutApplied',
      engineName: engine.name,
      canvasId,
      source,
      timestamp,
      result: resultWithDiagnostics
    });

    return resultWithDiagnostics;
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

  private ensureQueue(canvasId: string): PendingLayoutCommand[] {
    let queue = this.queues.get(canvasId);
    if (!queue) {
      queue = [];
      this.queues.set(canvasId, queue);
    }
    return queue;
  }

  private dispatchNext(canvasId: string): void {
    if (this.activeCanvases.has(canvasId)) {
      return;
    }

    const queue = this.queues.get(canvasId);
    if (!queue || queue.length === 0) {
      return;
    }

    queue.sort(this.compareCommands);
    const command = queue.shift();
    if (!command) {
      return;
    }

    this.activeCanvases.add(canvasId);

    const telemetry: LayoutRequestTelemetry = {
      enqueuedAt: command.enqueuedAt,
      queueLength: queue.length,
      queueWaitMs: Math.max(0, now() - command.enqueuedAt),
      priority: command.priority
    };

    Promise.resolve()
      .then(() => this.runLayout(command.canvasId, command.graph, { ...command.options, telemetry }))
      .then(command.resolve)
      .catch(command.reject)
      .finally(() => {
        this.activeCanvases.delete(canvasId);
        if (!queue.length) {
          this.queues.delete(canvasId);
        }
        this.dispatchNext(canvasId);
      });
  }

  private compareCommands = (a: PendingLayoutCommand, b: PendingLayoutCommand): number => {
    const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return a.enqueuedAt - b.enqueuedAt;
  };

  private buildEventPayload(
    options: LayoutRunOptions,
    telemetry?: LayoutRequestTelemetry
  ): Record<string, unknown> | undefined {
    const payload: Record<string, unknown> = {
      ...(options.engineOptions ?? {})
    };

    if (options.priority) {
      payload['priority'] = options.priority;
    }

    if (telemetry) {
      payload['queueWaitMs'] = telemetry.queueWaitMs;
      payload['queueDepth'] = telemetry.queueLength;
      payload['enqueuedAt'] = telemetry.enqueuedAt;
    }

    return Object.keys(payload).length > 0 ? payload : undefined;
  }
}
