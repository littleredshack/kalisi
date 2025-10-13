import { ViewPresetDescriptor, ViewPresetRegistry, defaultPresetSelector } from '../../graph/view-presets';
import { CanvasData } from '../types';
import { ViewPresetSelector } from '../../graph/view-presets';

export interface ResolvedViewPreset {
  readonly preset: ViewPresetDescriptor;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly sourcePresetId: string;
  readonly overrides?: Partial<ViewPresetDescriptor> | null;
}

export class ViewPresetManager {
  private selector: ViewPresetSelector;
  private activePresetId: string | null = null;
  private overrides: Partial<ViewPresetDescriptor> | null = null;

  constructor(selector: ViewPresetSelector = defaultPresetSelector) {
    this.selector = selector;
  }

  setSelector(selector: ViewPresetSelector): void {
    this.selector = selector;
  }

  setActivePresetId(presetId: string | null): void {
    this.activePresetId = presetId;
  }

  getActivePresetId(): string | null {
    return this.activePresetId;
  }

  applyOverrides(overrides: Partial<ViewPresetDescriptor> | null): void {
    this.overrides = overrides;
  }

  resolveFromCanvasData(data: CanvasData, presetId?: string): ResolvedViewPreset | null {
    const metadata = this.collectMetadata(data);
    const requestedId = presetId ?? this.activePresetId;
    const basePreset =
      requestedId
        ? ViewPresetRegistry.get(requestedId)
        : this.selector(metadata) ?? ViewPresetRegistry.get('containment-insight');

    if (!basePreset) {
      return null;
    }

    this.activePresetId = basePreset.id;
    const effectivePreset = this.overrides ? mergePresets(basePreset, this.overrides) : basePreset;

    return {
      preset: effectivePreset,
      metadata,
      sourcePresetId: basePreset.id,
      overrides: this.overrides
    };
  }

  private collectMetadata(data: CanvasData): Readonly<Record<string, unknown>> {
    const aggregate: Record<string, unknown> = {
      nodeCount: data.nodes.length,
      edgeCount: data.edges.length
    };

    const viewType = data.metadata?.['viewType'];
    if (typeof viewType === 'string') {
      aggregate['viewType'] = viewType;
    }

    const tags = new Set<string>();
    data.nodes.forEach(node => {
      if (Array.isArray(node.metadata?.['tags'])) {
        (node.metadata?.['tags'] as string[]).forEach(tag => tags.add(tag));
      }
      const type = node.metadata?.['type'] ?? node.type;
      if (typeof type === 'string') {
        tags.add(type);
      }
    });

    aggregate['tags'] = Array.from(tags);

    const displayMode = data.metadata?.['displayMode'];
    if (typeof displayMode === 'string') {
      aggregate['displayMode'] = displayMode;
    }

    const dominantView = this.detectDominantMetadata(data);
    if (dominantView) {
      aggregate['dominantView'] = dominantView;
    }

    return aggregate;
  }

  private detectDominantMetadata(data: CanvasData): string | undefined {
    const containmentNodes = data.nodes.filter(node => node.children && node.children.length > 0);
    const hasContainment = containmentNodes.length > 0;

    const hasTimeline = data.nodes.some(node => node.metadata?.['lane'] || node.metadata?.['timestamp']);
    const hasForceMetadata = data.nodes.some(node => node.metadata?.['community'] || node.metadata?.['weight']);

    if (hasTimeline) {
      return 'timeline';
    }

    if (hasForceMetadata) {
      return 'force';
    }

    if (hasContainment) {
      return 'containment';
    }

    return undefined;
  }
}

function mergePresets(
  base: ViewPresetDescriptor,
  overrides: Partial<ViewPresetDescriptor>
): ViewPresetDescriptor {
  const clone = clonePreset(base);
  return deepMerge(clone, overrides);
}

function clonePreset(preset: ViewPresetDescriptor): ViewPresetDescriptor {
  const structured = (globalThis as unknown as { structuredClone?: <T>(input: T) => T }).structuredClone;
  if (typeof structured === 'function') {
    return structured(preset);
  }
  return JSON.parse(JSON.stringify(preset)) as ViewPresetDescriptor;
}

function deepMerge(target: any, source: any): any {
  if (!source || typeof source !== 'object') {
    return target;
  }

  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const current = target[key];

    if (Array.isArray(value)) {
      target[key] = [...value];
      return;
    }

    if (typeof value === 'object') {
      const base = current && typeof current === 'object' ? current : {};
      target[key] = deepMerge({ ...base }, value);
      return;
    }

    target[key] = value;
  });

  return target;
}
