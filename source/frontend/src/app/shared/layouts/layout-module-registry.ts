import { IRenderer } from '../canvas/renderer';
import { LayoutCapabilities } from './core/layout-contract';
import { RuntimeContainmentRenderer } from '../composable/renderers/runtime-containment-renderer';
import { RuntimeFlatRenderer } from '../composable/renderers/runtime-flat-renderer';

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
    id: 'containment-runtime',
    label: 'Runtime Containment',
    aliases: ['containment-runtime', 'containment-live', 'containment', 'hierarchical', 'grid'],
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
        factory: () => new RuntimeFlatRenderer(),
        tags: ['runtime', 'flat', 'orthogonal']
      }
    ]
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
