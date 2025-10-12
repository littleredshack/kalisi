import { LayoutRunOptions } from '../core/layout-orchestrator';
import { LayoutGraph, LayoutResult } from '../core/layout-contract';

interface LayoutWorkerRequest {
  canvasId: string;
  graph: LayoutGraph;
  options: LayoutRunOptions;
}

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async event => {
  const payload = event.data as LayoutWorkerRequest;
  self.postMessage({ error: 'worker stub not implemented', payload });
};
