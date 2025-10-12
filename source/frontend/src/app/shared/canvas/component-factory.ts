import { ILayoutEngine } from './layout';
import { IRenderer } from './renderer';
import { LayoutModuleRegistry, LayoutModuleDescriptor } from '../layouts/layout-module-registry';

class RuntimeLayoutPlaceholder implements ILayoutEngine {
  constructor(private readonly engineName: string) {}

  applyLayout(): never {
    throw new Error(`[RuntimeLayoutPlaceholder] applyLayout invoked for engine "${this.engineName}". This placeholder should only be used for metadata.`);
  }

  getName(): string {
    return this.engineName;
  }
}

export interface ComponentFactoryResult {
  renderer: IRenderer;
  module: LayoutModuleDescriptor;
  runtimeEngine: string;
  rendererId: string;
  legacyLayout?: ILayoutEngine;
}

/**
 * Factory for creating layout engines based on ViewNode specifications
 */
export class LayoutEngineFactory {

  /**
   * Create layout engine based on ViewNode layoutEngine property
   */
  static createLegacyLayout(layoutEngineType: string): ILayoutEngine | undefined {
    const module = LayoutModuleRegistry.getModule(layoutEngineType);
    return module?.createLegacyLayout?.();
  }
  
  /**
   * Get available layout engine types
   */
  static getAvailableTypes(): string[] {
    return LayoutModuleRegistry.listModules().map(module => module.id);
  }
}

/**
 * Factory for creating renderers based on ViewNode specifications
 */
export class RendererFactory {
  
  /**
   * Create renderer based on ViewNode renderer property
   */
  static create(rendererType: string): IRenderer {
    const lookup = LayoutModuleRegistry.getRenderer(rendererType);
    if (lookup) {
      return lookup.renderer.factory();
    }
    const fallbackModule = LayoutModuleRegistry.getModule('containment-grid');
    const fallbackRenderer = fallbackModule?.renderers.find(renderer => renderer.id === fallbackModule.defaultRenderer);
    console.warn(`[RendererFactory] Unknown renderer type: ${rendererType}, falling back to ${fallbackRenderer?.id ?? 'composable-flat'}`);
    return (fallbackRenderer ?? LayoutModuleRegistry.getRenderer('composable-flat')?.renderer ?? {
      factory: () => {
        throw new Error('No renderer registered for fallback "composable-flat".');
      }
    }).factory();
  }
  
  /**
   * Get available renderer types
   */
  static getAvailableTypes(): string[] {
    return LayoutModuleRegistry.listRenderers().map(entry => entry.renderer.id);
  }
}

/**
 * Combined factory for creating layout engine and renderer pairs
 */
export class ComponentFactory {
  
  /**
   * Create layout engine and renderer based on ViewNode properties
   */
  static createComponents(
    layoutEngineType: string = 'hierarchical',
    rendererType: string = 'shape'
  ): ComponentFactoryResult {
    const module = LayoutModuleRegistry.getModule(layoutEngineType) ?? LayoutModuleRegistry.getModule('containment-grid');
    const runtimeEngine = module?.runtimeEngine ?? 'containment-grid';

    const targetRendererId = rendererType === 'shape' || !rendererType
      ? module?.defaultRenderer ?? 'composable-hierarchical'
      : rendererType;

    const rendererLookup = LayoutModuleRegistry.getRenderer(targetRendererId)
      ?? (module ? { module, renderer: module.renderers.find(item => item.id === module.defaultRenderer)! } : undefined)
      ?? LayoutModuleRegistry.getRenderer('composable-hierarchical');

    const resolvedModule = rendererLookup?.module ?? module ?? LayoutModuleRegistry.getModule('containment-grid')!;
    const resolvedRenderer = rendererLookup?.renderer ?? resolvedModule.renderers[0];

    return {
      legacyLayout: resolvedModule.createLegacyLayout?.(),
      renderer: resolvedRenderer.factory(),
      module: resolvedModule,
      runtimeEngine: resolvedModule.runtimeEngine,
      rendererId: resolvedRenderer.id
    };
  }
  
  /**
   * Create components from ViewNode object using dynamic properties
   */
  static createFromViewNode(viewNode: any): ComponentFactoryResult {
    let layoutEngineType = viewNode.layout_engine ||
                              viewNode.layoutEngine ||
                              (viewNode.properties && viewNode.properties.layoutEngine) ||
                              'hierarchical';
    let rendererType = viewNode.renderer ||
                       (viewNode.properties && viewNode.properties.renderer) ||
                       'shape';
    if (viewNode.name === 'Code Model') {
      layoutEngineType = 'code-model-tree';
      rendererType = 'composable-tree';
    }
    console.log('🎭 DEBUG: ComponentFactory.createFromViewNode:', {
      viewNodeId: viewNode.id,
      viewNodeName: viewNode.name,
      layoutEngineType,
      rendererType
    });

    return this.createComponents(layoutEngineType, rendererType);
  }
}
