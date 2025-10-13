import { LayoutGraph, LayoutResult } from '../layouts/core/layout-contract';
import {
  EdgePresentation,
  NodePresentation,
  resolveEdgePresentation,
  resolveNodePresentation
} from './preset-presentation';
import { PresetEdgeStyle, PresetNodeStyle, ViewPresetDescriptor } from './view-presets';

export interface GraphStoreSnapshot {
  readonly version: number;
  readonly graph: LayoutGraph;
}

export interface GraphPresentationSnapshot {
  readonly nodes: Readonly<Record<string, NodePresentation>>;
  readonly edges: Readonly<Record<string, EdgePresentation>>;
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

  computePresentation(preset: ViewPresetDescriptor): GraphPresentationSnapshot {
    const palette = preset.style?.palette ?? {};
    const nodeStyle = normaliseNodeStyle(preset.style?.node);
    const edgeStyle = normaliseEdgeStyle(preset.style?.edge);

    const nodes: Record<string, NodePresentation> = {};
    Object.values(this.snapshot.graph.nodes).forEach(node => {
      nodes[node.id] = resolveNodePresentation(
        { ...(node.metadata ?? {}) },
        nodeStyle,
        palette
      );
    });

    const edges: Record<string, EdgePresentation> = {};
    Object.values(this.snapshot.graph.edges).forEach(edge => {
      edges[edge.id] = resolveEdgePresentation(
        { ...(edge.metadata ?? {}) },
        edgeStyle,
        palette
      );
    });

    return { nodes, edges };
  }
}

function normaliseNodeStyle(style: PresetNodeStyle | undefined): PresetNodeStyle | undefined {
  if (!style) {
    return undefined;
  }
  const icon = style.icon ?? (style.iconField ? { field: style.iconField } : undefined);
  const badge = style.badge ?? (style.badgeField ? { field: style.badgeField } : undefined);
  const size = style.size ?? (style.sizeBy ? { field: style.sizeBy } : undefined);
  return {
    ...style,
    icon,
    badge,
    size
  };
}

function normaliseEdgeStyle(style: PresetEdgeStyle | undefined): PresetEdgeStyle | undefined {
  if (!style) {
    return undefined;
  }
  const width =
    style.width ?? (style.widthBy
      ? {
          field: style.widthBy,
          min: 1,
          max: 6,
          default: 2
        }
      : undefined);
  const label = style.label ?? (style.labelField ? { field: style.labelField } : undefined);
  const color = style.color ?? (style.colorBy ? { field: style.colorBy } : undefined);
  return {
    ...style,
    width,
    label,
    color
  };
}
