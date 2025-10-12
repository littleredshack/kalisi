import { LayoutOrchestrator, LayoutRunOptions } from '../core/layout-orchestrator';
import { LayoutGraph, LayoutResult } from '../core/layout-contract';
import { registerDefaultLayoutEngines } from '../engine-registry';

interface LayoutWorkerRequest {
  canvasId: string;
  graph: LayoutGraph;
  options: LayoutRunOptions;
}

declare const self: DedicatedWorkerGlobalScope;

const orchestrator = registerDefaultLayoutEngines(new LayoutOrchestrator());

self.onmessage = event => {
  const payload = event.data as LayoutWorkerRequest;
  try {
    const resolvedEngine =
      payload.options.engineName ??
      orchestrator.getActiveEngineName(payload.canvasId) ??
      'containment-grid';

    orchestrator.setActiveEngine(payload.canvasId, resolvedEngine, payload.options.source ?? 'system');

    const result = orchestrator.runLayout(payload.canvasId, payload.graph, {
      ...payload.options,
      engineName: resolvedEngine
    });

    self.postMessage({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ error: message });
  }
};
