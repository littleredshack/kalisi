import { Injectable } from '@angular/core';

// =============================================================================
// MULTI-VIEW RENDERER SERVICE
// Reuses the existing proven renderer.js for multiple views with different data
// =============================================================================

export interface ViewEntityData {
  viewType: 'risk-models' | 'processes' | 'systems' | 'payment-models';
  entities: any; // Will match your existing STATE.entities format
  connections?: any[];
}

@Injectable({
  providedIn: 'root'
})
export class MultiViewRendererService {
  private viewDataRegistry = new Map<string, ViewEntityData>();
  private rendererInstances = new Map<string, any>();

  constructor() {
    this.initializeViewData();
  }

  // =============================================================================
  // VIEW DATA REGISTRY - Different data for each view type
  // =============================================================================

  private initializeViewData(): void {
    // Risk Models - YOUR EXISTING ENTITIES (unchanged)
    this.viewDataRegistry.set('risk-models', {
      viewType: 'risk-models',
      entities: {
        // Keep your existing exact entities
        'left-top': {
          id: 'left-top',
          name: 'Left Top',
          groupType: 'container',
          position: { x: -6, y: 0 },
          size: { x: 8, y: 8 },
          expanded: true,
          children: [],
          parent: null
        },
        'left-middle': {
          id: 'left-middle', 
          name: 'Left Middle',
          groupType: 'container',
          position: { x: -6, y: 10 },
          size: { x: 8, y: 6 },
          expanded: true,
          children: [],
          parent: null
        },
        'right-top': {
          id: 'right-top',
          name: 'Right Top', 
          groupType: 'container',
          position: { x: 6, y: 0 },
          size: { x: 8, y: 8 },
          expanded: true,
          children: [],
          parent: null
        },
        'right-bottom': {
          id: 'right-bottom',
          name: 'Right Bottom',
          groupType: 'container',
          position: { x: 6, y: 10 },
          size: { x: 8, y: 6 },
          expanded: true,
          children: [],
          parent: null
        }
      },
      connections: []
    });

    // Processes - NEW entities for processes view
    this.viewDataRegistry.set('processes', {
      viewType: 'processes',
      entities: {
        'order-processing': {
          id: 'order-processing',
          name: 'Order Processing',
          type: 'container',
          groupType: 'container',
          x: -8,
          y: -4,
          width: 10,
          height: 6,
          expanded: true,
          children: [],
          parent: null
        },
        'payment-flow': {
          id: 'payment-flow',
          name: 'Payment Flow',
          type: 'container',
          groupType: 'container',
          x: 0,
          y: -4,
          width: 10,
          height: 6,
          expanded: true,
          children: [],
          parent: null
        },
        'fulfillment': {
          id: 'fulfillment',
          name: 'Fulfillment',
          type: 'container',
          groupType: 'container',
          x: 8,
          y: -4,
          width: 10,
          height: 6,
          expanded: true,
          children: [],
          parent: null
        }
      },
      connections: [
        { from: 'order-processing', to: 'payment-flow', type: 'flow' },
        { from: 'payment-flow', to: 'fulfillment', type: 'flow' }
      ]
    });

    // Systems - NEW entities for systems view
    this.viewDataRegistry.set('systems', {
      viewType: 'systems',
      entities: {
        'api-gateway': {
          id: 'api-gateway',
          name: 'API Gateway',
          groupType: 'container',
          position: { x: 0, y: -8 },
          size: { x: 8, y: 4 },
          expanded: true,
          children: [],
          parent: null
        },
        'database': {
          id: 'database',
          name: 'Neo4j Database',
          groupType: 'container',
          position: { x: -10, y: 0 },
          size: { x: 8, y: 6 },
          expanded: true,
          children: [],
          parent: null
        },
        'redis-cache': {
          id: 'redis-cache',
          name: 'Redis Cache',
          groupType: 'container',
          position: { x: 10, y: 0 },
          size: { x: 8, y: 6 },
          expanded: true,
          children: [],
          parent: null
        },
        'frontend': {
          id: 'frontend',
          name: 'Angular Frontend',
          groupType: 'container',
          position: { x: 0, y: 8 },
          size: { x: 12, y: 4 },
          expanded: true,
          children: [],
          parent: null
        }
      },
      connections: [
        { from: 'api-gateway', to: 'database', type: 'query' },
        { from: 'api-gateway', to: 'redis-cache', type: 'cache' },
        { from: 'frontend', to: 'api-gateway', type: 'http' }
      ]
    });

    // Payment Models - NEW entities for payment models view  
    this.viewDataRegistry.set('payment-models', {
      viewType: 'payment-models',
      entities: {
        'card-processing': {
          id: 'card-processing',
          name: 'Card Processing',
          groupType: 'container',
          position: { x: -8, y: 0 },
          size: { x: 8, y: 6 },
          expanded: true,
          children: [],
          parent: null
        },
        'ach-processing': {
          id: 'ach-processing',
          name: 'ACH Processing',
          groupType: 'container',
          position: { x: 0, y: 0 },
          size: { x: 8, y: 6 },
          expanded: true,
          children: [],
          parent: null
        },
        'wire-transfers': {
          id: 'wire-transfers',
          name: 'Wire Transfers',
          groupType: 'container',
          position: { x: 8, y: 0 },
          size: { x: 8, y: 6 },
          expanded: true,
          children: [],
          parent: null
        }
      },
      connections: []
    });

    console.log('Multi-view data registry initialized with', this.viewDataRegistry.size, 'view types');
  }

  // =============================================================================
  // RENDERER MANAGEMENT - Same renderer, different data
  // =============================================================================

  async createRendererForView(
    viewType: 'risk-models' | 'processes' | 'systems' | 'payment-models',
    canvas: HTMLCanvasElement,
    instanceId: string
  ): Promise<any> {
    
    // Get the data for this view type
    const viewData = this.viewDataRegistry.get(viewType);
    if (!viewData) {
      throw new Error(`No data registered for view type: ${viewType}`);
    }

    // Load your existing renderer.js (the one that works perfectly)
    const rendererModule = await this.loadExistingRenderer();
    
    // Create isolated STATE for this instance (no window.STATE conflicts)
    const isolatedState = this.createIsolatedState(viewData, instanceId);
    
    // Initialize renderer with the view-specific data
    const renderer = await rendererModule.initRenderer(canvas, isolatedState);
    
    // Store renderer instance
    this.rendererInstances.set(instanceId, {
      renderer,
      state: isolatedState,
      viewType,
      canvas
    });

    console.log(`Created ${viewType} renderer with ${Object.keys(viewData.entities).length} entities`);
    return renderer;
  }

  private async loadExistingRenderer(): Promise<any> {
    // Load your existing proven renderer.js
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/lib/wasm-webgl/renderer.js?v=' + Date.now();
      script.type = 'module';
      script.onload = () => {
        // Your renderer.js exports will be available
        resolve(window as any); // Get the renderer functions
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  private createIsolatedState(viewData: ViewEntityData, instanceId: string): any {
    // Create isolated STATE object (same format as your existing window.STATE)
    // but scoped to this instance only
    return {
      view: {
        panX: 0,
        panY: 0,
        zoom: 1,
        smoothPanX: 0,
        smoothPanY: 0,
        smoothZoom: 1,
        panSensitivity: 1.0,
        zoomSensitivity: 3.0
      },
      selection: {
        selectedId: null,
        selectedType: null,
        hoverTarget: null,
        lastClickTime: 0,
        lastClickTarget: null
      },
      interaction: {
        mode: 'idle',
        resizeHandle: null,
        dragOffset: { x: 0, y: 0 },
        mouseWorld: { x: 0, y: 0 },
        mouseScreen: { x: 0, y: 0 },
        lastMouseScreen: { x: 0, y: 0 }
      },
      entities: { ...viewData.entities }, // View-specific entities
      connections: viewData.connections || [],
      // ... rest of your existing STATE structure
      instanceId // Add instance ID to prevent conflicts
    };
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  getViewData(viewType: string): ViewEntityData | null {
    return this.viewDataRegistry.get(viewType) || null;
  }

  getRendererInstance(instanceId: string): any {
    return this.rendererInstances.get(instanceId) || null;
  }

  updateViewData(viewType: string, newData: Partial<ViewEntityData>): void {
    const existing = this.viewDataRegistry.get(viewType);
    if (existing) {
      this.viewDataRegistry.set(viewType, { ...existing, ...newData });
    }
  }

  disposeRenderer(instanceId: string): void {
    const instance = this.rendererInstances.get(instanceId);
    if (instance && instance.renderer.dispose) {
      instance.renderer.dispose();
    }
    this.rendererInstances.delete(instanceId);
  }
}