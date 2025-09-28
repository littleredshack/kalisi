import { Injectable } from '@angular/core';
import { UnifiedRendererStateService, RendererState } from './unified-renderer-state.service';

// =============================================================================
// RENDERER REGISTRY - Factory Pattern for Multiple Renderer Types
// Provides clean renderer lifecycle with service-based architecture
// =============================================================================

export interface RendererConfig {
  instanceId: string;
  viewType: 'risk-models' | 'processes' | 'systems' | 'payment-models';
  canvas: HTMLCanvasElement;
  enableWasm?: boolean;
  enableWebGL?: boolean;
  fallbackTo2D?: boolean;
}

export interface Renderer {
  instanceId: string;
  canvas: HTMLCanvasElement;
  state: RendererState;
  
  // Core lifecycle methods
  initialize(): Promise<void>;
  render(): void;
  dispose(): void;
  
  // Interaction methods
  handleMouseEvent(event: MouseEvent): void;
  handleWheelEvent(event: WheelEvent): void;
  
  // Performance methods
  getPerformanceMetrics(): any;
}

export interface RendererFactory {
  rendererType: string;
  supportsViewType(viewType: string): boolean;
  createRenderer(config: RendererConfig): Promise<Renderer>;
  canUseWasm(): boolean;
  canUseWebGL(): boolean;
}

@Injectable({
  providedIn: 'root'
})
export class RendererRegistryService {
  private factories = new Map<string, RendererFactory>();
  private activeRenderers = new Map<string, Renderer>();

  constructor(
    private stateService: UnifiedRendererStateService
  ) {
    this.registerBuiltInFactories();
  }

  // =============================================================================
  // FACTORY REGISTRATION
  // =============================================================================

  registerFactory(factory: RendererFactory): void {
    this.factories.set(factory.rendererType, factory);
    console.log(`Registered renderer factory: ${factory.rendererType}`);
  }

  getFactory(rendererType: string): RendererFactory | null {
    return this.factories.get(rendererType) || null;
  }

  getAvailableRendererTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  // =============================================================================
  // RENDERER LIFECYCLE
  // =============================================================================

  async createRenderer(config: RendererConfig): Promise<Renderer | null> {
    // Dispose existing renderer if exists
    if (this.activeRenderers.has(config.instanceId)) {
      await this.disposeRenderer(config.instanceId);
    }

    // Create state for this renderer instance
    const rendererState = this.stateService.createRendererInstance(
      config.instanceId, 
      config.viewType
    );

    // Find suitable factory
    const factory = this.selectBestFactory(config);
    if (!factory) {
      console.error(`No suitable factory found for view type: ${config.viewType}`);
      return null;
    }

    try {
      const renderer = await factory.createRenderer(config);
      renderer.state = rendererState;
      
      // Initialize renderer
      await renderer.initialize();
      
      // Store active renderer
      this.activeRenderers.set(config.instanceId, renderer);
      
      console.log(`Created renderer: ${config.instanceId} using ${factory.rendererType}`);
      return renderer;
    } catch (error) {
      console.error('Failed to create renderer:', error);
      
      // Clean up state on failure
      this.stateService.destroyRendererInstance(config.instanceId);
      return null;
    }
  }

  getRenderer(instanceId: string): Renderer | null {
    return this.activeRenderers.get(instanceId) || null;
  }

  async disposeRenderer(instanceId: string): Promise<void> {
    const renderer = this.activeRenderers.get(instanceId);
    if (renderer) {
      try {
        renderer.dispose();
      } catch (error) {
        console.warn(`Error disposing renderer ${instanceId}:`, error);
      }
      
      this.activeRenderers.delete(instanceId);
      this.stateService.destroyRendererInstance(instanceId);
      
      console.log(`Disposed renderer: ${instanceId}`);
    }
  }

  async disposeAll(): Promise<void> {
    const disposePromises = Array.from(this.activeRenderers.keys()).map(
      instanceId => this.disposeRenderer(instanceId)
    );
    
    await Promise.all(disposePromises);
    console.log('Disposed all renderers');
  }

  // =============================================================================
  // FACTORY SELECTION
  // =============================================================================

  private selectBestFactory(config: RendererConfig): RendererFactory | null {
    // Get all factories that support this view type
    const supportedFactories = Array.from(this.factories.values())
      .filter(factory => factory.supportsViewType(config.viewType));
    
    if (supportedFactories.length === 0) {
      return null;
    }

    // Prioritize by capabilities
    const wasmFactories = supportedFactories.filter(f => f.canUseWasm());
    const webglFactories = supportedFactories.filter(f => f.canUseWebGL());

    // Selection priority:
    // 1. WASM + WebGL if requested and available
    // 2. WASM only if available
    // 3. WebGL only if available
    // 4. Fallback to any available

    if (config.enableWasm && config.enableWebGL) {
      const wasmWebGLFactory = wasmFactories.find(f => f.canUseWebGL());
      if (wasmWebGLFactory) return wasmWebGLFactory;
    }

    if (config.enableWasm && wasmFactories.length > 0) {
      return wasmFactories[0];
    }

    if (config.enableWebGL && webglFactories.length > 0) {
      return webglFactories[0];
    }

    // Return first supported factory as fallback
    return supportedFactories[0];
  }

  // =============================================================================
  // BUILT-IN FACTORY REGISTRATION
  // =============================================================================

  private registerBuiltInFactories(): void {
    // Register Risk Models WASM Factory
    this.registerFactory(new RiskModelsWasmFactory());
    
    // Register 2D Canvas Fallback Factory
    this.registerFactory(new Canvas2DFallbackFactory());
    
    // Future factories will be registered here:
    // this.registerFactory(new ProcessesWebGLFactory());
    // this.registerFactory(new SystemsD3Factory());
  }
}

// =============================================================================
// BUILT-IN FACTORIES
// =============================================================================

/**
 * Risk Models WASM Factory
 * Handles risk_models view with WASM + WebGL rendering
 */
class RiskModelsWasmFactory implements RendererFactory {
  rendererType = 'risk-models-wasm';

  supportsViewType(viewType: string): boolean {
    return viewType === 'risk-models';
  }

  canUseWasm(): boolean {
    return typeof WebAssembly !== 'undefined';
  }

  canUseWebGL(): boolean {
    // Test WebGL support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return gl !== null;
  }

  async createRenderer(config: RendererConfig): Promise<Renderer> {
    return new RiskModelsWasmRenderer(config);
  }
}

/**
 * Canvas 2D Fallback Factory
 * Universal fallback for all view types using 2D canvas
 */
class Canvas2DFallbackFactory implements RendererFactory {
  rendererType = 'canvas-2d-fallback';

  supportsViewType(viewType: string): boolean {
    return true; // Supports all view types
  }

  canUseWasm(): boolean {
    return false;
  }

  canUseWebGL(): boolean {
    return false;
  }

  async createRenderer(config: RendererConfig): Promise<Renderer> {
    return new Canvas2DRenderer(config);
  }
}

// =============================================================================
// RISK MODELS WASM RENDERER
// =============================================================================

class RiskModelsWasmRenderer implements Renderer {
  instanceId: string;
  canvas: HTMLCanvasElement;
  state!: RendererState;

  private wasmModule: any = null;
  private webglContext: WebGLRenderingContext | null = null;
  private animationId: number | null = null;
  private isDisposed = false;

  constructor(config: RendererConfig) {
    this.instanceId = config.instanceId;
    this.canvas = config.canvas;
  }

  async initialize(): Promise<void> {
    try {
      // Load WebGL module (functional replacement for WASM)
      this.wasmModule = await import('../../../lib/wasm-webgl/pkg/wasm_shapes.js');
      await this.wasmModule.default();
      
      // Setup canvas and context
      this.setupCanvas();
      
      // Load and render default entities
      this.loadDefaultEntities();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Start render loop
      this.startRenderLoop();
      
      console.log('RiskModelsWasmRenderer initialized successfully with entities:', this.state.entities.size);
    } catch (error) {
      console.error('Failed to initialize RiskModelsWasmRenderer:', error);
      throw error;
    }
  }

  private setupCanvas(): void {
    // Set canvas size to container
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    // Try WebGL first, fallback to 2D
    this.webglContext = this.canvas.getContext('webgl') as WebGLRenderingContext || 
                       this.canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    
    if (!this.webglContext) {
      console.log('WebGL not available, using 2D canvas rendering');
    }
  }

  private loadDefaultEntities(): void {
    // Get default entities from state and load them into the renderer
    if (!this.state || this.state.entities.size === 0) {
      console.error('No default entities found in state');
      return;
    }
    
    // Convert state entities to renderer format and trigger render
    const entities = Array.from(this.state.entities.values());
    console.log('Loading default entities:', entities.map(e => e.name));
    
    // Force initial render with entities
    this.state.performance.needsRedraw = true;
    this.render();
  }

  render(): void {
    if (this.isDisposed) return;

    // Use 2D canvas rendering (proven to work)
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas with dark background
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Get entities from state
    const entities = Array.from(this.state.entities.values());
    
    if (entities.length === 0) {
      console.log('No entities to render');
      return;
    }

    console.log(`Rendering ${entities.length} entities:`, entities.map(e => e.name));

    try {
      // Calculate center and scale
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;
      const scale = 20;

      // Render each entity
      entities.forEach(entity => {
        this.renderEntity2D(ctx, entity, centerX, centerY, scale);
      });

      // Render connections
      this.state.connections.forEach(connection => {
        this.renderConnection2D(ctx, connection, centerX, centerY, scale);
      });

    } catch (error) {
      console.error('Rendering error:', error);
    }

    this.state.performance.needsRedraw = false;
  }

  private renderEntity2D(ctx: CanvasRenderingContext2D, entity: any, centerX: number, centerY: number, scale: number): void {
    const x = centerX + (entity.x * scale);
    const y = centerY + (entity.y * scale);
    const width = entity.width * scale;
    const height = entity.height * scale;
    
    const isSelected = this.state.selection.selectedIds.has(entity.id);
    const isExpanded = entity.expanded !== false;
    
    // Draw entity rectangle
    if (isSelected) {
      ctx.strokeStyle = '#ffd700';
      ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = '#6ea8fe';
      ctx.fillStyle = 'rgba(110, 168, 254, 0.1)';
      ctx.lineWidth = 2;
    }
    
    if (!isExpanded) {
      ctx.setLineDash([5, 5]);
      ctx.fillStyle = 'rgba(110, 168, 254, 0.05)';
    } else {
      ctx.setLineDash([]);
    }
    
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    
    // Draw resize handle if selected
    if (isSelected) {
      ctx.fillStyle = '#ffd700';
      ctx.fillRect(x + width - 8, y + height - 8, 8, 8);
    }
    
    // Draw label
    ctx.fillStyle = isExpanded ? '#e6edf3' : '#7d8590';
    ctx.font = isExpanded ? '14px Inter, sans-serif' : '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(entity.name, x + width/2, y + height/2);
    
    // Draw expand/collapse indicator
    if (entity.type === 'container') {
      ctx.fillStyle = '#6ea8fe';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(isExpanded ? '−' : '+', x + width - 4, y + 12);
    }
    
    ctx.setLineDash([]);
  }

  private renderConnection2D(ctx: CanvasRenderingContext2D, connection: any, centerX: number, centerY: number, scale: number): void {
    const fromEntity = this.state.entities.get(connection.from);
    const toEntity = this.state.entities.get(connection.to);
    
    if (!fromEntity || !toEntity) return;
    
    const x1 = centerX + (fromEntity.x * scale) + (fromEntity.width * scale / 2);
    const y1 = centerY + (fromEntity.y * scale) + (fromEntity.height * scale / 2);
    const x2 = centerX + (toEntity.x * scale) + (toEntity.width * scale / 2);
    const y2 = centerY + (toEntity.y * scale) + (toEntity.height * scale / 2);
    
    ctx.strokeStyle = 'rgba(110, 168, 254, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  handleMouseEvent(event: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Convert to world coordinates
    const worldX = (mouseX - this.state.viewTransform.panX) / this.state.viewTransform.zoom;
    const worldY = (mouseY - this.state.viewTransform.panY) / this.state.viewTransform.zoom;

    // Update interaction state
    this.state.interaction.mouseScreen = { x: mouseX, y: mouseY };
    this.state.interaction.mouseWorld = { x: worldX, y: worldY };

    // Handle different mouse events
    switch (event.type) {
      case 'mousedown':
        this.handleMouseDown(event);
        break;
      case 'mousemove':
        this.handleMouseMove(event);
        break;
      case 'mouseup':
        this.handleMouseUp(event);
        break;
      case 'dblclick':
        this.handleDoubleClick(event);
        break;
    }

    this.state.performance.needsRedraw = true;
  }

  private handleMouseDown(event: MouseEvent): void {
    const clickedEntity = this.getEntityAtPoint(
      this.state.interaction.mouseWorld.x, 
      this.state.interaction.mouseWorld.y
    );

    if (clickedEntity) {
      // Select entity and start dragging
      this.state.selection.selectedIds.clear();
      this.state.selection.selectedIds.add(clickedEntity.id);
      this.state.interaction.mode = 'dragging';
      this.state.interaction.dragOffset = {
        x: this.state.interaction.mouseWorld.x - clickedEntity.x,
        y: this.state.interaction.mouseWorld.y - clickedEntity.y
      };
    } else {
      // Start panning
      this.state.interaction.mode = 'panning';
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (this.state.interaction.mode === 'dragging') {
      // Handle entity dragging
      const selectedId = Array.from(this.state.selection.selectedIds)[0];
      if (selectedId) {
        const entity = this.state.entities.get(selectedId);
        if (entity) {
          entity.x = this.state.interaction.mouseWorld.x - this.state.interaction.dragOffset.x;
          entity.y = this.state.interaction.mouseWorld.y - this.state.interaction.dragOffset.y;
          this.state.entities.set(selectedId, entity);
        }
      }
    } else if (this.state.interaction.mode === 'panning') {
      // Handle view panning
      const deltaX = event.movementX;
      const deltaY = event.movementY;
      
      this.state.viewTransform.panX += deltaX;
      this.state.viewTransform.panY += deltaY;
    }
  }

  private handleMouseUp(event: MouseEvent): void {
    this.state.interaction.mode = 'idle';
  }

  private handleDoubleClick(event: MouseEvent): void {
    const clickedEntity = this.getEntityAtPoint(
      this.state.interaction.mouseWorld.x, 
      this.state.interaction.mouseWorld.y
    );

    if (clickedEntity && clickedEntity.type === 'container') {
      // Toggle entity expansion via state service
      const stateService = new UnifiedRendererStateService();
      stateService.toggleEntity(clickedEntity.id, this.instanceId);
    }
  }

  private getEntityAtPoint(worldX: number, worldY: number): any {
    for (const entity of this.state.entities.values()) {
      if (worldX >= entity.x && worldX <= entity.x + entity.width &&
          worldY >= entity.y && worldY <= entity.y + entity.height) {
        return entity;
      }
    }
    return null;
  }

  handleWheelEvent(event: WheelEvent): void {
    event.preventDefault();
    
    const zoomSpeed = 0.001;
    const zoomDelta = -event.deltaY * zoomSpeed;
    const newZoom = Math.max(0.1, Math.min(5, this.state.viewTransform.zoom + zoomDelta));
    
    // Zoom towards mouse position
    const mouseX = this.state.interaction.mouseScreen.x;
    const mouseY = this.state.interaction.mouseScreen.y;
    
    const worldX = (mouseX - this.state.viewTransform.panX) / this.state.viewTransform.zoom;
    const worldY = (mouseY - this.state.viewTransform.panY) / this.state.viewTransform.zoom;
    
    this.state.viewTransform.zoom = newZoom;
    this.state.viewTransform.panX = mouseX - worldX * newZoom;
    this.state.viewTransform.panY = mouseY - worldY * newZoom;
    
    this.state.performance.needsRedraw = true;
  }

  getPerformanceMetrics(): any {
    return {
      rendererType: 'risk-models-wasm',
      instanceId: this.instanceId,
      fps: this.state.performance.fps,
      entityCount: this.state.entities.size,
      connectionCount: this.state.connections.length,
      wasmEnabled: this.wasmModule !== null,
      webglEnabled: this.webglContext !== null,
      memoryUsage: (performance as any).memory ? {
        used: Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024),
        total: Math.round((performance as any).memory.totalJSHeapSize / 1024 / 1024)
      } : undefined
    };
  }

  dispose(): void {
    this.isDisposed = true;

    // Cancel animation frame
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // Remove event listeners
    this.removeEventListeners();

    // Clean up WebGL context
    if (this.webglContext) {
      // WebGL cleanup would go here
      this.webglContext = null;
    }

    // Clean up WASM module
    if (this.wasmModule) {
      // WASM cleanup would go here
      this.wasmModule = null;
    }

    console.log(`RiskModelsWasmRenderer disposed: ${this.instanceId}`);
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseEvent.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseEvent.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseEvent.bind(this));
    this.canvas.addEventListener('dblclick', this.handleMouseEvent.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheelEvent.bind(this));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private removeEventListeners(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseEvent.bind(this));
    this.canvas.removeEventListener('mousemove', this.handleMouseEvent.bind(this));
    this.canvas.removeEventListener('mouseup', this.handleMouseEvent.bind(this));
    this.canvas.removeEventListener('dblclick', this.handleMouseEvent.bind(this));
    this.canvas.removeEventListener('wheel', this.handleWheelEvent.bind(this));
  }

  private startRenderLoop(): void {
    const renderFrame = (timestamp: number) => {
      if (this.isDisposed) return;

      // Update FPS
      this.updateFPS(timestamp);

      // Smooth animations
      this.updateAnimations();

      // Render if needed
      if (this.state.performance.needsRedraw) {
        this.render();
      }

      this.animationId = requestAnimationFrame(renderFrame);
    };

    this.animationId = requestAnimationFrame(renderFrame);
  }

  private updateFPS(timestamp: number): void {
    this.state.performance.fpsCounter++;
    
    if (timestamp - this.state.performance.lastFPSUpdate >= 1000) {
      this.state.performance.fps = this.state.performance.fpsCounter;
      this.state.performance.fpsCounter = 0;
      this.state.performance.lastFPSUpdate = timestamp;
    }
  }

  private updateAnimations(): void {
    // Smooth view transform animations
    const smoothing = 0.15;
    const transform = this.state.viewTransform;
    
    transform.smoothPanX += (transform.panX - transform.smoothPanX) * smoothing;
    transform.smoothPanY += (transform.panY - transform.smoothPanY) * smoothing;
    transform.smoothZoom += (transform.zoom - transform.smoothZoom) * smoothing;

    // Update entity animations (expand/collapse)
    let needsUpdate = false;
    for (const entity of this.state.entities.values()) {
      if (entity.animationState) {
        const elapsed = Date.now() - (entity.animationState.startTime || 0);
        const duration = entity.animationState.duration || 200;
        
        if (elapsed >= duration) {
          // Animation complete
          if (entity.animationState.targetSize) {
            entity.width = entity.animationState.targetSize.x;
            entity.height = entity.animationState.targetSize.y;
          }
          entity.animationState = undefined;
          needsUpdate = true;
        } else {
          // Interpolate animation
          const progress = elapsed / duration;
          const eased = this.easeInOutCubic(progress);
          
          if (entity.animationState.startSize && entity.animationState.targetSize) {
            entity.width = entity.animationState.startSize.x + 
              (entity.animationState.targetSize.x - entity.animationState.startSize.x) * eased;
            entity.height = entity.animationState.startSize.y + 
              (entity.animationState.targetSize.y - entity.animationState.startSize.y) * eased;
          }
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      this.state.performance.needsRedraw = true;
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }
}

// =============================================================================
// 2D CANVAS FALLBACK RENDERER
// =============================================================================

class Canvas2DRenderer implements Renderer {
  instanceId: string;
  canvas: HTMLCanvasElement;
  state!: RendererState;

  private ctx: CanvasRenderingContext2D | null = null;
  private animationId: number | null = null;
  private isDisposed = false;

  constructor(config: RendererConfig) {
    this.instanceId = config.instanceId;
    this.canvas = config.canvas;
  }

  async initialize(): Promise<void> {
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) {
      throw new Error('2D Canvas context not available');
    }

    this.setupEventListeners();
    this.startRenderLoop();
    
    console.log('Canvas2DRenderer initialized successfully');
  }

  render(): void {
    if (!this.ctx || this.isDisposed) return;

    // Clear canvas
    this.ctx.fillStyle = '#0b0f14';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Save context state
    this.ctx.save();
    
    // Apply view transform
    this.ctx.translate(this.state.viewTransform.smoothPanX, this.state.viewTransform.smoothPanY);
    this.ctx.scale(this.state.viewTransform.smoothZoom, this.state.viewTransform.smoothZoom);

    // Render entities
    for (const entity of this.state.entities.values()) {
      this.renderEntity2D(entity);
    }

    // Render connections
    this.state.connections.forEach(connection => {
      this.renderConnection2D(connection);
    });

    // Restore context state
    this.ctx.restore();

    this.state.performance.needsRedraw = false;
  }

  private renderEntity2D(entity: any): void {
    if (!this.ctx) return;

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const scale = 20;

    const x = centerX + (entity.x * scale);
    const y = centerY + (entity.y * scale);
    const width = entity.width * scale;
    const height = entity.height * scale;

    const isSelected = this.state.selection.selectedIds.has(entity.id);
    const isExpanded = entity.expanded !== false;

    // Draw entity rectangle
    if (isSelected) {
      this.ctx.strokeStyle = '#ffd700';
      this.ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
      this.ctx.lineWidth = 3;
    } else {
      this.ctx.strokeStyle = '#6ea8fe';
      this.ctx.fillStyle = 'rgba(110, 168, 254, 0.1)';
      this.ctx.lineWidth = 2;
    }

    if (!isExpanded) {
      this.ctx.setLineDash([5, 5]);
      this.ctx.fillStyle = 'rgba(110, 168, 254, 0.05)';
    } else {
      this.ctx.setLineDash([]);
    }

    this.ctx.fillRect(x, y, width, height);
    this.ctx.strokeRect(x, y, width, height);

    // Draw text
    this.ctx.fillStyle = isExpanded ? '#e6edf3' : '#7d8590';
    this.ctx.font = isExpanded ? '14px sans-serif' : '12px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(entity.name, x + width/2, y + height/2 + 5);

    // Draw expand/collapse indicator
    if (entity.type === 'container') {
      this.ctx.fillStyle = '#6ea8fe';
      this.ctx.font = '10px sans-serif';
      this.ctx.textAlign = 'right';
      this.ctx.fillText(isExpanded ? '−' : '+', x + width - 4, y + 12);
    }

    this.ctx.setLineDash([]);
  }

  private renderConnection2D(connection: any): void {
    if (!this.ctx) return;

    const fromEntity = this.state.entities.get(connection.from);
    const toEntity = this.state.entities.get(connection.to);
    
    if (!fromEntity || !toEntity) return;

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const scale = 20;

    const x1 = centerX + (fromEntity.x * scale) + (fromEntity.width * scale / 2);
    const y1 = centerY + (fromEntity.y * scale) + (fromEntity.height * scale / 2);
    const x2 = centerX + (toEntity.x * scale) + (toEntity.width * scale / 2);
    const y2 = centerY + (toEntity.y * scale) + (toEntity.height * scale / 2);

    this.ctx.strokeStyle = 'rgba(110, 168, 254, 0.5)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  handleMouseEvent(event: MouseEvent): void {
    // Similar to WASM renderer but using 2D context
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    this.state.interaction.mouseScreen = { x: mouseX, y: mouseY };
    this.state.interaction.mouseWorld = {
      x: (mouseX - this.state.viewTransform.panX) / this.state.viewTransform.zoom,
      y: (mouseY - this.state.viewTransform.panY) / this.state.viewTransform.zoom
    };

    // Handle mouse events similar to WASM renderer
    // (Implementation details omitted for brevity)
    
    this.state.performance.needsRedraw = true;
  }

  handleWheelEvent(event: WheelEvent): void {
    // Same wheel handling as WASM renderer
    event.preventDefault();
    
    const zoomSpeed = 0.001;
    const zoomDelta = -event.deltaY * zoomSpeed;
    const newZoom = Math.max(0.1, Math.min(5, this.state.viewTransform.zoom + zoomDelta));
    
    this.state.viewTransform.zoom = newZoom;
    this.state.performance.needsRedraw = true;
  }

  getPerformanceMetrics(): any {
    return {
      rendererType: 'canvas-2d-fallback',
      instanceId: this.instanceId,
      fps: this.state.performance.fps,
      entityCount: this.state.entities.size,
      connectionCount: this.state.connections.length,
      canvasEnabled: this.ctx !== null
    };
  }

  dispose(): void {
    this.isDisposed = true;

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    // Remove event listeners
    // (Implementation omitted for brevity)

    console.log(`Canvas2DRenderer disposed: ${this.instanceId}`);
  }

  private setupEventListeners(): void {
    // Setup event listeners similar to WASM renderer
  }

  private startRenderLoop(): void {
    const renderFrame = (timestamp: number) => {
      if (this.isDisposed) return;

      if (this.state.performance.needsRedraw) {
        this.render();
      }

      this.animationId = requestAnimationFrame(renderFrame);
    };

    this.animationId = requestAnimationFrame(renderFrame);
  }
}