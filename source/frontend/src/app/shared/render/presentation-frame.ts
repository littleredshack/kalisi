import { LayoutResult } from '../layouts/core/layout-contract';
import { layoutGraphToHierarchical } from '../layouts/core/layout-graph-utils';
import { Camera, CanvasData, HierarchicalNode, Edge, NodeStyleSnapshot, EdgeStyleOverrides, NodeStyleOverrides } from '../canvas/types';
import { ensureRelativeNodeCoordinates } from '../canvas/utils/relative-coordinates';
import { OverlayResolver } from '../canvas/overlay/overlay-resolver';
import { ResolvedNodeProfile, ResolvedEdgeProfile } from '../canvas/overlay/overlay-types';
import { ResolvedConfig } from '../canvas/node-config-manager';

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

interface PresentationFrameOptions {
  readonly overlayResolver?: OverlayResolver | null;
  readonly baseLayoutConfig?: ResolvedConfig;
  readonly baseContainmentMode?: 'containers' | 'flat';
}

export function buildPresentationFrame(
  result: LayoutResult,
  previous?: PresentationFrame,
  lensId?: string,
  options?: PresentationFrameOptions
): PresentationFrame {
  const snapshot = layoutGraphToHierarchical(result.graph);

  // Skip coordinate normalization for runtime engines that output correctly positioned nodes
  // Runtime engines set displayMode in metadata to indicate they handle positions internally
  const displayMode = result.graph.metadata['displayMode'] as string | undefined;
  const isRuntimeEngine = displayMode === 'containment-runtime' ||
                          displayMode === 'containment-grid' ||
                          displayMode === 'runtime-flat' ||
                          displayMode === 'orthogonal';

  if (!isRuntimeEngine) {
    ensureRelativeNodeCoordinates(snapshot.nodes, 0, 0);
  }

  if (options?.overlayResolver) {
    applyOverlayToSnapshot(
      snapshot.nodes,
      snapshot.edges,
      options.overlayResolver,
      options.baseLayoutConfig,
      options.baseContainmentMode ?? 'containers'
    );
  }


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

const DEFAULT_BASE_LAYOUT: ResolvedConfig = {
  layoutStrategy: 'grid',
  layoutOptions: {},
  renderStyle: {
    nodeMode: 'container',
    edgeRouting: 'orthogonal',
    showContainsEdges: false
  }
};

function applyOverlayToSnapshot(
  nodes: HierarchicalNode[],
  edges: Edge[],
  resolver: OverlayResolver,
  baseLayoutConfig?: ResolvedConfig,
  baseContainmentMode: 'containers' | 'flat' = 'containers'
): void {
  const resolvedBaseLayout = baseLayoutConfig ? cloneResolvedConfig(baseLayoutConfig) : cloneResolvedConfig(DEFAULT_BASE_LAYOUT);

  const traverse = (node: HierarchicalNode, ancestors: string[]): void => {
    const nodeId = node.GUID ?? node.id;
    if (!nodeId) {
      return;
    }

    const baseStyle = createNodeStyleSnapshot(node);
    const profile = resolver.resolveNode({
      nodeId,
      ancestorIds: ancestors,
      baseStyle,
      baseLayout: cloneResolvedConfig(resolvedBaseLayout),
      baseContainmentMode,
      baseVisibility: node.visible === false ? 'hidden' : 'visible'
    });

    applyResolvedNodeProfile(node, profile);

    const nextAncestors = ancestors.concat(nodeId);
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child, nextAncestors));
    }
  };

  nodes.forEach(node => traverse(node, []));

  edges.forEach(edge => {
    const baseStyle = createEdgeStyleSnapshot(edge);
    const profile = resolver.resolveEdge({
      edgeId: edge.id,
      baseStyle,
      baseVisibility: edge.metadata?.['visible'] === false ? 'hidden' : 'visible'
    });
    applyResolvedEdgeProfile(edge, profile);
  });
}

function cloneResolvedConfig(config: ResolvedConfig): ResolvedConfig {
  return {
    layoutStrategy: config.layoutStrategy,
    layoutOptions: { ...(config.layoutOptions ?? {}) },
    renderStyle: {
      nodeMode: config.renderStyle.nodeMode,
      edgeRouting: config.renderStyle.edgeRouting,
      showContainsEdges: config.renderStyle.showContainsEdges
    }
  };
}

function createNodeStyleSnapshot(node: HierarchicalNode): NodeStyleSnapshot {
  const metadata = node.metadata ?? {};
  const overrides = (metadata['styleOverrides'] as Record<string, unknown> | undefined) ?? {};
  const shape = (overrides['shape'] as NodeStyleSnapshot['shape']) ?? (metadata['shape'] as NodeStyleSnapshot['shape']) ?? 'rounded';
  const cornerRadius = (overrides['cornerRadius'] as number | undefined) ?? (metadata['cornerRadius'] as number | undefined) ?? 12;
  const labelVisible = (overrides['labelVisible'] as boolean | undefined) ?? (metadata['labelVisible'] as boolean | undefined) ?? true;

  return {
    fill: node.style.fill,
    stroke: node.style.stroke,
    icon: node.style.icon,
    shape,
    cornerRadius,
    labelVisible
  };
}

function createEdgeStyleSnapshot(edge: Edge): EdgeStyleOverrides {
  const stroke = edge.style?.stroke ?? '#6b7280';
  const strokeWidth = edge.style?.strokeWidth ?? 2;
  const dashArray = edge.style?.strokeDashArray ?? null;
  const metadata = edge.metadata ?? {};
  const labelVisible = metadata['labelVisible'] === undefined ? true : Boolean(metadata['labelVisible']);

  return {
    stroke,
    strokeWidth,
    strokeDashArray: Array.isArray(dashArray) ? [...dashArray] : dashArray ?? undefined,
    label: edge.label,
    labelVisible
  };
}

function applyResolvedNodeProfile(node: HierarchicalNode, profile: ResolvedNodeProfile): void {
  node.style = {
    ...node.style,
    fill: profile.style.fill,
    stroke: profile.style.stroke,
    icon: profile.style.icon
  };

  node.visible = profile.visibility !== 'hidden';

  const metadata: Record<string, unknown> = { ...(node.metadata ?? {}) };
  metadata['visible'] = node.visible;
  metadata['containmentMode'] = profile.containmentMode;
  metadata['labelVisible'] = profile.style.labelVisible;
  metadata['shape'] = profile.style.shape;
  metadata['cornerRadius'] = profile.style.cornerRadius;

  const existingOverrides = (metadata['styleOverrides'] as NodeStyleOverrides | undefined) ?? {};
  const nextOverrides: NodeStyleOverrides = {
    ...existingOverrides,
    fill: profile.style.fill,
    stroke: profile.style.stroke,
    icon: profile.style.icon,
    labelVisible: profile.style.labelVisible,
    shape: profile.style.shape,
    cornerRadius: profile.style.cornerRadius
  };
  metadata['styleOverrides'] = nextOverrides;

  node.metadata = metadata;
}

function applyResolvedEdgeProfile(edge: Edge, profile: ResolvedEdgeProfile): void {
  edge.style = {
    ...edge.style,
    stroke: profile.style.stroke ?? edge.style?.stroke ?? '#6b7280',
    strokeWidth: profile.style.strokeWidth ?? edge.style?.strokeWidth ?? 2,
    strokeDashArray: profile.style.strokeDashArray !== undefined
      ? profile.style.strokeDashArray
      : edge.style?.strokeDashArray ?? null
  };

  if (profile.style.label !== undefined) {
    edge.label = profile.style.label ?? '';
  }

  edge.metadata = {
    ...(edge.metadata ?? {}),
    visible: profile.visibility !== 'hidden',
    labelVisible: profile.style.labelVisible !== undefined ? profile.style.labelVisible : edge.metadata?.['labelVisible']
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
