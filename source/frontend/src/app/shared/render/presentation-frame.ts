import { LayoutResult } from '../layouts/core/layout-contract';
import { layoutGraphToHierarchical } from '../layouts/core/layout-graph-utils';
import { Camera, CanvasData } from '../canvas/types';

export interface PresentationFrame {
  readonly version: number;
  readonly camera?: Camera;
  readonly canvasData: CanvasData;
}

export function buildPresentationFrame(result: LayoutResult, previous?: PresentationFrame): PresentationFrame {
  const snapshot = layoutGraphToHierarchical(result.graph);
  const camera = result.camera ?? previous?.camera;

  return {
    version: (result.graph.metadata.layoutVersion ?? previous?.version ?? 0) + 1,
    camera,
    canvasData: {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      originalEdges: snapshot.edges,
      camera
    }
  };
}
