import { LayoutPriority } from '../layouts/core/layout-orchestrator';

export interface ViewPreset {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly layout: string;
  readonly renderer: string;
  readonly lensId?: string;
  readonly defaultDisplayMode?: string;
  readonly engineOptions?: Readonly<Record<string, unknown>>;
  readonly style?: PresetStyle;
  readonly layoutHints?: PresetLayoutHints;
}

export interface PresetStyle {
  readonly palette?: PresetPalette;
  readonly colorRamps?: Readonly<Record<string, ReadonlyArray<string>>>;
  readonly node?: PresetNodeStyle;
  readonly edge?: PresetEdgeStyle;
  readonly background?: string;
}

export interface PresetPalette {
  readonly primary?: string;
  readonly secondary?: string;
  readonly accent?: string;
  readonly muted?: string;
  readonly positive?: string;
  readonly warning?: string;
  readonly danger?: string;
}

export interface PresetColorStyle {
  readonly field?: string;
  readonly map?: Readonly<Record<string, string>>;
  readonly default?: string;
  readonly gradient?: {
    readonly stops: ReadonlyArray<{ value: number; color: string }>;
    readonly min?: number;
    readonly max?: number;
  };
}

export interface PresetIconStyle {
  readonly field?: string;
  readonly map?: Readonly<Record<string, string>>;
  readonly default?: string;
}

export interface PresetBadgeStyle {
  readonly field?: string;
  readonly palette?: Readonly<Record<string, string>>;
  readonly map?: Readonly<Record<string, string>>;
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface PresetLabelStyle {
  readonly field?: string;
  readonly template?: string;
  readonly visible?: boolean;
  readonly maxLength?: number;
  readonly fallback?: string;
}

export interface PresetSizeStyle {
  readonly field?: string;
  readonly min?: number;
  readonly max?: number;
  readonly default?: number;
}

export interface PresetDashStyle {
  readonly field?: string;
  readonly values?: ReadonlyArray<string>;
  readonly pattern?: ReadonlyArray<number>;
}

export interface PresetNodeStyle {
  readonly baseClass?: string;
  readonly color?: PresetColorStyle;
  readonly borderColor?: PresetColorStyle;
  readonly icon?: PresetIconStyle;
  readonly badge?: PresetBadgeStyle;
  readonly label?: PresetLabelStyle;
  readonly size?: PresetSizeStyle;
  readonly colorBy?: string; // legacy support
  readonly badgeField?: string; // legacy support
  readonly iconField?: string; // legacy support
  readonly sizeBy?: string; // legacy support
}

export interface PresetEdgeStyle {
  readonly baseClass?: string;
  readonly label?: PresetLabelStyle;
  readonly color?: PresetColorStyle;
  readonly width?: PresetSizeStyle;
  readonly dash?: PresetDashStyle;
  readonly colorBy?: string; // legacy support
  readonly widthBy?: string; // legacy support
  readonly labelField?: string; // legacy support
}

export interface PresetLayoutHints {
  readonly displayMode?: string;
  readonly spacing?: number;
  readonly primaryAxis?: 'horizontal' | 'vertical';
  readonly align?: 'grid' | 'timeline' | 'force';
  readonly columns?: number;
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
    defaultDisplayMode: 'containment',
    layoutHints: {
      displayMode: 'containment',
      align: 'grid',
      spacing: 48,
      primaryAxis: 'horizontal'
    },
    priority: 'high',
    style: {
      palette: {
        primary: '#60a5fa',
        secondary: '#8b5cf6',
        accent: '#34d399',
        muted: '#1f2937',
        warning: '#facc15',
        danger: '#f97316'
      },
      colorRamps: {
        status: ['#34d399', '#facc15', '#f97316'],
        hierarchy: ['#172554', '#1d4ed8', '#60a5fa']
      },
      node: {
        label: { field: 'name', maxLength: 32, visible: true },
        color: {
          field: 'type',
          map: {
            Service: '#60a5fa',
            Database: '#34d399',
            Team: '#8b5cf6',
            Application: '#38bdf8'
          },
          default: '#1f2937'
        },
        borderColor: {
          field: 'status',
          map: {
            Healthy: '#34d399',
            Warning: '#facc15',
            Critical: '#f97316'
          },
          default: '#4b5563'
        },
        icon: {
          field: 'type',
          map: {
            Service: '🛠',
            Database: '🗄',
            Team: '👥',
            Application: '📦'
          },
          default: '📁'
        },
        badge: {
          field: 'status',
          palette: {
            Healthy: '#22c55e',
            Warning: '#facc15',
            Critical: '#f97316'
          }
        },
        size: {
          field: 'capacity',
          min: 180,
          max: 260,
          default: 220
        },
        baseClass: 'preset-node--containment'
      },
      edge: {
        label: { field: 'relationshipType', visible: false },
        color: {
          field: 'relationshipType',
          map: {
            Contains: '#60a5fa',
            DependsOn: '#8b5cf6'
          },
          default: '#4b5563'
        },
        width: {
          field: 'strength',
          min: 1.5,
          max: 4,
          default: 2
        },
        dash: {
          field: 'relationshipType',
          values: ['Monitors', 'Indirect'],
          pattern: [6, 4]
        },
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
    defaultDisplayMode: 'force',
    layoutHints: {
      displayMode: 'force',
      spacing: 120,
      primaryAxis: 'horizontal'
    },
    priority: 'normal',
    style: {
      palette: {
        primary: '#38bdf8',
        secondary: '#f472b6',
        accent: '#facc15',
        muted: '#0f172a',
        warning: '#f97316'
      },
      colorRamps: {
        community: ['#38bdf8', '#f472b6', '#facc15'],
        strength: ['#1e293b', '#64748b', '#f8fafc']
      },
      node: {
        label: { field: 'name', maxLength: 40, visible: true },
        color: {
          field: 'community',
          map: {
            Core: '#38bdf8',
            Edge: '#f472b6',
            Gateway: '#facc15'
          },
          default: '#1d4ed8'
        },
        icon: {
          field: 'role',
          map: {
            API: '🌐',
            Worker: '⚙️',
            Queue: '🌀'
          },
          default: '🔹'
        },
        size: {
          field: 'weight',
          min: 140,
          max: 240,
          default: 200
        },
        badge: {
          field: 'health',
          palette: {
            Healthy: '#22c55e',
            Warning: '#facc15',
            Critical: '#f97316'
          }
        }
      },
      edge: {
        color: {
          field: 'relationshipType',
          map: {
            Calls: '#38bdf8',
            Streams: '#f472b6'
          },
          default: '#475569'
        },
        width: {
          field: 'strength',
          min: 1,
          max: 5,
          default: 2.5
        },
        label: { field: 'relationshipType', visible: false }
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
    defaultDisplayMode: 'timeline',
    layoutHints: {
      displayMode: 'timeline',
      align: 'timeline',
      primaryAxis: 'horizontal',
      spacing: 64
    },
    style: {
      palette: {
        primary: '#f97316',
        secondary: '#22c55e',
        accent: '#eab308',
        muted: '#111827'
      },
      colorRamps: {
        state: ['#f59e0b', '#22c55e', '#ef4444', '#a855f7'],
        dependency: ['#64748b', '#ef4444']
      },
      node: {
        label: { field: 'name', maxLength: 48, visible: true },
        color: {
          field: 'lane',
          map: {
            Planning: '#22c55e',
            Delivery: '#f97316',
            Review: '#6366f1'
          },
          default: '#0f172a'
        },
        badge: {
          field: 'state',
          palette: {
            Pending: '#f59e0b',
            Active: '#22c55e',
            Blocked: '#ef4444',
            Complete: '#a855f7'
          }
        },
        icon: {
          field: 'state',
          map: {
            Pending: '🧭',
            Active: '🔥',
            Blocked: '🚧',
            Complete: '✅'
          },
          default: '🗂'
        }
      },
      edge: {
        color: {
          field: 'dependency',
          map: {
            Hard: '#ef4444',
            Soft: '#facc15'
          },
          default: '#64748b'
        },
        dash: {
          field: 'dependency',
          values: ['Soft'],
          pattern: [3, 6]
        },
        label: { field: 'dependency', visible: false },
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

  if (typeof metadata['displayMode'] === 'string') {
    const desiredMode = metadata['displayMode'];
    const preset = BUILT_IN_PRESETS.find(item => item.defaultDisplayMode === desiredMode);
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
