import { TreeTableLayoutResult } from './tree-table-layout-engine';
import { TreeTableColumn, TreeTableNode } from './tree-table.types';

/**
 * Minimal renderer scaffold; the actual implementation will likely become an
 * Angular component leveraging PrimeNG or a custom virtualised table. Keeping
 * this class isolated lets us plug into the existing ComponentFactory without
 * forcing the canvas engine to understand tabular layouts.
 */
export class TreeTableRenderer {
  private columns: TreeTableColumn[] = [];
  private nodes: TreeTableNode[] = [];

  load(layout: TreeTableLayoutResult): void {
    this.columns = layout.columns;
    this.nodes = layout.nodes;
  }

  /**
   * Placeholder render hook. The caller (e.g. a new TreeTableComponent) will
   * flesh this out to produce DOM rows, manage expansion state, etc.
   */
  render(): void {
    if (this.nodes.length === 0) {
      return;
    }
  }
}
