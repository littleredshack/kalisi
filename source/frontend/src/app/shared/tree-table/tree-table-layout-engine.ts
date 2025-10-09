import { TreeTableColumn, TreeTableNode } from './tree-table.types';

/**
 * Result consumed by the eventual tree-table component. This mirrors the
 * Graph/canvas LayoutResult but tailored for a tabular hierarchy.
 */
export interface TreeTableLayoutResult {
  columns: TreeTableColumn[];
  nodes: TreeTableNode[];
  batchId?: string;
  generatedAt: string;
}

/**
 * Simple adapter that takes the raw query result and exposes a typed result to
 * the renderer layer. Once aggregation/pagination logic lands this class will
 * be responsible for tree shaping (e.g. building maps, indexing children).
 */
export class TreeTableLayoutEngine {
  build(result: TreeTableLayoutResult): TreeTableLayoutResult {
    return result;
  }
}
