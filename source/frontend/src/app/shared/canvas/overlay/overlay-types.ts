import { NodeLayoutConfig, ResolvedConfig } from '../node-config-manager';
import { EdgeStyleOverrides, NodeStyleOverrides, NodeStyleSnapshot } from '../types';

export type OverlayScope = 'global' | 'subtree' | 'node';

export interface OverlayPatchBase {
  readonly id: string;
  readonly scope: OverlayScope;
  readonly stopCascade?: boolean;
  readonly updatedAt: number;
  readonly author: 'user' | 'system';
}

export interface NodeOverlayPatch extends OverlayPatchBase {
  readonly style?: Partial<NodeStyleOverrides>;
  readonly layout?: Partial<NodeLayoutConfig>;
  readonly containmentMode?: 'containers' | 'flat' | 'inherit';
  readonly visibility?: 'visible' | 'hidden' | 'inherit';
}

export interface EdgeOverlayPatch extends OverlayPatchBase {
  readonly style?: Partial<EdgeStyleOverrides>;
  readonly visibility?: 'visible' | 'hidden' | 'inherit';
}

export interface ResolvedNodeProfile {
  readonly containmentMode: 'containers' | 'flat';
  readonly layout: ResolvedConfig;
  readonly style: NodeStyleSnapshot;
  readonly visibility: 'visible' | 'hidden';
}

export interface ResolvedEdgeProfile {
  readonly style: EdgeStyleOverrides;
  readonly visibility: 'visible' | 'hidden';
}

export interface OverlayResolutionOptions {
  readonly nodeId: string;
  readonly ancestorIds: ReadonlyArray<string>;
  readonly baseStyle: NodeStyleSnapshot;
  readonly baseLayout: ResolvedConfig;
  readonly baseContainmentMode: 'containers' | 'flat';
  readonly baseVisibility: 'visible' | 'hidden';
}

export interface EdgeResolutionOptions {
  readonly edgeId: string;
  readonly baseStyle: EdgeStyleOverrides;
  readonly baseVisibility: 'visible' | 'hidden';
}

