import { LayoutGraph, LayoutResult } from '../layouts/core/layout-contract';

export interface GraphStoreSnapshot {
  readonly version: number;
  readonly graph: LayoutGraph;
}

export class GraphStore {
  private snapshot: GraphStoreSnapshot;

  constructor(initialGraph: LayoutGraph) {
    this.snapshot = {
      version: initialGraph.metadata.layoutVersion ?? 1,
      graph: initialGraph
    };
  }

  get current(): GraphStoreSnapshot {
    return this.snapshot;
  }

  update(result: LayoutResult): void {
    const nextVersion = (result.graph.metadata.layoutVersion ?? this.snapshot.version) + 1;
    this.snapshot = {
      version: nextVersion,
      graph: {
        ...result.graph,
        metadata: {
          ...result.graph.metadata,
          layoutVersion: nextVersion
        }
      }
    };
  }

  replace(graph: LayoutGraph): void {
    this.snapshot = {
      version: graph.metadata.layoutVersion ?? 1,
      graph
    };
  }
}
