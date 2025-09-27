import { Injectable } from '@angular/core';

// =============================================================================
// PER-VIEW RENDERER SERVICE
// Simple approach: Each view gets its own renderer execution
// No shared globals, no conflicts between views
// =============================================================================

@Injectable({
  providedIn: 'root'
})
export class PerViewRendererService {
  private viewRenderers = new Map<string, any>();

  async createViewRenderer(
    viewType: 'risk-models' | 'processes' | 'systems' | 'payment-models',
    canvas: HTMLCanvasElement,
    entityData: any
  ): Promise<any> {
    
    const viewId = `${viewType}_${Date.now()}`;
    
    try {
      // Create completely isolated renderer for this view
      const renderer = await this.initializeIsolatedRenderer(canvas, entityData, viewId);
      
      this.viewRenderers.set(viewId, renderer);
      console.log(`Created isolated renderer for ${viewType}:`, viewId);
      
      return renderer;
    } catch (error) {
      console.error(`Failed to create renderer for ${viewType}:`, error);
      throw error;
    }
  }

  private async initializeIsolatedRenderer(
    canvas: HTMLCanvasElement, 
    entityData: any, 
    viewId: string
  ): Promise<any> {
    
    // Create unique namespace for this view instance
    const namespace = `RENDERER_${viewId.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    // Set up isolated namespace with mock WASM functions
    (window as any)[namespace] = {
      // Mock WASM functions (needed by renderer.js)
      currentColor: { r: 255, g: 0, b: 0 },
      get_color: function() {
        const color = (window as any)[namespace].currentColor || { r: 255, g: 0, b: 0 };
        return [color.r, color.g, color.b];
      },
      set_color: function(r: number, g: number, b: number) {
        (window as any)[namespace].currentColor = { r, g, b };
      },
      init: async function() {
        (window as any)[namespace].currentColor = { r: 255, g: 0, b: 0 };
        return Promise.resolve();
      },
      
      STATE: {
        view: {
          panX: 0,
          panY: 0,
          zoom: 1.0, // Original zoom level like your working version
          smoothPanX: 0,
          smoothPanY: 0,
          smoothZoom: 1.0,
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
        entities: entityData,
        entityTypes: {
          groups: new Set(),
          items: new Set()
        },
        connections: [],
        render: {
          mode: 'linedraw',
          needsRedraw: true,
          fps: 0,
          fpsCounter: 0,
          lastFPSUpdate: 0
        },
        effects: {
          smoothMovement: true,
          hideChildrenMode: true,
          enableBloom: false,
          enableShadows: false,
          enableParticles: false,
          fadeTransitions: true
        },
        shapeColor: "#ff0000",
        panSensitivity: 1.0,
        zoomSensitivity: 3.0,
        animationDuration: 0.5,
        selectedFont: "Inter",
        fontSize: 3.0
      },
      canvas: canvas,
      viewId: viewId
    };

    // Populate entityTypes
    Object.values(entityData).forEach((entity: any) => {
      if (entity.groupType === 'container') {
        (window as any)[namespace].STATE.entityTypes.groups.add(entity.id);
      } else if (entity.groupType === 'item') {
        (window as any)[namespace].STATE.entityTypes.items.add(entity.id);
      }
    });

    // Load renderer.js and initialize for this specific view
    await this.loadAndInitializeRenderer(namespace, canvas);
    
    return {
      namespace,
      viewId,
      canvas,
      dispose: () => {
        delete (window as any)[namespace];
        console.log(`Disposed renderer namespace: ${namespace}`);
      }
    };
  }

  private async loadAndInitializeRenderer(namespace: string, canvas: HTMLCanvasElement): Promise<void> {
    // Set up global mock functions that your renderer.js expects
    (window as any).currentColor = { r: 255, g: 0, b: 0 };
    (window as any).get_color = () => {
      const color = (window as any).currentColor || { r: 255, g: 0, b: 0 };
      return [color.r, color.g, color.b];
    };
    (window as any).set_color = (r: number, g: number, b: number) => {
      (window as any).currentColor = { r, g, b };
    };
    (window as any).init = async () => {
      (window as any).currentColor = { r: 255, g: 0, b: 0 };
      return Promise.resolve();
    };

    // Set the isolated STATE for this view
    (window as any).STATE = (window as any)[namespace].STATE;
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/lib/wasm-webgl/renderer.js?v=' + Date.now();
      script.type = 'module';
      
      script.onload = async () => {
        try {
          // Initialize with canvas and isolated STATE
          if ((window as any).initRenderer) {
            await (window as any).initRenderer(canvas, (window as any)[namespace].STATE);
            console.log(`Renderer initialized for namespace: ${namespace}`);
            resolve();
          } else {
            reject(new Error('initRenderer not available'));
          }
        } catch (error) {
          reject(error);
        }
      };
      
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  disposeViewRenderer(viewId: string): void {
    const renderer = this.viewRenderers.get(viewId);
    if (renderer) {
      renderer.dispose();
      this.viewRenderers.delete(viewId);
    }
  }

  getViewRenderer(viewId: string): any {
    return this.viewRenderers.get(viewId) || null;
  }
}