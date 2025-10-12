import { LayoutOrchestrator, LayoutRunOptions } from '../core/layout-orchestrator';
import { LayoutGraph, LayoutResult } from '../core/layout-contract';

export interface LayoutWorkerConfig {
  readonly useWorker?: boolean;
}

export class LayoutWorkerBridge {
  private worker?: Worker;

  constructor(private readonly orchestrator: LayoutOrchestrator, private readonly config: LayoutWorkerConfig = {}) {
    if (this.config.useWorker && typeof Worker !== 'undefined') {
      this.worker = new Worker(new URL('./layout-worker.ts', import.meta.url), {
        type: 'module'
      });
    }
  }

  async run(canvasId: string, graph: LayoutGraph, options: LayoutRunOptions): Promise<LayoutResult> {
    if (!this.worker) {
      return this.orchestrator.runLayout(canvasId, graph, options);
    }

    return new Promise<LayoutResult>((resolve, reject) => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.error) {
          this.worker?.removeEventListener('message', handleMessage);
          reject(new Error(event.data.error));
          return;
        }
        this.worker?.removeEventListener('message', handleMessage);
        // Worker integration TODO
        resolve(this.orchestrator.runLayout(canvasId, graph, options));
      };

      const worker = this.worker;
      if (!worker) {
        reject(new Error('worker not initialised'));
        return;
      }
      worker.addEventListener('message', handleMessage, { once: true });
      worker.postMessage({ canvasId, graph, options });
    });
  }
}
