import { CanvasData, Edge, HierarchicalNode } from '../../canvas/types';
import { LayoutEdge, LayoutGraph, LayoutGraphMetadata, LayoutNode, LayoutResult } from './layout-contract';

export interface HierarchicalGraphSnapshot {
  readonly nodes: HierarchicalNode[];
  readonly edges: Edge[];
  readonly metadata: LayoutGraphMetadata;
}

// cloneNode and cloneEdge removed - no longer needed
// Engines now work with readonly references and create new objects

function createNodeFromLayout(layoutNode: LayoutNode): HierarchicalNode {
  const node: any = {
    id: layoutNode.label ?? layoutNode.id,
    GUID: layoutNode.id,
    type: layoutNode.type,
    x: layoutNode.geometry.x,
    y: layoutNode.geometry.y,
    width: layoutNode.geometry.width,
    height: layoutNode.geometry.height,
    text: layoutNode.label ?? layoutNode.id,
    style: (layoutNode.metadata['style'] as HierarchicalNode['style']) ?? {
      fill: '#1f2937',
      stroke: '#4b5563'
    },
    children: [],
    selected: layoutNode.state.selected,
    visible: layoutNode.state.visible,
    collapsed: layoutNode.state.collapsed,
    dragging: (layoutNode.metadata['dragging'] as boolean) ?? false,
    metadata: { ...layoutNode.metadata }
  };

  // Preserve user-locked state
  if (layoutNode.metadata['_userLocked']) {
    node._userLocked = layoutNode.metadata['_userLocked'];
  }
  if (layoutNode.metadata['_lockedPosition']) {
    node._lockedPosition = layoutNode.metadata['_lockedPosition'];
  }

  return node;
}

export function layoutGraphToHierarchical(graph: LayoutGraph): HierarchicalGraphSnapshot {
  const nodeMap = new Map<string, HierarchicalNode>();

  Object.values(graph.nodes).forEach(node => {
    const hierarchical = createNodeFromLayout(node);
    nodeMap.set(node.id, hierarchical);
  });

  Object.values(graph.nodes).forEach(node => {
    const parent = nodeMap.get(node.id);
    if (!parent) return;
    node.children.forEach(childId => {
      const child = nodeMap.get(childId);
      if (child) {
        parent.children.push(child);
      }
    });
  });

  const roots = computeRootNodes(graph, nodeMap);

  const edges: Edge[] = Object.values(graph.edges).map(edge => ({
    id: edge.id,
    fromGUID: edge.from,
    toGUID: edge.to,
    label: edge.label ?? '',
    style: (edge.metadata['style'] as Edge['style']) ?? {
      stroke: '#6ea8fe',
      strokeWidth: 2,
      strokeDashArray: null
    },
    metadata: { ...edge.metadata }
  }));

  return {
    nodes: roots,
    edges,
    metadata: graph.metadata
  };
}

type MutableLayoutNode = Omit<LayoutNode, 'children' | 'edges'> & {
  children: string[];
  edges: string[];
};

export function hierarchicalToLayoutGraph(snapshot: HierarchicalGraphSnapshot): LayoutGraph {
  const nodesRecord: Record<string, MutableLayoutNode> = {};
  const edgesRecord = snapshot.edges.reduce<Record<string, LayoutEdge>>((acc, edge) => {
    acc[edge.id] = createEdgeRecord(edge);
    return acc;
  }, {});

  const visit = (node: HierarchicalNode, depth: number = 0): void => {
    const nodeId = node.GUID ?? node.id;
    if (!nodeId) return;

    const childrenIds = node.children
      .map(child => child.GUID ?? child.id)
      .filter((value): value is string => Boolean(value));

    nodesRecord[nodeId] = {
      id: nodeId,
      label: node.text ?? node.id,
      type: node.type,
      geometry: {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      },
      state: {
        collapsed: node.collapsed ?? false,
        visible: node.visible ?? true,
        selected: node.selected ?? false
      },
      metadata: {
        ...(node.metadata ?? {}),
        style: node.style,
        dragging: node.dragging ?? false,
        _userLocked: (node as any)._userLocked ?? false
      },
      children: childrenIds,
      edges: []
    };

    node.children.forEach(child => visit(child, depth + 1));
  };

  snapshot.nodes.forEach(node => visit(node));

  Object.values(edgesRecord).forEach(edge => {
    const fromNode = nodesRecord[edge.from];
    const toNode = nodesRecord[edge.to];
    if (fromNode && !fromNode.edges.includes(edge.id)) {
      fromNode.edges.push(edge.id);
    }
    if (toNode && !toNode.edges.includes(edge.id)) {
      toNode.edges.push(edge.id);
    }
  });

  const readonlyNodes: Record<string, LayoutNode> = {};
  Object.entries(nodesRecord).forEach(([nodeId, node]) => {
    readonlyNodes[nodeId] = {
      ...node,
      geometry: {
        x: node.geometry.x,
        y: node.geometry.y,
        width: node.geometry.width,
        height: node.geometry.height
      },
      state: {
        collapsed: node.state.collapsed,
        visible: node.state.visible,
        selected: node.state.selected
      },
      metadata: { ...node.metadata },
      children: [...node.children],
      edges: [...node.edges]
    };
  });

  // Deep copy edges to prevent mutations
  const readonlyEdges: Record<string, LayoutEdge> = {};
  Object.entries(edgesRecord).forEach(([edgeId, edge]) => {
    readonlyEdges[edgeId] = {
      ...edge,
      metadata: { ...(edge.metadata ?? {}) }
    };
  });

  // viewGraph must be mutable for layout engines
  const graph = {
    nodes: readonlyNodes,
    edges: readonlyEdges,
    metadata: { ...snapshot.metadata }
  };

  return graph;
}

function computeRootNodes(
  graph: LayoutGraph,
  nodeMap: Map<string, HierarchicalNode>
): HierarchicalNode[] {
  const explicitRoots = graph.metadata.rootIds ?? [];
  if (explicitRoots.length > 0) {
    return explicitRoots
      .map(id => nodeMap.get(id))
      .filter((node): node is HierarchicalNode => Boolean(node));
  }

  const childSet = new Set<string>();
  Object.values(graph.nodes).forEach(node => {
    node.children.forEach(child => childSet.add(child));
  });

  const roots: HierarchicalNode[] = [];
  nodeMap.forEach((node, nodeId) => {
    if (!childSet.has(nodeId)) {
      roots.push(node);
    }
  });

  return roots;
}

function createEdgeRecord(edge: Edge): LayoutEdge {
  return {
    id: edge.id,
    from: edge.fromGUID,
    to: edge.toGUID,
    label: edge.label,
    metadata: {
      ...(edge.metadata ?? {}),
      style: edge.style
    }
  };
}

export function canvasDataToLayoutGraph(data: CanvasData, layoutVersion = 1): LayoutGraph {
  console.log('[canvasDataToLayoutGraph] BEFORE transformation - CanvasData:', JSON.parse(JSON.stringify(data)));

  // NO CLONING - engine receives readonly view of ViewGraph
  // Engine contract: must NOT mutate input, must return new objects
  const snapshot: HierarchicalGraphSnapshot = {
    nodes: data.nodes,  // Direct reference
    edges: data.originalEdges ?? data.edges,  // Direct reference
    metadata: {
      rootIds: collectRootGuids(data.nodes),
      layoutVersion
    }
  };
  const result = hierarchicalToLayoutGraph(snapshot);

  console.log('[canvasDataToLayoutGraph] AFTER transformation - LayoutGraph:', JSON.parse(JSON.stringify(result)));

  return result;
}

// layoutResultToCanvasData removed - was unused dead code

function collectRootGuids(nodes: HierarchicalNode[]): string[] {
  return nodes
    .map(node => node.GUID ?? node.id)
    .filter((value): value is string => Boolean(value));
}
