/**
 * WebGL Renderer Service for Kalisi
 * Based on the core rendering logic from wasm-webgl
 * Adapted for Angular and multi-tab support using actual WASM module
 */

import { Injectable } from '@angular/core';
import init, { WasmRenderer, create_renderer } from '../../../lib/wasm-webgl/pkg/wasm_shapes.js';

export interface EntityState {
  id: string;
  groupType: 'container' | 'item';
  text: string;
  position: { x: number; y: number };
  worldPosition?: { x: number; y: number };
  size: { x: number; y: number };
  parentId: string | null;
  children: string[];
  expanded: boolean;
  visible: boolean;
  icon: string;
  color: string;
  animationState?: {
    startSize?: { x: number; y: number };
    targetSize?: { x: number; y: number };
    startTime?: number;
    duration?: number;
  };
}

export interface ConnectionState {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  color: string;
  lineWidth: number;
  path?: { x: number; y: number }[];
}

export interface ViewState {
  panX: number;
  panY: number;
  zoom: number;
  smoothPanX: number;
  smoothPanY: number;
  smoothZoom: number;
  panSensitivity: number;
  zoomSensitivity: number;
}

export interface RendererState {
  view: ViewState;
  selection: {
    selectedId: string | null;
    selectedType: string | null;
    hoverTarget: string | null;
    lastClickTime: number;
    lastClickTarget: string | null;
  };
  interaction: {
    mode: 'idle' | 'panning' | 'dragging' | 'resizing';
    resizeHandle: string | null;
    dragOffset: { x: number; y: number };
    mouseWorld: { x: number; y: number };
    mouseScreen: { x: number; y: number };
    lastMouseScreen: { x: number; y: number };
  };
  entities: { [id: string]: EntityState };
  connections: ConnectionState[];
  render: {
    mode: 'clipart' | 'linedraw';
    needsRedraw: boolean;
    fps: number;
    fpsCounter: number;
    lastFPSUpdate: number;
  };
  effects: {
    smoothMovement: boolean;
    hideChildrenMode: boolean;
    enableBloom: boolean;
    enableShadows: boolean;
    fadeTransitions: boolean;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WebGLRendererService {
  private rendererInstances = new Map<string, WebGLRenderer>();
  private wasmInitialized = false;

  async createRenderer(canvas: HTMLCanvasElement, tabId: string): Promise<WebGLRenderer> {
    // Initialize WASM if needed
    if (!this.wasmInitialized) {
      try {
        await init();
        this.wasmInitialized = true;
        console.log('WASM module initialized successfully (v2)');
      } catch (error) {
        console.warn('Failed to initialize WASM module:', error);
        // Fall back to JavaScript implementation
      }
    }

    if (this.rendererInstances.has(tabId)) {
      this.rendererInstances.get(tabId)?.dispose();
    }
    
    const renderer = new WebGLRenderer(canvas, this.wasmInitialized);
    this.rendererInstances.set(tabId, renderer);
    return renderer;
  }

  getRenderer(tabId: string): WebGLRenderer | undefined {
    return this.rendererInstances.get(tabId);
  }

  disposeRenderer(tabId: string): void {
    const renderer = this.rendererInstances.get(tabId);
    if (renderer) {
      renderer.dispose();
      this.rendererInstances.delete(tabId);
    }
  }
}

/**
 * WebGL Renderer instance for each canvas/tab
 */
export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private wasmRenderer: WasmRenderer | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private animationId: number | null = null;
  private isDisposed = false;
  private useWasm: boolean;
  
  // State for this renderer instance
  private state: RendererState;
  
  // Mouse event handlers bound to this instance
  private boundHandlers: {
    mouseMove: (e: MouseEvent) => void;
    mouseDown: (e: MouseEvent) => void;
    mouseUp: (e: MouseEvent) => void;
    wheel: (e: WheelEvent) => void;
    contextMenu: (e: Event) => void;
  };

  constructor(canvas: HTMLCanvasElement, wasmAvailable = false) {
    this.canvas = canvas;
    this.useWasm = wasmAvailable;
    
    // Initialize state for this instance
    this.state = this.createInitialState();
    
    // Bind event handlers
    this.boundHandlers = {
      mouseMove: this.handleMouseMove.bind(this),
      mouseDown: this.handleMouseDown.bind(this),
      mouseUp: this.handleMouseUp.bind(this),
      wheel: this.handleWheel.bind(this),
      contextMenu: (e) => e.preventDefault()
    };
    
    this.initializeRenderer();
  }

  private createInitialState(): RendererState {
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
      entities: {},
      connections: [],
      render: {
        mode: 'clipart',
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
        fadeTransitions: true
      }
    };
  }

  private initializeRenderer(): void {
    if (this.useWasm) {
      try {
        // Create WASM renderer
        this.wasmRenderer = create_renderer(this.canvas);
        console.log('WASM renderer created successfully');
      } catch (error) {
        console.error('Failed to create WASM renderer:', error);
        this.useWasm = false;
      }
    }
    
    if (!this.useWasm) {
      // Fall back to 2D canvas rendering
      this.ctx2d = this.canvas.getContext('2d');
      if (!this.ctx2d) {
        console.error('Failed to get 2D rendering context');
        return;
      }
      console.log('Using 2D canvas fallback renderer');
    }
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Start render loop
    this.startRenderLoop();
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousemove', this.boundHandlers.mouseMove);
    this.canvas.addEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.addEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.addEventListener('wheel', this.boundHandlers.wheel);
    this.canvas.addEventListener('contextmenu', this.boundHandlers.contextMenu);
  }

  private removeEventListeners(): void {
    this.canvas.removeEventListener('mousemove', this.boundHandlers.mouseMove);
    this.canvas.removeEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.removeEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.removeEventListener('wheel', this.boundHandlers.wheel);
    this.canvas.removeEventListener('contextmenu', this.boundHandlers.contextMenu);
  }

  private startRenderLoop(): void {
    const render = (timestamp: number) => {
      if (this.isDisposed) return;
      
      // Update FPS
      this.updateFPS(timestamp);
      
      // Smooth animations
      this.updateAnimations(timestamp);
      
      // Render frame
      this.renderFrame();
      
      this.animationId = requestAnimationFrame(render);
    };
    
    this.animationId = requestAnimationFrame(render);
  }

  private updateFPS(timestamp: number): void {
    this.state.render.fpsCounter++;
    
    if (timestamp - this.state.render.lastFPSUpdate >= 1000) {
      this.state.render.fps = this.state.render.fpsCounter;
      this.state.render.fpsCounter = 0;
      this.state.render.lastFPSUpdate = timestamp;
    }
  }

  private updateAnimations(timestamp: number): void {
    // Smooth view transitions
    const view = this.state.view;
    const smoothing = 0.15;
    
    view.smoothPanX += (view.panX - view.smoothPanX) * smoothing;
    view.smoothPanY += (view.panY - view.smoothPanY) * smoothing;
    view.smoothZoom += (view.zoom - view.smoothZoom) * smoothing;
  }

  private renderFrame(): void {
    if (this.wasmRenderer && this.useWasm) {
      this.renderWasm();
    } else if (this.ctx2d) {
      this.render2D();
    }
  }

  private renderWasm(): void {
    if (!this.wasmRenderer) return;

    try {
      // Clear canvas
      this.wasmRenderer.clear();
      
      // Convert entities to JSON and render via WASM
      const entities = Object.values(this.state.entities).filter(e => e.visible);
      if (entities.length > 0) {
        const nodesJson = JSON.stringify(entities.map(entity => ({
          id: entity.id,
          name: entity.text,
          position: entity.position,
          size: entity.size,
          color: entity.color
        })));
        
        // Use WASM renderer's render_nodes method
        this.wasmRenderer.render_nodes(nodesJson);
      }
    } catch (error) {
      console.error('WASM rendering error:', error);
      // Could fall back to 2D rendering here
    }
  }

  private render2D(): void {
    const ctx = this.ctx2d;
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Save context state
    ctx.save();
    
    // Apply view transform
    ctx.translate(this.state.view.smoothPanX, this.state.view.smoothPanY);
    ctx.scale(this.state.view.smoothZoom, this.state.view.smoothZoom);
    
    // Render grid
    this.renderGrid(ctx);
    
    // Render connections
    this.state.connections.forEach(connection => {
      this.renderConnection2D(ctx, connection);
    });
    
    // Render entities
    Object.values(this.state.entities).forEach(entity => {
      if (!entity.visible) return;
      this.renderEntity2D(ctx, entity);
    });
    
    // Restore context state
    ctx.restore();
    
    // Render UI elements (not affected by view transform)
    this.renderUI(ctx);
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    const gridSize = 20;
    const viewBounds = this.getViewBounds();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1 / this.state.view.smoothZoom;
    
    // Vertical lines
    for (let x = Math.floor(viewBounds.left / gridSize) * gridSize; x < viewBounds.right; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, viewBounds.top);
      ctx.lineTo(x, viewBounds.bottom);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = Math.floor(viewBounds.top / gridSize) * gridSize; y < viewBounds.bottom; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(viewBounds.left, y);
      ctx.lineTo(viewBounds.right, y);
      ctx.stroke();
    }
  }

  private renderEntity2D(ctx: CanvasRenderingContext2D, entity: EntityState): void {
    const { position, size, color, text } = entity;
    
    // Draw entity box
    ctx.fillStyle = color + '33'; // Add transparency
    ctx.fillRect(position.x, position.y, size.x, size.y);
    
    // Draw border
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 / this.state.view.smoothZoom;
    ctx.strokeRect(position.x, position.y, size.x, size.y);
    
    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.font = `${14 / this.state.view.smoothZoom}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, position.x + size.x / 2, position.y + size.y / 2);
    
    // Draw selection highlight
    if (entity.id === this.state.selection.selectedId) {
      ctx.strokeStyle = '#4CAF50';
      ctx.lineWidth = 3 / this.state.view.smoothZoom;
      ctx.strokeRect(position.x - 2, position.y - 2, size.x + 4, size.y + 4);
    }
  }

  private renderConnection2D(ctx: CanvasRenderingContext2D, connection: ConnectionState): void {
    const fromEntity = this.state.entities[connection.fromId];
    const toEntity = this.state.entities[connection.toId];
    
    if (!fromEntity || !toEntity) return;
    
    // Calculate connection points
    const fromPoint = {
      x: fromEntity.position.x + fromEntity.size.x / 2,
      y: fromEntity.position.y + fromEntity.size.y / 2
    };
    
    const toPoint = {
      x: toEntity.position.x + toEntity.size.x / 2,
      y: toEntity.position.y + toEntity.size.y / 2
    };
    
    // Draw line
    ctx.strokeStyle = connection.color || '#666666';
    ctx.lineWidth = (connection.lineWidth || 2) / this.state.view.smoothZoom;
    ctx.beginPath();
    ctx.moveTo(fromPoint.x, fromPoint.y);
    ctx.lineTo(toPoint.x, toPoint.y);
    ctx.stroke();
  }

  private renderUI(ctx: CanvasRenderingContext2D): void {
    // Render FPS counter
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`FPS: ${this.state.render.fps}`, 10, 10);
    ctx.fillText(`Renderer: ${this.useWasm ? 'WASM' : '2D Canvas'}`, 10, 25);
  }

  private getViewBounds() {
    const view = this.state.view;
    return {
      left: -view.smoothPanX / view.smoothZoom,
      top: -view.smoothPanY / view.smoothZoom,
      right: (this.canvas.width - view.smoothPanX) / view.smoothZoom,
      bottom: (this.canvas.height - view.smoothPanY) / view.smoothZoom
    };
  }

  // Mouse event handlers
  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.state.interaction.mouseScreen.x = e.clientX - rect.left;
    this.state.interaction.mouseScreen.y = e.clientY - rect.top;
    
    // Convert to world coordinates
    this.state.interaction.mouseWorld.x = (this.state.interaction.mouseScreen.x - this.state.view.smoothPanX) / this.state.view.smoothZoom;
    this.state.interaction.mouseWorld.y = (this.state.interaction.mouseScreen.y - this.state.view.smoothPanY) / this.state.view.smoothZoom;
    
    // Handle panning
    if (this.state.interaction.mode === 'panning') {
      const dx = this.state.interaction.mouseScreen.x - this.state.interaction.lastMouseScreen.x;
      const dy = this.state.interaction.mouseScreen.y - this.state.interaction.lastMouseScreen.y;
      
      this.state.view.panX += dx;
      this.state.view.panY += dy;
    }
    
    this.state.interaction.lastMouseScreen.x = this.state.interaction.mouseScreen.x;
    this.state.interaction.lastMouseScreen.y = this.state.interaction.mouseScreen.y;
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button === 0) { // Left click
      // Check if clicking on an entity
      const clickedEntity = this.getEntityAtPoint(this.state.interaction.mouseWorld.x, this.state.interaction.mouseWorld.y);
      
      if (clickedEntity) {
        this.state.selection.selectedId = clickedEntity.id;
        this.state.interaction.mode = 'dragging';
        this.state.interaction.dragOffset.x = this.state.interaction.mouseWorld.x - clickedEntity.position.x;
        this.state.interaction.dragOffset.y = this.state.interaction.mouseWorld.y - clickedEntity.position.y;
      } else {
        this.state.interaction.mode = 'panning';
      }
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    this.state.interaction.mode = 'idle';
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    
    const zoomSpeed = 0.001 * this.state.view.zoomSensitivity;
    const zoomDelta = -e.deltaY * zoomSpeed;
    const newZoom = Math.max(0.1, Math.min(5, this.state.view.zoom + zoomDelta));
    
    // Zoom towards mouse position
    const mouseX = this.state.interaction.mouseScreen.x;
    const mouseY = this.state.interaction.mouseScreen.y;
    
    const worldX = (mouseX - this.state.view.panX) / this.state.view.zoom;
    const worldY = (mouseY - this.state.view.panY) / this.state.view.zoom;
    
    this.state.view.zoom = newZoom;
    
    this.state.view.panX = mouseX - worldX * newZoom;
    this.state.view.panY = mouseY - worldY * newZoom;
  }

  private getEntityAtPoint(x: number, y: number): EntityState | null {
    // Check entities in reverse order (top to bottom)
    const entities = Object.values(this.state.entities);
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      if (!entity.visible) continue;
      
      if (x >= entity.position.x && x <= entity.position.x + entity.size.x &&
          y >= entity.position.y && y <= entity.position.y + entity.size.y) {
        return entity;
      }
    }
    return null;
  }

  // Public API methods that match DiagramCanvas interface
  public async initialize(data?: any): Promise<void> {
    if (data) {
      this.loadData(data);
    }
    return Promise.resolve();
  }

  public exportData(): any {
    return {
      entities: this.state.entities,
      connections: this.state.connections,
      view: this.state.view
    };
  }

  public loadData(data: any): void {
    // Clear existing data
    this.state.entities = {};
    this.state.connections = [];
    
    // Load entities
    if (data.entities) {
      Object.entries(data.entities).forEach(([id, entity]: [string, any]) => {
        this.state.entities[id] = {
          id,
          groupType: entity.groupType || 'item',
          text: entity.text || entity.name || id,
          position: entity.position || { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
          worldPosition: entity.worldPosition,
          size: entity.size || { x: 100, y: 50 },
          parentId: entity.parentId || null,
          children: entity.children || [],
          expanded: entity.expanded !== false,
          visible: entity.visible !== false,
          icon: entity.icon || 'default',
          color: entity.color || '#4a90e2'
        };
      });
    }
    
    // Load connections
    if (data.connections) {
      data.connections.forEach((conn: any) => {
        this.state.connections.push({
          id: conn.id || `conn_${Date.now()}`,
          fromId: conn.fromId,
          toId: conn.toId,
          type: conn.type || 'straight',
          color: conn.color || '#666666',
          lineWidth: conn.lineWidth || 2
        });
      });
    }
    
    // Load view state
    if (data.view) {
      Object.assign(this.state.view, data.view);
    }
    
    this.state.render.needsRedraw = true;
    console.log(`Loaded data: ${Object.keys(this.state.entities).length} entities, ${this.state.connections.length} connections`);
  }

  public addEntity(entity: Partial<EntityState> | string): string {
    let entityData: Partial<EntityState>;
    
    if (typeof entity === 'string') {
      // Handle JSON string
      try {
        entityData = JSON.parse(entity);
      } catch (error) {
        console.error('Failed to parse entity JSON:', error);
        return '';
      }
    } else {
      entityData = entity;
    }

    const id = entityData.id || `entity_${Date.now()}`;
    this.state.entities[id] = {
      id,
      groupType: entityData.groupType || 'item',
      text: entityData.text || 'New Entity',
      position: entityData.position || { x: 100, y: 100 },
      size: entityData.size || { x: 100, y: 50 },
      parentId: entityData.parentId || null,
      children: entityData.children || [],
      expanded: entityData.expanded !== false,
      visible: entityData.visible !== false,
      icon: entityData.icon || 'default',
      color: entityData.color || '#4a90e2'
    };
    
    // Also add via WASM if available
    if (this.wasmRenderer && this.useWasm) {
      try {
        const entityData = JSON.stringify({
          id,
          name: this.state.entities[id].text,
          position: this.state.entities[id].position,
          size: this.state.entities[id].size,
          color: this.state.entities[id].color
        });
        
        this.wasmRenderer.add_entity(entityData);
      } catch (error) {
        console.warn('WASM add_entity failed:', error);
      }
    }
    
    this.state.render.needsRedraw = true;
    return id;
  }

  public removeEntity(entityId: string): void {
    delete this.state.entities[entityId];
    
    // Remove connections to/from this entity
    this.state.connections = this.state.connections.filter(
      conn => conn.fromId !== entityId && conn.toId !== entityId
    );
    
    this.state.render.needsRedraw = true;
  }

  public addConnection(fromId: string, toId: string, options?: any): string {
    const id = options?.id || `conn_${Date.now()}`;
    this.state.connections.push({
      id,
      fromId,
      toId,
      type: options?.type || 'straight',
      color: options?.color || '#666666',
      lineWidth: options?.lineWidth || 2
    });
    
    this.state.render.needsRedraw = true;
    return id;
  }

  public removeConnection(connectionId: string): void {
    this.state.connections = this.state.connections.filter(conn => conn.id !== connectionId);
    this.state.render.needsRedraw = true;
  }

  public getState(): RendererState {
    return this.state;
  }

  public setView(view: Partial<ViewState>): void {
    Object.assign(this.state.view, view);
    this.state.render.needsRedraw = true;
  }

  public getView(): Partial<ViewState> {
    return this.state.view;
  }

  public zoomToFit(): void {
    const entities = Object.values(this.state.entities);
    if (entities.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    entities.forEach(entity => {
      minX = Math.min(minX, entity.position.x);
      minY = Math.min(minY, entity.position.y);
      maxX = Math.max(maxX, entity.position.x + entity.size.x);
      maxY = Math.max(maxY, entity.position.y + entity.size.y);
    });
    
    const padding = 50;
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    
    const zoomX = (this.canvas.width - padding * 2) / boundsWidth;
    const zoomY = (this.canvas.height - padding * 2) / boundsHeight;
    const zoom = Math.min(zoomX, zoomY, 2);
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    this.state.view.zoom = zoom;
    this.state.view.panX = this.canvas.width / 2 - centerX * zoom;
    this.state.view.panY = this.canvas.height / 2 - centerY * zoom;
    
    this.state.render.needsRedraw = true;
  }

  public resetView(): void {
    this.state.view.zoom = 1;
    this.state.view.panX = 0;
    this.state.view.panY = 0;
    this.state.render.needsRedraw = true;
  }

  public setRenderMode(mode: 'clipart' | 'linedraw'): void {
    this.state.render.mode = mode;
    this.state.render.needsRedraw = true;
  }

  public getPerformanceMetrics(): any {
    return {
      fps: this.state.render.fps,
      entityCount: Object.keys(this.state.entities).length,
      connectionCount: this.state.connections.length,
      wasmStatus: {
        initialized: this.useWasm,
        wasmAvailable: this.wasmRenderer !== null,
        fallbackMode: !this.useWasm
      }
    };
  }

  public dispose(): void {
    this.isDisposed = true;
    
    // Cancel animation frame
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    
    // Remove event listeners
    this.removeEventListeners();
    
    // Clean up WASM resources
    if (this.wasmRenderer) {
      try {
        this.wasmRenderer.free();
      } catch (error) {
        console.warn('Error disposing WASM renderer:', error);
      }
      this.wasmRenderer = null;
    }
  }
}