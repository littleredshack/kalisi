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
    const activeEngine = options.engineName ?? this.orchestrator.getActiveEngineName(canvasId) ?? undefined;
    const effectiveOptions: LayoutRunOptions = {
      ...options,
      engineName: activeEngine
    };

    if (!this.worker) {
      return this.orchestrator.runLayout(canvasId, graph, effectiveOptions);
    }

    return new Promise<LayoutResult>((resolve, reject) => {
      const worker = this.worker;
      if (!worker) {
        reject(new Error('worker not initialised'));
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        const data = event.data as { result?: LayoutResult; error?: string };
        if (!data) {
          return;
        }
        cleanup();
        if (data.error) {
          reject(new Error(data.error));
          return;
        }
        if (data.result) {
          resolve(data.result);
          return;
        }
        reject(new Error('layout worker returned an empty response'));
      };

      const handleError = (event: ErrorEvent) => {
        cleanup();
        reject(event.error ?? new Error(event.message));
      };

      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
      };

      worker.addEventListener('message', handleMessage, { once: true });
      worker.addEventListener('error', handleError, { once: true });
      worker.postMessage({ canvasId, graph, options: effectiveOptions });
    });
  }
}
