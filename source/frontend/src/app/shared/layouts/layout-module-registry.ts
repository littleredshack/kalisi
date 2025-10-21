import { IRenderer } from '../canvas/renderer';
import { LayoutCapabilities } from './core/layout-contract';
import { ComposableHierarchicalRenderer } from '../composable/renderers/composable-hierarchical-renderer';
import { ComposableContainmentOrthogonalRenderer } from '../composable/renderers/composable-containment-orthogonal-renderer';
import { ComposableFlatRenderer } from '../composable/renderers/composable-flat-renderer';
import { ComposableTreeRenderer } from '../composable/renderers/composable-tree-renderer';
import { ComposableTreeTableRenderer } from '../composable/renderers/composable-tree-table-renderer';
import { RuntimeContainmentRenderer } from '../composable/renderers/runtime-containment-renderer';

export interface LayoutRendererDescriptor {
  readonly id: string;
  readonly label: string;
  readonly factory: () => IRenderer;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
}

export interface LayoutModuleDescriptor {
  readonly id: string;
  readonly label: string;
  readonly aliases: ReadonlyArray<string>;
  readonly runtimeEngine: string;
  readonly defaultRenderer: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly capabilities: LayoutCapabilities;
  readonly renderers: ReadonlyArray<LayoutRendererDescriptor>;
  // createLegacyLayout removed - all modules use runtime processing
}

export interface LayoutModuleLookup {
  readonly module: LayoutModuleDescriptor;
  readonly renderer: LayoutRendererDescriptor;
}

const MODULES: LayoutModuleDescriptor[] = [
  {
    id: 'containment-grid',
    label: 'Containment Grid',
    aliases: ['containment-grid', 'hierarchical', 'grid', 'codebase-hierarchical', 'containment'],
    runtimeEngine: 'containment-grid',
    defaultRenderer: 'composable-hierarchical',
    description: 'Container-based hierarchical layout with adaptive grid packing.',
    tags: ['containers', 'hierarchy', 'adaptive'],
    capabilities: {
      supportsIncremental: true,
      deterministic: true,
      canHandleRealtime: true
    },
    renderers: [
      {
        id: 'composable-hierarchical',
        label: 'Containment Canvas',
        factory: () => new ComposableHierarchicalRenderer(),
        tags: ['containers', 'canvas']
      },
      {
        id: 'composable-containment-orthogonal',
        label: 'Orthogonal Containment',
        factory: () => new ComposableContainmentOrthogonalRenderer(),
        tags: ['orthogonal', 'edges']
      }
    ]
    // Legacy adapter removed - using runtime data processing
  },
  {
    id: 'orthogonal',
    label: 'Orthogonal Flow',
    aliases: ['orthogonal', 'containment-orthogonal'],
    runtimeEngine: 'orthogonal',
    defaultRenderer: 'composable-containment-orthogonal',
    description: 'Layered orthogonal routing for containment graphs.',
    tags: ['orthogonal', 'layers'],
    capabilities: {
      supportsIncremental: true,
      deterministic: true,
      canHandleRealtime: true
    },
    renderers: [
      {
        id: 'composable-containment-orthogonal',
        label: 'Orthogonal Renderer',
        factory: () => new ComposableContainmentOrthogonalRenderer(),
        tags: ['orthogonal']
      }
    ]
    // Legacy adapter removed - using runtime data processing
  },
  {
    id: 'containment-runtime',
    label: 'Runtime Containment',
    aliases: ['containment-runtime', 'containment-live'],
    runtimeEngine: 'containment-runtime',
    defaultRenderer: 'runtime-containment-renderer',
    description: 'Runtime containment layout with configurable rendering modes (containers or flat).',
    tags: ['runtime', 'containment', 'orthogonal', 'configurable'],
    capabilities: {
      supportsIncremental: true,
      deterministic: true,
      canHandleRealtime: true
    },
    renderers: [
      {
        id: 'runtime-containment-renderer',
        label: 'Container Mode',
        description: 'Nested boxes with hidden CONTAINS edges',
        factory: () => new RuntimeContainmentRenderer(),
        tags: ['runtime', 'containment', 'orthogonal']
      },
      {
        id: 'runtime-flat-renderer',
        label: 'Flat Mode',
        description: 'Independent nodes with visible CONTAINS edges',
        factory: () => new RuntimeContainmentRenderer(), // TODO: Replace with RuntimeFlatRenderer in Phase 3
        tags: ['runtime', 'flat', 'orthogonal']
      }
    ]
  },
  {
    id: 'force-directed',
    label: 'Force Directed',
    aliases: ['force-directed', 'force', 'flat-graph'],
    runtimeEngine: 'force-directed',
    defaultRenderer: 'composable-flat',
    description: 'Physics-inspired layout for exploration of large graphs.',
    tags: ['force', 'exploration'],
    capabilities: {
      supportsIncremental: true,
      deterministic: false,
      canHandleRealtime: true
    },
    renderers: [
      {
        id: 'composable-flat',
        label: 'Flat Graph Renderer',
        factory: () => new ComposableFlatRenderer(),
        tags: ['flat', 'physics']
      }
    ]
    // Legacy adapter removed - using runtime data processing
  },
  {
    id: 'tree',
    label: 'Tree',
    aliases: ['tree', 'code-model-tree'],
    runtimeEngine: 'tree',
    defaultRenderer: 'composable-tree',
    description: 'Indented branching layout for hierarchical trees.',
    tags: ['tree', 'hierarchy'],
    capabilities: {
      supportsIncremental: false,
      deterministic: true,
      canHandleRealtime: false
    },
    renderers: [
      {
        id: 'composable-tree',
        label: 'Tree Renderer',
        factory: () => new ComposableTreeRenderer(),
        tags: ['tree', 'hierarchy']
      }
    ]
    // Legacy adapter removed - using runtime data processing
  },
  {
    id: 'tree-table',
    label: 'Tree Table',
    aliases: ['tree-table'],
    runtimeEngine: 'tree',
    defaultRenderer: 'tree-table',
    description: 'Hybrid tree layout with tabular presentation.',
    tags: ['tree', 'table'],
    capabilities: {
      supportsIncremental: false,
      deterministic: true,
      canHandleRealtime: false
    },
    renderers: [
      {
        id: 'tree-table',
        label: 'Tree Table Renderer',
        factory: () => new ComposableTreeTableRenderer(),
        tags: ['table', 'tree']
      }
    ]
    // Legacy adapter removed - tree-table uses tree runtime engine
  },
  {
    id: 'codebase-hierarchical',
    label: 'Codebase Hierarchical',
    aliases: ['codebase-hierarchical-v1'],
    runtimeEngine: 'containment-grid',
    defaultRenderer: 'composable-hierarchical',
    description: 'Legacy hierarchical layout for codebase views.',
    tags: ['legacy', 'code'],
    capabilities: {
      supportsIncremental: false,
      deterministic: true,
      canHandleRealtime: false
    },
    renderers: [
      {
        id: 'composable-hierarchical',
        label: 'Containment Canvas',
        factory: () => new ComposableHierarchicalRenderer(),
        tags: ['legacy']
      }
    ]
    // Legacy adapter removed - uses containment-grid runtime engine
  }
];

const moduleAliasMap = new Map<string, LayoutModuleDescriptor>();
const rendererMap = new Map<string, { module: LayoutModuleDescriptor; renderer: LayoutRendererDescriptor }>();

for (const module of MODULES) {
  const aliases = new Set<string>([module.id, ...module.aliases]);
  aliases.forEach(alias => moduleAliasMap.set(alias.toLowerCase(), module));
  module.renderers.forEach(renderer => {
    rendererMap.set(renderer.id.toLowerCase(), { module, renderer });
  });
}

export const LayoutModuleRegistry = {
  getModule(idOrAlias: string | undefined): LayoutModuleDescriptor | undefined {
    if (!idOrAlias) {
      return undefined;
    }
    return moduleAliasMap.get(idOrAlias.toLowerCase());
  },

  getRenderer(id: string | undefined): LayoutModuleLookup | undefined {
    if (!id) {
      return undefined;
    }
    return rendererMap.get(id.toLowerCase());
  },

  listModules(): ReadonlyArray<LayoutModuleDescriptor> {
    return MODULES;
  },

  listRenderers(): ReadonlyArray<LayoutModuleLookup> {
    return Array.from(rendererMap.values());
  }
};
