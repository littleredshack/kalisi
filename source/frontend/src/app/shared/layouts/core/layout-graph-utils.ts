import { CanvasData, Edge, HierarchicalNode } from '../../canvas/types';
import { LayoutEdge, LayoutGraph, LayoutGraphMetadata, LayoutNode, LayoutResult } from './layout-contract';

export interface HierarchicalGraphSnapshot {
  readonly nodes: HierarchicalNode[];
  readonly edges: Edge[];
  readonly metadata: LayoutGraphMetadata;
}

function cloneNode(node: HierarchicalNode): HierarchicalNode {
  return {
    ...node,
    style: node.style ? { ...node.style } : node.style,
    metadata: node.metadata ? { ...node.metadata } : undefined,
    children: node.children ? node.children.map(child => cloneNode(child)) : []
  };
}

function cloneEdge(edge: Edge): Edge {
  return {
    ...edge,
    metadata: edge.metadata ? { ...edge.metadata } : undefined,
    style: edge.style ? { ...edge.style } : edge.style,
    waypoints: edge.waypoints ? edge.waypoints.map(point => ({ ...point })) : undefined
  };
}

function createNodeFromLayout(layoutNode: LayoutNode): HierarchicalNode {
  return {
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
    dragging: false,
    metadata: { ...layoutNode.metadata }
  };
}

export function layoutGraphToHierarchical(graph: LayoutGraph): HierarchicalGraphSnapshot {
  console.log(`[LayoutGraphUtils] layoutGraphToHierarchical START (converting LayoutGraph to HierarchicalNodes)`);

  const nodeMap = new Map<string, HierarchicalNode>();

  Object.values(graph.nodes).forEach(node => {
    const hierarchical = createNodeFromLayout(node);
    console.log(`[LayoutGraphUtils]   Creating node ${node.id}: geometry=(${node.geometry.x}, ${node.geometry.y}) → hierarchical x=${hierarchical.x}, y=${hierarchical.y}`);
    nodeMap.set(node.id, hierarchical);
  });

  Object.values(graph.nodes).forEach(node => {
    const parent = nodeMap.get(node.id);
    if (!parent) return;
    node.children.forEach(childId => {
      const child = nodeMap.get(childId);
      if (child) {
        console.log(`[LayoutGraphUtils]   Adding child ${childId} (${child.x}, ${child.y}) to parent ${parent.GUID}`);
        parent.children.push(child);
      }
    });
  });

  const roots = computeRootNodes(graph, nodeMap);
  const edges: Edge[] = Object.values(graph.edges).map(edge => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
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
  console.log(`[LayoutGraphUtils] hierarchicalToLayoutGraph START`);

  const nodesRecord: Record<string, MutableLayoutNode> = {};
  const edgesRecord = snapshot.edges.reduce<Record<string, LayoutEdge>>((acc, edge) => {
    acc[edge.id] = createEdgeRecord(edge);
    return acc;
  }, {});

  const visit = (node: HierarchicalNode, depth: number = 0): void => {
    const nodeId = node.GUID ?? node.id;
    if (!nodeId) return;

    const indent = '  '.repeat(depth);
    console.log(`[LayoutGraphUtils] ${indent}Node ${nodeId}: (${node.x}, ${node.y}), ${node.children.length} children`);

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
        style: node.style
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
      children: [...node.children],
      edges: [...node.edges]
    };
  });

  return {
    nodes: readonlyNodes,
    edges: edgesRecord,
    metadata: snapshot.metadata
  };
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
    from: edge.from,
    to: edge.to,
    label: edge.label,
    metadata: {
      ...(edge.metadata ?? {}),
      style: edge.style
    }
  };
}

export function canvasDataToLayoutGraph(data: CanvasData, layoutVersion = 1): LayoutGraph {
  const snapshot: HierarchicalGraphSnapshot = {
    nodes: data.nodes.map(node => cloneNode(node)),
    edges: (data.originalEdges ?? data.edges).map(edge => cloneEdge(edge)),
    metadata: {
      rootIds: collectRootGuids(data.nodes),
      layoutVersion
    }
  };
  return hierarchicalToLayoutGraph(snapshot);
}

export function layoutResultToCanvasData(result: LayoutResult, previous?: CanvasData): CanvasData {
  const snapshot = layoutGraphToHierarchical(result.graph);
  const camera = result.camera ?? previous?.camera;
  return {
    nodes: snapshot.nodes.map(node => cloneNode(node)),
    edges: snapshot.edges.map(edge => cloneEdge(edge)),
    originalEdges: snapshot.edges.map(edge => cloneEdge(edge)),
    camera
  };
}

function collectRootGuids(nodes: HierarchicalNode[]): string[] {
  return nodes
    .map(node => node.GUID ?? node.id)
    .filter((value): value is string => Boolean(value));
}
