import { LayoutResult } from '../layouts/core/layout-contract';
import { layoutGraphToHierarchical } from '../layouts/core/layout-graph-utils';
import { Camera, CanvasData, HierarchicalNode, Edge } from '../canvas/types';

export interface PresentationFrame {
  readonly version: number;
  readonly camera?: Camera;
  readonly canvasData: CanvasData;
  readonly lastResult: LayoutResult;
  readonly delta?: PresentationDelta;
}

export interface NodeDelta {
  readonly nodeId: string;
  readonly hasGeometryChange: boolean;
  readonly hasStateChange: boolean;
  readonly hasMetadataChange: boolean;
}

export interface EdgeDelta {
  readonly edgeId: string;
  readonly hasChange: boolean;
}

export interface PresentationDelta {
  readonly nodes: ReadonlyArray<NodeDelta>;
  readonly edges: ReadonlyArray<EdgeDelta>;
}

export interface PresentationFrameResult {
  readonly frame: PresentationFrame;
  readonly delta: PresentationDelta;
}

export function buildPresentationFrame(result: LayoutResult, previous?: PresentationFrame): PresentationFrameResult {
  const snapshot = layoutGraphToHierarchical(result.graph);
  const camera = result.camera ?? previous?.camera;

  const canvasData: CanvasData = {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    originalEdges: snapshot.edges,
    camera
  };

  const delta = calculateDelta(canvasData, previous?.canvasData ?? null);

  const frame: PresentationFrame = {
    version: (result.graph.metadata.layoutVersion ?? previous?.version ?? 0) + 1,
    camera,
    canvasData,
    lastResult: result,
    delta
  };

  return { frame, delta };
}

function calculateDelta(current: CanvasData, previous: CanvasData | null): PresentationDelta {
  if (!previous) {
    return {
      nodes: current.nodes.map(node => ({
        nodeId: node.GUID ?? node.id,
        hasGeometryChange: true,
        hasStateChange: true,
        hasMetadataChange: true
      })),
      edges: current.edges.map(edge => ({
        edgeId: edge.id,
        hasChange: true
      }))
    };
  }

  const previousNodeMap = new Map<string, HierarchicalNode>();
  const collect = (nodes: HierarchicalNode[]) => {
    nodes.forEach(node => {
      const id = node.GUID ?? node.id;
      if (id) {
        previousNodeMap.set(id, node);
      }
      collect(node.children ?? []);
    });
  };
  collect(previous.nodes);

  const nodeDeltas: NodeDelta[] = [];
  const collectCurrent = (nodes: HierarchicalNode[]) => {
    nodes.forEach(node => {
      const id = node.GUID ?? node.id;
      if (!id) {
        return;
      }
      const previousNode = previousNodeMap.get(id);
      const geometryChanged =
        !previousNode ||
        previousNode.x !== node.x ||
        previousNode.y !== node.y ||
        previousNode.width !== node.width ||
        previousNode.height !== node.height;
      const stateChanged =
        !previousNode ||
        previousNode.visible !== node.visible ||
        previousNode.collapsed !== node.collapsed ||
        previousNode.selected !== node.selected;
      const metadataChanged = JSON.stringify(previousNode?.metadata ?? {}) !== JSON.stringify(node.metadata ?? {});
      nodeDeltas.push({
        nodeId: id,
        hasGeometryChange: geometryChanged,
        hasStateChange: stateChanged,
        hasMetadataChange: metadataChanged
      });
      collectCurrent(node.children ?? []);
    });
  };
  collectCurrent(current.nodes);

  const previousEdgeMap = new Map<string, Edge>();
  previous.edges.forEach(edge => previousEdgeMap.set(edge.id, edge));

  const edgeDeltas: EdgeDelta[] = current.edges.map(edge => {
    const previousEdge = previousEdgeMap.get(edge.id);
    const changed = !previousEdge || JSON.stringify(previousEdge) !== JSON.stringify(edge);
    return {
      edgeId: edge.id,
      hasChange: changed
    };
  });

  return { nodes: nodeDeltas, edges: edgeDeltas };
}
