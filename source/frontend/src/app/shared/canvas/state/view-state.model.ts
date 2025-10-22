import { Camera } from '../../canvas/types';
import { RuntimeViewConfig, RuntimeViewConfigPatch } from '../../canvas/layout-runtime';

export interface ViewState {
  readonly id: string;
  readonly datasetId: string;
  readonly layout: {
    readonly global: RuntimeViewConfig;
    readonly overrides: ReadonlyMap<string, RuntimeViewConfigPatch>;
  };
  readonly rendererId?: string;
  readonly camera?: Camera;
  readonly styleOverrides?: ReadonlyMap<string, Record<string, unknown>>;
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
      overrides: new Map<string, RuntimeViewConfigPatch>()
    }
  };
}
