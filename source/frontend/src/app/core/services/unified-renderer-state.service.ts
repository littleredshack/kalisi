import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

// =============================================================================
// UNIFIED RENDERER STATE ARCHITECTURE
// Consolidates ViewSpecificStateService, StateManagerService, WebGLRendererService
// =============================================================================

export interface WasmEntity {
  id: string;
  name: string;
  type: 'container' | 'item';
  x: number;
  y: number;
  width: number;
  height: number;
  expanded?: boolean;
  children?: string[];
  parent?: string | null;
  // Animation state for expand/collapse
  animationState?: {
    startSize?: { x: number; y: number };
    targetSize?: { x: number; y: number };
    startTime?: number;
    duration?: number;
  };
}

export interface WasmConnection {
  id: string;
  from: string;
  to: string;
  type?: string;
  points?: {x: number, y: number}[];
}

export interface ViewTransform {
  panX: number;
  panY: number;
  zoom: number;
  smoothPanX: number;
  smoothPanY: number;
  smoothZoom: number;
}

export interface SelectionState {
  selectedIds: Set<string>;
  hoveredId: string | null;
  lastClickTime: number;
  lastClickTarget: string | null;
}

export interface InteractionState {
  mode: 'idle' | 'panning' | 'dragging' | 'resizing';
  resizeHandle: string | null;
  dragOffset: { x: number; y: number };
  mouseWorld: { x: number; y: number };
  mouseScreen: { x: number; y: number };
}

export interface RenderConfig {
  mode: 'wasm' | '2d-fallback';
  renderStyle: 'clipart' | 'linedraw';
  showDebugPanel: boolean;
  effects: {
    smoothMovement: boolean;
    hideChildrenMode: boolean;
    enableBloom: boolean;
    enableShadows: boolean;
  };
}

export interface PerformanceState {
  fps: number;
  fpsCounter: number;
  lastFPSUpdate: number;
  needsRedraw: boolean;
  entityCount: number;
  connectionCount: number;
}

// Unified state structure that consolidates all renderer concerns
export interface RendererState {
  // Instance identification
  instanceId: string;
  viewType: 'risk-models' | 'processes' | 'systems' | 'payment-models';
  
  // View-level state (pan, zoom, selection)
  viewTransform: ViewTransform;
  selection: SelectionState;
  interaction: InteractionState;
  
  // Entity and connection data
  entities: Map<string, WasmEntity>;
  connections: WasmConnection[];
  
  // Renderer configuration
  renderConfig: RenderConfig;
  performance: PerformanceState;
  
  // Tree operations state
  treeState: {
    undoStack: any[];
    redoStack: any[];
    maxUndoSize: number;
  };
  
  // Timestamps
  createdAt: Date;
  lastUpdated: Date;
}

export interface TreeOperation {
  type: 'expand' | 'collapse' | 'toggle' | 'move' | 'resize';
  entityId: string;
  previousState?: any;
  newState?: any;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class UnifiedRendererStateService {
  private rendererStates = new Map<string, RendererState>();
  private currentInstanceId: string | null = null;
  
  // Observable streams for state changes
  private stateChangeSubject = new BehaviorSubject<RendererState | null>(null);
  private treeOperationSubject = new Subject<TreeOperation>();
  
  public stateChange$ = this.stateChangeSubject.asObservable();
  public treeOperation$ = this.treeOperationSubject.asObservable();

  constructor() {
    console.log('UnifiedRendererStateService initialized');
  }

  // =============================================================================
  // RENDERER INSTANCE MANAGEMENT
  // =============================================================================

  createRendererInstance(
    instanceId: string, 
    viewType: 'risk-models' | 'processes' | 'systems' | 'payment-models'
  ): RendererState {
    // Create fresh state instance
    const rendererState: RendererState = {
      instanceId,
      viewType,
      viewTransform: {
        panX: 0,
        panY: 0,
        zoom: 1,
        smoothPanX: 0,
        smoothPanY: 0,
        smoothZoom: 1
      },
      selection: {
        selectedIds: new Set<string>(),
        hoveredId: null,
        lastClickTime: 0,
        lastClickTarget: null
      },
      interaction: {
        mode: 'idle',
        resizeHandle: null,
        dragOffset: { x: 0, y: 0 },
        mouseWorld: { x: 0, y: 0 },
        mouseScreen: { x: 0, y: 0 }
      },
      entities: new Map<string, WasmEntity>(),
      connections: [],
      renderConfig: {
        mode: 'wasm',
        renderStyle: 'clipart',
        showDebugPanel: false,
        effects: {
          smoothMovement: true,
          hideChildrenMode: false,
          enableBloom: false,
          enableShadows: false
        }
      },
      performance: {
        fps: 0,
        fpsCounter: 0,
        lastFPSUpdate: 0,
        needsRedraw: true,
        entityCount: 0,
        connectionCount: 0
      },
      treeState: {
        undoStack: [],
        redoStack: [],
        maxUndoSize: 50
      },
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    // Initialize with view-specific default entities
    this.initializeDefaultEntities(rendererState);
    
    this.rendererStates.set(instanceId, rendererState);
    console.log(`Created renderer instance: ${instanceId} (${viewType})`);
    
    return rendererState;
  }

  getRendererInstance(instanceId: string): RendererState | null {
    return this.rendererStates.get(instanceId) || null;
  }

  switchToInstance(instanceId: string): RendererState | null {
    const state = this.rendererStates.get(instanceId);
    if (state) {
      this.currentInstanceId = instanceId;
      this.stateChangeSubject.next(state);
      return state;
    }
    return null;
  }

  getCurrentInstance(): RendererState | null {
    if (!this.currentInstanceId) return null;
    return this.rendererStates.get(this.currentInstanceId) || null;
  }

  destroyRendererInstance(instanceId: string): boolean {
    const success = this.rendererStates.delete(instanceId);
    if (success && this.currentInstanceId === instanceId) {
      this.currentInstanceId = null;
      this.stateChangeSubject.next(null);
    }
    console.log(`Destroyed renderer instance: ${instanceId}`);
    return success;
  }

  // =============================================================================
  // ENTITY MANAGEMENT
  // =============================================================================

  addEntity(entity: WasmEntity, instanceId?: string): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state) return false;

    state.entities.set(entity.id, { ...entity });
    state.performance.entityCount = state.entities.size;
    state.performance.needsRedraw = true;
    this.updateTimestamp(state);
    
    if (targetInstanceId === this.currentInstanceId) {
      this.stateChangeSubject.next(state);
    }
    
    return true;
  }

  removeEntity(entityId: string, instanceId?: string): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state) return false;

    const removed = state.entities.delete(entityId);
    if (removed) {
      // Remove from selection if selected
      state.selection.selectedIds.delete(entityId);
      if (state.selection.hoveredId === entityId) {
        state.selection.hoveredId = null;
      }
      
      // Remove connections to/from this entity
      state.connections = state.connections.filter(
        conn => conn.from !== entityId && conn.to !== entityId
      );
      
      state.performance.entityCount = state.entities.size;
      state.performance.connectionCount = state.connections.length;
      state.performance.needsRedraw = true;
      this.updateTimestamp(state);
      
      if (targetInstanceId === this.currentInstanceId) {
        this.stateChangeSubject.next(state);
      }
    }
    
    return removed;
  }

  updateEntity(entityId: string, updates: Partial<WasmEntity>, instanceId?: string): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state) return false;

    const entity = state.entities.get(entityId);
    if (!entity) return false;

    // Create updated entity
    const updatedEntity: WasmEntity = { ...entity, ...updates };
    state.entities.set(entityId, updatedEntity);
    state.performance.needsRedraw = true;
    this.updateTimestamp(state);
    
    if (targetInstanceId === this.currentInstanceId) {
      this.stateChangeSubject.next(state);
    }
    
    return true;
  }

  getEntity(entityId: string, instanceId?: string): WasmEntity | null {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return null;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state) return null;

    return state.entities.get(entityId) || null;
  }

  // =============================================================================
  // TREE OPERATIONS (CENTRALIZED)
  // =============================================================================

  expandEntity(entityId: string, instanceId?: string): boolean {
    return this.setEntityExpansion(entityId, true, instanceId);
  }

  collapseEntity(entityId: string, instanceId?: string): boolean {
    return this.setEntityExpansion(entityId, false, instanceId);
  }

  toggleEntity(entityId: string, instanceId?: string): boolean {
    const entity = this.getEntity(entityId, instanceId);
    if (!entity) return false;
    
    return this.setEntityExpansion(entityId, !entity.expanded, instanceId);
  }

  private setEntityExpansion(entityId: string, expanded: boolean, instanceId?: string): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state) return false;

    const entity = state.entities.get(entityId);
    if (!entity) return false;

    // Store previous state for undo
    const previousState = { ...entity };
    
    // Create tree operation for undo/redo
    const operation: TreeOperation = {
      type: expanded ? 'expand' : 'collapse',
      entityId,
      previousState,
      newState: { ...entity, expanded },
      timestamp: new Date()
    };

    // Push to undo stack
    this.pushUndoOperation(operation, state);

    // Update entity
    entity.expanded = expanded;
    
    // Handle animation if smooth movement enabled
    if (state.renderConfig.effects.smoothMovement) {
      entity.animationState = {
        startSize: { x: entity.width, y: entity.height },
        targetSize: { x: entity.width, y: expanded ? entity.height : entity.height * 0.5 },
        startTime: Date.now(),
        duration: 200
      };
    }

    state.entities.set(entityId, entity);
    state.performance.needsRedraw = true;
    this.updateTimestamp(state);
    
    // Emit tree operation
    this.treeOperationSubject.next(operation);
    
    if (targetInstanceId === this.currentInstanceId) {
      this.stateChangeSubject.next(state);
    }
    
    return true;
  }

  // =============================================================================
  // VIEW TRANSFORM OPERATIONS
  // =============================================================================

  updateViewTransform(
    transform: Partial<ViewTransform>, 
    instanceId?: string
  ): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state) return false;

    Object.assign(state.viewTransform, transform);
    state.performance.needsRedraw = true;
    this.updateTimestamp(state);
    
    if (targetInstanceId === this.currentInstanceId) {
      this.stateChangeSubject.next(state);
    }
    
    return true;
  }

  resetView(instanceId?: string): boolean {
    const resetTransform: ViewTransform = {
      panX: 0,
      panY: 0,
      zoom: 1,
      smoothPanX: 0,
      smoothPanY: 0,
      smoothZoom: 1
    };
    
    return this.updateViewTransform(resetTransform, instanceId);
  }

  // =============================================================================
  // SELECTION MANAGEMENT
  // =============================================================================

  selectEntity(entityId: string, instanceId?: string): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state) return false;

    state.selection.selectedIds.clear();
    state.selection.selectedIds.add(entityId);
    state.selection.lastClickTime = Date.now();
    state.selection.lastClickTarget = entityId;
    state.performance.needsRedraw = true;
    this.updateTimestamp(state);
    
    if (targetInstanceId === this.currentInstanceId) {
      this.stateChangeSubject.next(state);
    }
    
    return true;
  }

  clearSelection(instanceId?: string): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state) return false;

    state.selection.selectedIds.clear();
    state.selection.hoveredId = null;
    state.performance.needsRedraw = true;
    this.updateTimestamp(state);
    
    if (targetInstanceId === this.currentInstanceId) {
      this.stateChangeSubject.next(state);
    }
    
    return true;
  }

  // =============================================================================
  // UNDO/REDO OPERATIONS
  // =============================================================================

  private pushUndoOperation(operation: TreeOperation, state: RendererState): void {
    state.treeState.undoStack.push(operation);
    
    // Limit undo stack size
    if (state.treeState.undoStack.length > state.treeState.maxUndoSize) {
      state.treeState.undoStack.shift();
    }
    
    // Clear redo stack when new operation is performed
    state.treeState.redoStack = [];
  }

  undo(instanceId?: string): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state || state.treeState.undoStack.length === 0) return false;

    const operation = state.treeState.undoStack.pop();
    if (!operation) return false;

    // Apply reverse operation
    const entity = state.entities.get(operation.entityId);
    if (entity && operation.previousState) {
      Object.assign(entity, operation.previousState);
      state.entities.set(operation.entityId, entity);
    }

    // Push to redo stack
    state.treeState.redoStack.push(operation);
    
    state.performance.needsRedraw = true;
    this.updateTimestamp(state);
    
    if (targetInstanceId === this.currentInstanceId) {
      this.stateChangeSubject.next(state);
    }
    
    return true;
  }

  redo(instanceId?: string): boolean {
    const targetInstanceId = instanceId || this.currentInstanceId;
    if (!targetInstanceId) return false;

    const state = this.rendererStates.get(targetInstanceId);
    if (!state || state.treeState.redoStack.length === 0) return false;

    const operation = state.treeState.redoStack.pop();
    if (!operation) return false;

    // Apply operation
    const entity = state.entities.get(operation.entityId);
    if (entity && operation.newState) {
      Object.assign(entity, operation.newState);
      state.entities.set(operation.entityId, entity);
    }

    // Push back to undo stack
    state.treeState.undoStack.push(operation);
    
    state.performance.needsRedraw = true;
    this.updateTimestamp(state);
    
    if (targetInstanceId === this.currentInstanceId) {
      this.stateChangeSubject.next(state);
    }
    
    return true;
  }

  // =============================================================================
  // PERSISTENCE
  // =============================================================================

  saveState(instanceId: string): boolean {
    const state = this.rendererStates.get(instanceId);
    if (!state) return false;

    try {
      const serializedState = {
        instanceId: state.instanceId,
        viewType: state.viewType,
        viewTransform: state.viewTransform,
        entities: Array.from(state.entities.entries()),
        connections: state.connections,
        renderConfig: state.renderConfig
      };
      
      localStorage.setItem(
        `kalisi_renderer_state_${instanceId}`,
        JSON.stringify(serializedState)
      );
      
      console.log(`Saved state for instance: ${instanceId}`);
      return true;
    } catch (error) {
      console.error('Failed to save renderer state:', error);
      return false;
    }
  }

  loadState(instanceId: string): boolean {
    try {
      const serialized = localStorage.getItem(`kalisi_renderer_state_${instanceId}`);
      if (!serialized) return false;

      const savedState = JSON.parse(serialized);
      const currentState = this.rendererStates.get(instanceId);
      if (!currentState) return false;

      // Restore saved state
      currentState.viewTransform = savedState.viewTransform || currentState.viewTransform;
      currentState.renderConfig = { ...currentState.renderConfig, ...savedState.renderConfig };
      currentState.connections = savedState.connections || [];
      
      // Restore entities
      if (savedState.entities) {
        currentState.entities.clear();
        savedState.entities.forEach(([id, entity]: [string, WasmEntity]) => {
          currentState.entities.set(id, entity);
        });
      }

      currentState.performance.entityCount = currentState.entities.size;
      currentState.performance.connectionCount = currentState.connections.length;
      currentState.performance.needsRedraw = true;
      this.updateTimestamp(currentState);
      
      if (instanceId === this.currentInstanceId) {
        this.stateChangeSubject.next(currentState);
      }
      
      console.log(`Loaded state for instance: ${instanceId}`);
      return true;
    } catch (error) {
      console.error('Failed to load renderer state:', error);
      return false;
    }
  }

  // =============================================================================
  // PRIVATE UTILITIES
  // =============================================================================

  private initializeDefaultEntities(state: RendererState): void {
    if (state.viewType === 'risk-models') {
      const riskEntities: WasmEntity[] = [
        {
          id: 'credit-risk',
          name: 'Credit Risk',
          type: 'container',
          x: -6,
          y: 0,
          width: 8,
          height: 8,
          expanded: true,
          children: [],
          parent: null
        },
        {
          id: 'market-risk',
          name: 'Market Risk',
          type: 'container',
          x: -6,
          y: 10,
          width: 8,
          height: 6,
          expanded: true,
          children: [],
          parent: null
        },
        {
          id: 'operational-risk',
          name: 'Operational Risk',
          type: 'container',
          x: 6,
          y: 0,
          width: 8,
          height: 8,
          expanded: true,
          children: [],
          parent: null
        },
        {
          id: 'compliance-risk',
          name: 'Compliance Risk',
          type: 'container',
          x: 6,
          y: 10,
          width: 8,
          height: 6,
          expanded: true,
          children: [],
          parent: null
        }
      ];

      riskEntities.forEach(entity => {
        state.entities.set(entity.id, entity);
      });
    }
    // Add other view types as needed

    state.performance.entityCount = state.entities.size;
  }

  private updateTimestamp(state: RendererState): void {
    state.lastUpdated = new Date();
  }
}