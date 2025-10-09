import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Neo4jDataService } from '../../core/services/neo4j-data.service';
import { TreeTableLayoutEngine } from './tree-table-layout-engine';
import { TreeTableColumn, TreeTableNode } from './tree-table.types';

@Component({
  selector: 'app-tree-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tree-table.component.html',
})
export class TreeTableComponent implements OnInit {
  private readonly neo4jDataService = inject(Neo4jDataService);
  private readonly layoutEngine = new TreeTableLayoutEngine();

  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly columns = signal<TreeTableColumn[]>([]);
  readonly nodes = signal<TreeTableNode[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const layout = await this.neo4jDataService.fetchTreeTable();
      const shaped = this.layoutEngine.build(layout);
      this.columns.set(shaped.columns);
      this.nodes.set(shaped.nodes);
      this.errorMessage.set(null);
    } catch (error) {
      console.error('[TreeTableComponent] Failed to load tree-table data', error);
      this.errorMessage.set(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      this.isLoading.set(false);
    }
  }
}
