import { Injectable } from '@angular/core';

// =============================================================================
// ISOLATED RENDERER SERVICE
// Creates completely isolated instances of your proven renderer.js
// Each view gets its own renderer with zero cross-contamination
// =============================================================================

export interface RendererInstanceConfig {
  canvas: HTMLCanvasElement;
  entityData: any;
  viewType: string;
  instanceId: string;
}

export class RendererInstance {
  private canvas: HTMLCanvasElement;
  private instanceId: string;
  private viewType: string;
  private iframe!: HTMLIFrameElement;
  private rendererReady = false;
  private entityData: any;

  constructor(config: RendererInstanceConfig) {
    this.canvas = config.canvas;
    this.instanceId = config.instanceId;
    this.viewType = config.viewType;
    this.entityData = config.entityData;
  }

  async initialize(): Promise<void> {
    // Create invisible iframe to isolate renderer.js execution
    this.iframe = document.createElement('iframe');
    this.iframe.style.display = 'none';
    this.iframe.src = 'about:blank';
    document.body.appendChild(this.iframe);

    await new Promise(resolve => {
      this.iframe.onload = resolve;
    });

    const iframeDoc = this.iframe.contentDocument!;
    const iframeWindow = this.iframe.contentWindow as any;

    // Create isolated renderer environment in iframe
    await this.setupIsolatedRenderer(iframeWindow, iframeDoc);
    
    console.log(`Isolated renderer initialized for ${this.viewType}:${this.instanceId}`);
  }

  private async setupIsolatedRenderer(iframeWindow: any, iframeDoc: Document): Promise<void> {
    // Transfer canvas to iframe context (conceptually)
    iframeWindow.targetCanvas = this.canvas;
    
    // Set up isolated STATE for this instance
    iframeWindow.STATE = {
      view: {
        panX: 0,
        panY: 0,
        zoom: 0.5,
        smoothPanX: 0,
        smoothPanY: 0,
        smoothZoom: 0.5,
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
      entities: this.entityData,
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
    };

    // Populate entityTypes
    Object.values(this.entityData).forEach((entity: any) => {
      if (entity.groupType === 'container') {
        iframeWindow.STATE.entityTypes.groups.add(entity.id);
      } else if (entity.groupType === 'item') {
        iframeWindow.STATE.entityTypes.items.add(entity.id);
      }
    });

    // Load your renderer.js into the isolated iframe context
    await this.loadRendererInIframe(iframeWindow, iframeDoc);
  }

  private async loadRendererInIframe(iframeWindow: any, iframeDoc: Document): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = iframeDoc.createElement('script');
      script.type = 'module';
      script.src = '/lib/wasm-webgl/renderer.js?v=' + Date.now();
      
      script.onload = async () => {
        // Initialize renderer in iframe context with our canvas
        if (iframeWindow.initRenderer) {
          await iframeWindow.initRenderer(this.canvas);
          this.rendererReady = true;
          resolve();
        } else {
          reject(new Error('initRenderer not available in iframe'));
        }
      };
      
      script.onerror = reject;
      iframeDoc.head.appendChild(script);
    });
  }

  dispose(): void {
    if (this.iframe) {
      document.body.removeChild(this.iframe);
    }
    console.log(`Disposed isolated renderer ${this.viewType}:${this.instanceId}`);
  }

  // Public API for framework
  isReady(): boolean {
    return this.rendererReady;
  }

  updateEntities(newEntityData: any): void {
    if (this.iframe?.contentWindow && (this.iframe.contentWindow as any).STATE) {
      (this.iframe.contentWindow as any).STATE.entities = newEntityData;
      (this.iframe.contentWindow as any).STATE.render.needsRedraw = true;
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class IsolatedRendererService {
  private instances = new Map<string, RendererInstance>();

  async createRenderer(config: RendererInstanceConfig): Promise<RendererInstance> {
    // Dispose existing instance if exists
    if (this.instances.has(config.instanceId)) {
      const existing = this.instances.get(config.instanceId)!;
      existing.dispose();
    }

    // Create new isolated instance
    const instance = new RendererInstance(config);
    await instance.initialize();
    
    this.instances.set(config.instanceId, instance);
    console.log(`Created isolated renderer: ${config.instanceId}`);
    
    return instance;
  }

  getInstance(instanceId: string): RendererInstance | null {
    return this.instances.get(instanceId) || null;
  }

  disposeInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.dispose();
      this.instances.delete(instanceId);
    }
  }

  disposeAll(): void {
    for (const [id, instance] of this.instances) {
      instance.dispose();
    }
    this.instances.clear();
  }
}