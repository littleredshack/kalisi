import { RawDataInput, LayoutNode, LayoutEdge, LayoutGraph, LayoutGraphMetadata } from '../core/layout-contract';

interface RuntimeNodeDescriptor {
  guid: string;
  id: string;
  name: string;
  type: string;
  role?: string;
  parentGuid?: string | null;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  style?: {
    fill?: string;
    stroke?: string;
    icon?: string;
    badges?: Array<{ text: string; color?: string }>;
    labelVisible?: boolean;
  };
  metadata?: Record<string, unknown>;
}

interface RuntimeEdgeDescriptor {
  id: string;
  from: string;
  to: string;
  type: string;
  style?: {
    stroke?: string;
    strokeWidth?: number;
    strokeDashArray?: number[] | null;
    label?: string;
    labelVisible?: boolean;
  };
  metadata?: Record<string, unknown>;
}

interface RuntimeGraphSnapshot {
  nodes: Map<string, RuntimeNodeDescriptor>;
  edges: RuntimeEdgeDescriptor[];
  rootIds: string[];
}

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;

const containmentTypes = new Set(['CONTAINS', 'HAS_CHILD', 'HAS_COMPONENT', 'PARENT_OF']);

function asRecord(value: unknown): Record<string, any> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, any>;
  }
  return {};
}

function extractGuid(value: any): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    return value.GUID ?? value.guid ?? value.id ?? value.toString();
  }
  return undefined;
}

export function buildRuntimeGraphSnapshot(input: RawDataInput): RuntimeGraphSnapshot {
  const nodes = new Map<string, RuntimeNodeDescriptor>();
  const parentByChild = new Map<string, string>();
  const worldPositions = new Map<string, { x: number; y: number }>();

  input.entities.forEach(entity => {
    const properties = asRecord(entity.properties);
    const guid = extractGuid(entity.id ?? properties['GUID']);
    if (!guid) {
      return;
    }

    const role =
      properties['role'] ||
      properties['type'] ||
      properties['category'] ||
      'node';

    const display = asRecord((entity as any).display ?? properties['display']);
    const position = asRecord((entity as any).position ?? {});
    const displayBadges = display['badges'];
    const propertyBadges = properties['badges'];
    const badges = Array.isArray(displayBadges)
      ? displayBadges
      : Array.isArray(propertyBadges)
        ? propertyBadges
        : undefined;

    const worldX = typeof position['x'] === 'number'
      ? (position['x'] as number)
      : typeof properties['x'] === 'number'
        ? (properties['x'] as number)
        : undefined;
    const worldY = typeof position['y'] === 'number'
      ? (position['y'] as number)
      : typeof properties['y'] === 'number'
        ? (properties['y'] as number)
        : undefined;

    const parentCandidate =
      (entity as any).parent_guid ??
      (entity as any).parentGuid ??
      (entity as any).parentGUID ??
      (entity as any).parent ??
      properties['parent_guid'] ??
      properties['parentGuid'] ??
      properties['parentGUID'] ??
      properties['parent'];

    const node: RuntimeNodeDescriptor = {
      guid,
      id: String(properties['id'] ?? guid),
      name: String(properties['name'] ?? properties['label'] ?? guid),
      type: String(properties['type'] ?? role ?? 'node'),
      role: typeof role === 'string' ? role : undefined,
      parentGuid: extractGuid(parentCandidate),
      width: typeof display['width'] === 'number' ? (display['width'] as number) : undefined,
      height: typeof display['height'] === 'number' ? (display['height'] as number) : undefined,
      x: worldX,
      y: worldY,
      style: {
        fill: (display['color'] ?? properties['color']) as string | undefined,
        stroke: (display['border_color'] ?? properties['stroke']) as string | undefined,
        icon: (display['icon'] ?? properties['icon']) as string | undefined,
        badges: badges as Array<{ text: string; color?: string }> | undefined,
        labelVisible: (display['label_visible'] ?? properties['labelVisible']) as boolean | undefined
      },
      metadata: {
        ...properties,
        displayMode: properties['displayMode'],
        labels: (entity as any).labels ?? []
      }
    };

    nodes.set(guid, node);
    if (typeof worldX === 'number' && typeof worldY === 'number') {
      worldPositions.set(guid, { x: worldX, y: worldY });
    }
  });

  input.relationships.forEach(rel => {
    if (!containmentTypes.has(rel.type)) {
      return;
    }
    const from = extractGuid((rel as any).fromGUID ?? (rel as any).source_guid ?? rel.source);
    const to = extractGuid((rel as any).toGUID ?? (rel as any).target_guid ?? rel.target);
    if (from && to && nodes.has(to)) {
      parentByChild.set(to, from);
    }
  });

  const rootIds: string[] = [];
  nodes.forEach(node => {
    const explicitParent = node.parentGuid && nodes.has(node.parentGuid);
    const containmentParent = parentByChild.get(node.guid);
    node.parentGuid = containmentParent ?? (explicitParent ? node.parentGuid : undefined);
  });

  nodes.forEach(node => {
    if (!node.parentGuid || !nodes.has(node.parentGuid)) {
      rootIds.push(node.guid);
    }
  });


  const assignDefaultPositions = (ids: string[], startX: number, startY: number): void => {
    const spacing = 320;
    ids.forEach((guid, index) => {
      if (!worldPositions.has(guid)) {
        worldPositions.set(guid, { x: startX + index * spacing, y: startY });
      }
    });
  };

  assignDefaultPositions(rootIds, 0, 0);

  const computeWorldPosition = (guid: string): { x: number; y: number } => {
    const existing = worldPositions.get(guid);
    if (existing) {
      return existing;
    }
    const node = nodes.get(guid);
    if (!node) {
      const fallback = { x: 0, y: 0 };
      worldPositions.set(guid, fallback);
      return fallback;
    }
    if (node.parentGuid && nodes.has(node.parentGuid)) {
      const parentWorld = computeWorldPosition(node.parentGuid);
      const relativeX = typeof node.x === 'number' ? node.x : 0;
      const relativeY = typeof node.y === 'number' ? node.y : 0;
      const derived = { x: parentWorld.x + relativeX, y: parentWorld.y + relativeY };
      worldPositions.set(guid, derived);
      return derived;
    }
    const derived = { x: 0, y: 0 };
    worldPositions.set(guid, derived);
    return derived;
  };

  nodes.forEach((_node, guid) => {
    computeWorldPosition(guid);
  });

  nodes.forEach(node => {
    const world = worldPositions.get(node.guid) ?? { x: 0, y: 0 };
    if (node.parentGuid && worldPositions.has(node.parentGuid)) {
      const parentWorld = worldPositions.get(node.parentGuid)!;
      node.x = world.x - parentWorld.x;
      node.y = world.y - parentWorld.y;
    } else {
      node.x = world.x;
      node.y = world.y;
    }
    node.metadata = {
      ...(node.metadata ?? {}),
      worldPosition: { x: world.x, y: world.y }
    };
  });

  const edges: RuntimeEdgeDescriptor[] = [];

  input.relationships.forEach(rel => {
    const properties = asRecord(rel.properties);
    const from = extractGuid((rel as any).fromGUID ?? (rel as any).source_guid ?? rel.source);
    const to = extractGuid((rel as any).toGUID ?? (rel as any).target_guid ?? rel.target);
    if (!from || !to) {
      return;
    }

    const style = asRecord((rel as any).display);
    edges.push({
      id: rel.id ?? `${rel.type}-${from}-${to}`,
      from,
      to,
      type: rel.type,
      style: {
        stroke: (style['color'] ?? properties['color']) as string | undefined,
        strokeWidth: (style['width'] ?? properties['width']) as number | undefined,
        strokeDashArray: (style['dash'] ?? properties['dash']) as number[] | null | undefined,
        label: (style['label'] ?? properties['label']) as string | undefined,
        labelVisible: (style['label_visible'] ?? properties['labelVisible']) as boolean | undefined
      },
      metadata: {
        ...properties,
        relationType: rel.type
      }
    });
  });

  return { nodes, edges, rootIds };
}

export function runtimeSnapshotToLayoutGraph(snapshot: RuntimeGraphSnapshot): LayoutGraph {
  const layoutNodes: Record<string, LayoutNode> = {};
  const layoutEdges: Record<string, LayoutEdge> = {};

  const childLists = new Map<string, string[]>();
  const edgeLists = new Map<string, string[]>();

  snapshot.nodes.forEach((node, guid) => {
    const width = node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.height ?? DEFAULT_NODE_HEIGHT;
    childLists.set(guid, []);
    edgeLists.set(guid, []);
    const metadata = {
      role: node.role,
      display: node.style,
      ...node.metadata
    };
    layoutNodes[guid] = {
      id: guid,
      label: node.name,
      type: node.type ?? 'node',
      geometry: {
        x: node.x ?? 0,
        y: node.y ?? 0,
        width,
        height
      },
      state: {
        collapsed: false,
        visible: true,
        selected: false
      },
      metadata,
      children: [],
      edges: []
    };
  });

  snapshot.nodes.forEach(node => {
    if (node.parentGuid && snapshot.nodes.has(node.parentGuid)) {
      const children = childLists.get(node.parentGuid);
      if (children) {
        children.push(node.guid);
      }
    }
  });

  snapshot.edges.forEach(edge => {
    layoutEdges[edge.id] = {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.style?.label ?? '',
      metadata: {
        ...edge.metadata,
        relationType: edge.type,
        style: {
          stroke: edge.style?.stroke,
          strokeWidth: edge.style?.strokeWidth,
          strokeDashArray: edge.style?.strokeDashArray
        },
        labelVisible: edge.style?.labelVisible ?? true
      }
    };
    const fromEdges = edgeLists.get(edge.from);
    if (fromEdges && !fromEdges.includes(edge.id)) {
      fromEdges.push(edge.id);
    }
    const toEdges = edgeLists.get(edge.to);
    if (toEdges && !toEdges.includes(edge.id)) {
      toEdges.push(edge.id);
    }
  });

  Object.entries(layoutNodes).forEach(([guid, node]) => {
    const children = childLists.get(guid) ?? [];
    const edges = edgeLists.get(guid) ?? [];
    layoutNodes[guid] = {
      ...node,
      children: [...children],
      edges: [...edges]
    };
  });

  const metadata: LayoutGraphMetadata = {
    rootIds: snapshot.rootIds,
    layoutVersion: 1,
    displayMode: 'containment-runtime'
  };

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    metadata
  };
}
