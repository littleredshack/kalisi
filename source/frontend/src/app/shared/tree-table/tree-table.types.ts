export type TreeTableValueType = 'string' | 'number' | 'integer' | 'percent' | 'duration' | 'date';

/**
 * Describes a column that can appear in the tree-table.
 * Columns are declared by layout configuration so the renderer
 * can dynamically render metrics/text without hard-coded schemas.
 */
export interface TreeTableColumn {
  key: string;               // Stable identifier coming from Neo4j
  label: string;             // Human readable header
  valueType: TreeTableValueType;
  description?: string;      // Optional tooltip/help text
  isDefault?: boolean;       // Should be shown by default
  allowAggregation?: boolean;
}

/**
 * Represents a single value placed in a column for a given node.
 * Back-end aggregation can populate both raw and formatted values.
 */
export interface TreeTableValue {
  raw: string | number | null;
  formatted?: string;
  // Optional metadata to drive cell formatting (e.g. trend icons).
  meta?: Record<string, unknown>;
}

/**
 * Tree node returned from the Neo4j query and consumed by the layout engine.
 * The hierarchy is identified purely via GUIDs; parentGuid is required
 * except for the root node(s).
 */
export interface TreeTableNode {
  guid: string;
  parentGuid: string | null;
  label: string;
  kind: string;                 // e.g. File, Function, Import
  language?: string;
  depth: number;                // Precomputed depth to support ordering/indentation
  position?: number;            // Sibling order to allow deterministic rendering

  // Arbitrary properties for the renderer (e.g. icon selection).
  tags?: string[];
  metadataJson?: Record<string, unknown> | string;
  batchId?: string;

  // Column values keyed by column key.
  values: Record<string, TreeTableValue | undefined>;

  // Optional aggregation payload produced upstream.
  aggregates?: Record<string, TreeTableValue | undefined>;
}

/**
 * Complete payload returned by the query service.
 *
 * - `columns` describes the available metrics/text fields and their defaults.
 * - `nodes` is the flattened hierarchy (parent pointers + depth).
 * - `batchId` allows consumers to correlate with import batches.
 */
export interface TreeTableQueryResult {
  columns: TreeTableColumn[];
  nodes: TreeTableNode[];
  batchId?: string;
  generatedAt: string; // ISO timestamp for caching/debugging
}
