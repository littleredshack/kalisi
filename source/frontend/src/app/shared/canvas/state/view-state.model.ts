import { Camera } from '../types';
import { RuntimeViewConfig } from '../layout-runtime';
import { NodeLayoutConfig } from '../node-config-manager';

// ViewState is the single source of truth for all visual/layout configuration
export interface ViewState {
  readonly id: string;
  readonly datasetId: string;
  readonly layout: {
    readonly global: RuntimeViewConfig;
    readonly perNode?: Record<string, NodeLayoutConfig>; // Per-node layout overrides
  };
  readonly rendererId?: string;
  readonly camera?: Camera;
}

export function createDefaultViewState(
  id: string,
  datasetId: string,
  config: RuntimeViewConfig
): ViewState {
  return {
    id,
    datasetId,
    layout: {
      global: { ...config },
      perNode: {}
    }
  };
}
