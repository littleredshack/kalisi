import { Camera } from '../types';
import { RuntimeViewConfig } from '../layout-runtime';

// Minimal ViewState for save/load functionality
export interface ViewState {
  readonly id: string;
  readonly datasetId: string;
  readonly layout: {
    readonly global: RuntimeViewConfig;
  };
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
      global: { ...config }
    }
  };
}
