import { Camera } from '../../canvas/types';

export interface LayoutNodeGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutNodeState {
  readonly collapsed: boolean;
  readonly visible: boolean;
  readonly selected: boolean;
}

export interface LayoutNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly geometry: LayoutNodeGeometry;
  readonly state: LayoutNodeState;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly children: ReadonlyArray<string>;
  readonly edges: ReadonlyArray<string>;
}

export interface LayoutEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface LayoutGraphMetadata extends Readonly<Record<string, unknown>> {
  readonly rootIds?: ReadonlyArray<string>;
  readonly layoutVersion?: number;
}

export interface LayoutGraph {
  readonly nodes: Readonly<Record<string, LayoutNode>>;
  readonly edges: Readonly<Record<string, LayoutEdge>>;
  readonly metadata: LayoutGraphMetadata;
}

export interface LayoutCapabilities {
  readonly supportsIncremental: boolean;
  readonly deterministic: boolean;
  readonly canHandleRealtime: boolean;
}

export interface LayoutOptions {
  readonly reason: 'initial' | 'engine-switch' | 'user-command' | 'data-update' | 'reflow';
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly timestamp: number;
  readonly previousGraph?: LayoutGraph;
  readonly engineOptions?: Readonly<Record<string, unknown>>;
}

export interface LayoutDiagnostics {
  readonly warnings?: ReadonlyArray<string>;
  readonly metrics?: Readonly<Record<string, number>>;
  readonly durationMs?: number;
}

export interface LayoutResult {
  readonly graph: LayoutGraph;
  readonly camera?: Camera;
  readonly diagnostics?: LayoutDiagnostics;
}

/**
 * Raw entity data from data sources (e.g., Neo4j queries)
 */
export interface RawEntity {
  readonly id: string;
  readonly name?: string;
  readonly type?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Raw relationship data from data sources
 */
export interface RawRelationship {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: string;
  readonly properties?: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Raw data input for layout engines that support initial data processing
 */
export interface RawDataInput {
  readonly entities: ReadonlyArray<RawEntity>;
  readonly relationships: ReadonlyArray<RawRelationship>;
}

export interface LayoutEngine {
  readonly name: string;
  readonly capabilities: LayoutCapabilities;

  /**
   * Core layout method - transforms a layout graph according to engine rules
   */
  layout(graph: LayoutGraph, options: LayoutOptions): LayoutResult;

  /**
   * Optional method to process raw data from data sources
   * Engines that implement this can handle initial data loading directly
   * without requiring pre-processed hierarchical structures
   */
  processRawData?(input: RawDataInput, options?: LayoutOptions): LayoutGraph;
}
