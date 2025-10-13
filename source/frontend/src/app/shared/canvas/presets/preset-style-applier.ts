import { CanvasData, Edge, HierarchicalNode } from '../types';
import { PresetEdgeStyle, PresetNodeStyle, PresetPalette, ViewPresetDescriptor } from '../../graph/view-presets';
import {
  EdgePresentation,
  NodePresentation,
  resolveEdgePresentation,
  resolveNodePresentation
} from '../../graph/preset-presentation';

function cloneCanvasData(data: CanvasData): CanvasData {
  const structured = (globalThis as unknown as { structuredClone?: <T>(input: T) => T }).structuredClone;
  if (typeof structured === 'function') {
    return structured(data);
  }
  return JSON.parse(JSON.stringify(data));
}

export function applyPresetStyles(data: CanvasData, preset: ViewPresetDescriptor): CanvasData {
  const cloned = cloneCanvasData(data);
  const palette = preset.style?.palette ?? {};

  cloned.nodes = cloned.nodes.map(node => applyNodeStyle(node, preset.style?.node, palette));
  cloned.edges = cloned.edges.map(edge => applyEdgeStyle(edge, preset.style?.edge, palette));

  if (cloned.originalEdges && cloned.originalEdges.length > 0) {
    cloned.originalEdges = cloned.originalEdges.map(edge => applyEdgeStyle(edge, preset.style?.edge, palette));
  }

  const metadata: Record<string, unknown> = { ...(cloned.metadata ?? {}), presetId: preset.id };
  if (preset.layoutHints) {
    metadata['layoutHints'] = preset.layoutHints;
  }

  if (preset.style?.background) {
    metadata['background'] = preset.style.background;
  }

  cloned.metadata = metadata;

  return cloned;
}

function applyNodeStyle(node: HierarchicalNode, style: PresetNodeStyle | undefined, palette: PresetPalette): HierarchicalNode {
  const mutated = node;
  mutated.metadata = mutated.metadata ? { ...mutated.metadata } : {};
  mutated.style = mutated.style ? { ...mutated.style } : { fill: '#1f2937', stroke: '#4b5563' };

  const normalisedStyle = normaliseNodeStyle(style);
  const presentation = resolveNodePresentation(mutated.metadata ?? {}, normalisedStyle, palette);
  applyNodePresentation(mutated, presentation);

  if (mutated.children && mutated.children.length > 0) {
    mutated.children = mutated.children.map(child => applyNodeStyle(child, style, palette));
  }

  return mutated;
}

function applyEdgeStyle(edge: Edge, style: PresetEdgeStyle | undefined, palette: PresetPalette): Edge {
  const mutated = edge;
  mutated.metadata = mutated.metadata ? { ...mutated.metadata } : {};
  mutated.style = mutated.style ? { ...mutated.style } : { stroke: '#6ea8fe', strokeWidth: 2 };

  const normalisedStyle = normaliseEdgeStyle(style);
  const presentation = resolveEdgePresentation(mutated.metadata ?? {}, normalisedStyle, palette);
  applyEdgePresentation(mutated, presentation);

  return mutated;
}

function applyNodePresentation(node: HierarchicalNode, presentation: NodePresentation): void {
  const metadata = ensureMetadata(node);

  node.style.fill = presentation.fill ?? node.style.fill ?? '#1f2937';
  node.style.stroke = presentation.stroke ?? node.style.stroke ?? '#4b5563';

  if (presentation.icon !== undefined) {
    node.style.icon = presentation.icon;
  }

  if (presentation.label !== undefined) {
    node.text = presentation.label;
  }

  if (presentation.badges && presentation.badges.length > 0) {
    metadata['badges'] = presentation.badges.map(badge => ({
      text: badge.text,
      color: badge.color ?? '#64748b'
    }));
  } else if (metadata['badges']) {
    delete metadata['badges'];
  }

  if (typeof presentation.width === 'number') {
    node.width = presentation.width;
  }
  if (typeof presentation.height === 'number') {
    node.height = presentation.height;
  }

  if (presentation.labelVisible !== undefined) {
    metadata['labelVisible'] = presentation.labelVisible;
  }

  const currentPresentation = (metadata['presentation'] as Record<string, unknown>) ?? {};
  metadata['presentation'] = {
    ...currentPresentation,
    node: presentation
  };
}

function applyEdgePresentation(edge: Edge, presentation: EdgePresentation): void {
  const metadata = ensureMetadata(edge);

  edge.style.stroke = presentation.stroke ?? edge.style.stroke ?? '#6ea8fe';

  if (typeof presentation.strokeWidth === 'number') {
    edge.style.strokeWidth = Math.max(1, presentation.strokeWidth);
  }

  if (presentation.strokeDashArray !== undefined) {
    edge.style.strokeDashArray = presentation.strokeDashArray ? [...presentation.strokeDashArray] : null;
  }

  if (presentation.label !== undefined) {
    edge.label = presentation.label;
  }

  if (presentation.labelVisible !== undefined) {
    metadata['labelVisible'] = presentation.labelVisible;
  }

  const currentPresentation = (metadata['presentation'] as Record<string, unknown>) ?? {};
  metadata['presentation'] = {
    ...currentPresentation,
    edge: presentation
  };
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

function ensureMetadata(target: { metadata?: Record<string, unknown> }): Record<string, unknown> {
  if (!target.metadata) {
    target.metadata = {};
  }
  return target.metadata as Record<string, unknown>;
}
