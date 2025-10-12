import { LayoutOrchestrator, LayoutRunOptions } from '../core/layout-orchestrator';
import { LayoutGraph, LayoutResult } from '../core/layout-contract';

export interface LayoutWorkerConfig {
  readonly useWorker?: boolean;
}

export class LayoutWorkerBridge {
  constructor(private readonly orchestrator: LayoutOrchestrator, private readonly config: LayoutWorkerConfig = {}) {}

  run(canvasId: string, graph: LayoutGraph, options: LayoutRunOptions): LayoutResult {
    if (!this.config.useWorker) {
      return this.orchestrator.runLayout(canvasId, graph, options);
    }

    // Placeholder for future worker integration.
    return this.orchestrator.runLayout(canvasId, graph, options);
  }
}
