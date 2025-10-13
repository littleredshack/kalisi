import { ViewPresetDescriptor, ViewPresetRegistry, defaultPresetSelector } from '../../graph/view-presets';
import { CanvasData } from '../types';
import { ViewPresetSelector } from '../../graph/view-presets';

export interface ResolvedViewPreset {
  readonly preset: ViewPresetDescriptor;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export class ViewPresetManager {
  private selector: ViewPresetSelector;

  constructor(selector: ViewPresetSelector = defaultPresetSelector) {
    this.selector = selector;
  }

  setSelector(selector: ViewPresetSelector): void {
    this.selector = selector;
  }

  resolveFromCanvasData(data: CanvasData): ResolvedViewPreset | null {
    const metadata = this.collectMetadata(data);
    const preset = this.selector(metadata) ?? ViewPresetRegistry.get('containment-insight');
    if (!preset) {
      return null;
    }
    return {
      preset,
      metadata
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
