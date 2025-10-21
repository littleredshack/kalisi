import { LayoutResult } from '../layouts/core/layout-contract';
import { layoutGraphToHierarchical } from '../layouts/core/layout-graph-utils';
import { Camera, CanvasData, HierarchicalNode, Edge } from '../canvas/types';
import { ensureRelativeNodeCoordinates } from '../canvas/utils/relative-coordinates';

export interface PresentationFrame {
  readonly version: number;
  readonly camera?: Camera;
  readonly canvasData: CanvasData;
  readonly lastResult: LayoutResult;
  readonly delta?: PresentationDelta;
  readonly lensId?: string;
  readonly rendererId?: string; // 'runtime-containment-renderer' | 'runtime-flat-renderer'
  readonly metadata?: Record<string, unknown>;
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

export function buildPresentationFrame(result: LayoutResult, previous?: PresentationFrame, lensId?: string): PresentationFrame {
  Object.entries(result.graph.nodes).forEach(([id, node]) => {
    if (node.children.length > 0) {
    }
  });

  const snapshot = layoutGraphToHierarchical(result.graph);

  // Skip coordinate normalization for runtime engines that output correctly positioned nodes
  // Runtime engines set displayMode in metadata to indicate they handle positions internally
  const displayMode = result.graph.metadata['displayMode'] as string | undefined;
  const isRuntimeEngine = displayMode === 'containment-runtime' ||
                          displayMode === 'containment-grid' ||
                          displayMode === 'orthogonal';

  snapshot.nodes.forEach(root => {
    root.children.forEach(child => {
    });
  });

  if (!isRuntimeEngine) {
    ensureRelativeNodeCoordinates(snapshot.nodes, 0, 0);
  }

  snapshot.nodes.forEach(root => {
    root.children.forEach(child => {
    });
  });


  const camera = result.camera ?? previous?.camera;

  const canvasData: CanvasData = {
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    originalEdges: snapshot.edges,
    camera,
    metadata: snapshot.metadata
  };

  const delta = calculateDelta(canvasData, previous?.canvasData ?? null);

  return {
    version: (result.graph.metadata.layoutVersion ?? previous?.version ?? 0) + 1,
    camera,
    canvasData,
    lastResult: result,
    delta,
    lensId: lensId ?? previous?.lensId,
    metadata: result.graph.metadata
  };
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
