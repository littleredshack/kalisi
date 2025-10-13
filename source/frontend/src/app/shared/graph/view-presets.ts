import { LayoutPriority } from '../layouts/core/layout-orchestrator';

export interface ViewPreset {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly layout: string;
  readonly renderer: string;
  readonly lensId?: string;
  readonly engineOptions?: Readonly<Record<string, unknown>>;
  readonly style?: PresetStyle;
}

export interface PresetStyle {
  readonly palette?: PresetPalette;
  readonly node?: PresetNodeStyle;
  readonly edge?: PresetEdgeStyle;
  readonly background?: string;
}

export interface PresetPalette {
  readonly primary?: string;
  readonly secondary?: string;
  readonly accent?: string;
  readonly muted?: string;
}

export interface PresetNodeStyle {
  readonly baseClass?: string;
  readonly iconField?: string;
  readonly colorBy?: string;
  readonly badgeField?: string;
  readonly sizeBy?: string;
}

export interface PresetEdgeStyle {
  readonly baseClass?: string;
  readonly labelField?: string;
  readonly colorBy?: string;
  readonly widthBy?: string;
}

export interface ViewPresetDescriptor extends ViewPreset {
  readonly tags?: ReadonlyArray<string>;
  readonly priority?: LayoutPriority;
}

const BUILT_IN_PRESETS: ViewPresetDescriptor[] = [
  {
    id: 'containment-insight',
    label: 'Containment Insight',
    description: 'Multi-level containment grid with interactive drill-down.',
    layout: 'containment-grid',
    renderer: 'composable-hierarchical',
    lensId: 'active-containment',
    priority: 'high',
    style: {
      palette: {
        primary: '#60a5fa',
        secondary: '#8b5cf6',
        accent: '#34d399',
        muted: '#1f2937'
      },
      node: {
        colorBy: 'type',
        badgeField: 'status',
        iconField: 'icon'
      },
      edge: {
        baseClass: 'edge--containment'
      },
      background: '#0b1120'
    }
  },
  {
    id: 'force-explore',
    label: 'Force Explore',
    description: 'Organic force-directed layout for exploratory analysis.',
    layout: 'force-directed',
    renderer: 'composable-flat',
    priority: 'normal',
    style: {
      palette: {
        primary: '#38bdf8',
        secondary: '#f472b6',
        accent: '#facc15'
      },
      node: {
        sizeBy: 'weight',
        colorBy: 'community'
      },
      edge: {
        colorBy: 'relationshipType',
        widthBy: 'strength'
      },
      background: '#020617'
    }
  },
  {
    id: 'timeline-flow',
    label: 'Timeline Flow',
    description: 'Lane-based layout to visualise sequences and dependencies.',
    layout: 'orthogonal',
    renderer: 'composable-containment-orthogonal',
    lensId: 'full-graph',
    style: {
      palette: {
        primary: '#f97316',
        secondary: '#22c55e',
        accent: '#eab308'
      },
      node: {
        colorBy: 'lane',
        badgeField: 'state'
      },
      edge: {
        baseClass: 'edge--timeline'
      },
      background: '#111827'
    }
  }
];

const presetMap = new Map<string, ViewPresetDescriptor>();
BUILT_IN_PRESETS.forEach(preset => presetMap.set(preset.id, preset));

export const ViewPresetRegistry = {
  list(): ReadonlyArray<ViewPresetDescriptor> {
    return BUILT_IN_PRESETS;
  },

  get(id: string): ViewPresetDescriptor | undefined {
    return presetMap.get(id);
  }
};

export type ViewPresetSelector = (metadata: Readonly<Record<string, unknown>>) => ViewPresetDescriptor | undefined;

export const defaultPresetSelector: ViewPresetSelector = metadata => {
  const viewType = (metadata['viewType'] as string | undefined)?.toLowerCase();
  if (viewType) {
    const direct = presetMap.get(viewType);
    if (direct) {
      return direct;
    }
  }

  const tags = Array.isArray(metadata['tags'])
    ? (metadata['tags'] as ReadonlyArray<unknown>).filter((tag): tag is string => typeof tag === 'string')
    : [];

  for (const tag of tags) {
    const preset = BUILT_IN_PRESETS.find(item => item.tags?.includes(tag));
    if (preset) {
      return preset;
    }
  }

  if (metadata['displayMode'] === 'timeline') {
    return presetMap.get('timeline-flow');
  }

  if (metadata['displayMode'] === 'force') {
    return presetMap.get('force-explore');
  }

  return presetMap.get('containment-insight');
};
