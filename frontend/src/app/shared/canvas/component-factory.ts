import { ILayoutEngine } from './layout';
import { IRenderer } from './renderer';
import { GridLayoutEngine } from '../layouts/grid-layout';
import { FlatGraphLayoutEngine } from '../layouts/flat-graph-layout';
import { ComposableFlatRenderer } from '../composable/renderers/composable-flat-renderer';
import { ComposableHierarchicalRenderer } from '../composable/renderers/composable-hierarchical-renderer';
import { ComposableContainmentOrthogonalRenderer } from '../composable/renderers/composable-containment-orthogonal-renderer';

// New composable services
import { LayoutEngineAdapter } from './layout-adapter';
import { GraphDataTransformerService } from '../../core/services/graph-data-transformer.service';
import { GridLayoutService } from '../../core/services/grid-layout.service';
import { ForceDirectedLayoutService } from '../../core/services/force-directed-layout.service';

// Create service instances for the adapter
// In a real app these would be injected, but factory is static
const transformer = new GraphDataTransformerService();
const gridLayout = new GridLayoutService();
const forceLayout = new ForceDirectedLayoutService();

/**
 * Factory for creating layout engines based on ViewNode specifications
 */
export class LayoutEngineFactory {

  /**
   * Create layout engine based on ViewNode layoutEngine property
   */
  static create(layoutEngineType: string): ILayoutEngine {
    switch (layoutEngineType) {
      case 'hierarchical':
      case 'grid':
        // Use new adapter with composable services for grid layout
        return new LayoutEngineAdapter(transformer, gridLayout);

      case 'flat-graph':
        // Use FlatGraphLayoutEngine with FlatGraphLayoutStrategy for uniform 120x80 nodes
        return new FlatGraphLayoutEngine();

      default:
        console.warn(`Unknown layout engine type: ${layoutEngineType}, using default grid layout`);
        return new LayoutEngineAdapter(transformer, gridLayout);
    }
  }
  
  /**
   * Get available layout engine types
   */
  static getAvailableTypes(): string[] {
    return ['hierarchical', 'grid', 'flat-graph'];
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
    console.log('🎨 DEBUG: RendererFactory.create called with:', rendererType);
    switch (rendererType) {
      case 'composable-flat':
        return new ComposableFlatRenderer();

      case 'composable-hierarchical':
        return new ComposableHierarchicalRenderer();

      case 'composable-containment-orthogonal':
        console.log('🎨 DEBUG: Creating ComposableContainmentOrthogonalRenderer');
        return new ComposableContainmentOrthogonalRenderer();

      default:
        console.warn(`[RendererFactory] Unknown renderer type: ${rendererType}, using default composable-flat renderer`);
        return new ComposableFlatRenderer();
    }
  }
  
  /**
   * Get available renderer types
   */
  static getAvailableTypes(): string[] {
    return ['composable-flat', 'composable-hierarchical', 'composable-containment-orthogonal'];
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
  ): { layoutEngine: ILayoutEngine; renderer: IRenderer } {
    return {
      layoutEngine: LayoutEngineFactory.create(layoutEngineType),
      renderer: RendererFactory.create(rendererType)
    };
  }
  
  /**
   * Create components from ViewNode object using dynamic properties
   */
  static createFromViewNode(viewNode: any): { layoutEngine: ILayoutEngine; renderer: IRenderer } {
    const layoutEngineType = viewNode.layout_engine ||
                              viewNode.layoutEngine ||
                              (viewNode.properties && viewNode.properties.layoutEngine) ||
                              'hierarchical';
    console.log('🎭 DEBUG: ComponentFactory.createFromViewNode:', {
      viewNodeId: viewNode.id,
      viewNodeName: viewNode.name,
      layoutEngineType,
      rendererType: viewNode.renderer || viewNode.rendererName
    });

    const rendererType = viewNode.renderer ||
                         (viewNode.properties && viewNode.properties.renderer) ||
                         'shape';

    return this.createComponents(layoutEngineType, rendererType);
  }
}