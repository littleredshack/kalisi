import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

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
}

export interface WasmConnection {
  id: string;
  from: string;
  to: string;
  type?: string;
  points?: {x: number, y: number}[];
}

export interface WasmState {
  renderMode: 'clipart' | 'line';
  showDebugPanel: boolean;
  entityPositions: {[key: string]: {x: number, y: number, width: number, height: number}};
  interactionMode: 'idle' | 'dragging' | 'resizing';
  dragOffset: {x: number, y: number};
  resizeHandle: string | null;
  selectedEntityId: string | null;
  hoverTarget: string | null;
  undoStack: any[];
  redoStack: any[];
}

export interface ViewState {
  id: string;
  viewType: 'payment-systems' | 'risk-models' | 'processes' | 'systems' | 'default';
  backgroundColor: string;
  entities: WasmEntity[];
  connections: WasmConnection[];
  selectedEntity: string | null;
  panX: number;
  panY: number;
  zoom: number;
  
  // WASM-specific state (added depth)
  wasmState?: WasmState;
  
  lastUpdated: Date;
}

@Injectable({
  providedIn: 'root'
})
export class ViewSpecificStateService {
  private viewStates = new Map<string, ViewState>();
  private currentViewId: string | null = null;
  
  private currentViewState = new BehaviorSubject<ViewState | null>(null);
  public currentViewState$ = this.currentViewState.asObservable();

  constructor() {
    // Initialize default view states for each entity type
    this.initializeViewStates();
  }

  private initializeViewStates() {
    const entityTypes = [
      { id: 'payment-systems', type: 'payment-systems' as const, color: 'rgba(239, 68, 68, 0.6)' },
      { id: 'risk-models', type: 'risk-models' as const, color: 'rgba(168, 85, 247, 0.6)' },
      { id: 'processes', type: 'processes' as const, color: 'rgba(34, 197, 94, 0.6)' },
      { id: 'systems', type: 'systems' as const, color: 'rgba(245, 158, 11, 0.6)' }
    ];

    entityTypes.forEach(entity => {
      const viewState: ViewState = {
        id: entity.id,
        viewType: entity.type,
        backgroundColor: entity.color,
        entities: [],
        connections: [],
        selectedEntity: null,
        panX: 0,
        panY: 0,
        zoom: 1,
        lastUpdated: new Date()
      };
      
      this.viewStates.set(entity.id, viewState);
    });
  }

  /**
   * Switch to a specific view and return its state
   */
  switchToView(viewId: string): ViewState | null {
    const viewState = this.viewStates.get(viewId);
    if (!viewState) {
      return null;
    }

    this.currentViewId = viewId;
    this.currentViewState.next(viewState);
    return viewState;
  }

  /**
   * Update the current view's state
   */
  updateCurrentViewState(updates: Partial<ViewState>): boolean {
    if (!this.currentViewId) {
      return false;
    }

    const currentState = this.viewStates.get(this.currentViewId);
    if (!currentState) {
      return false;
    }

    const updatedState: ViewState = {
      ...currentState,
      ...updates,
      lastUpdated: new Date()
    };

    this.viewStates.set(this.currentViewId, updatedState);
    this.currentViewState.next(updatedState);
    return true;
  }

  /**
   * Get state for a specific view
   */
  getViewState(viewId: string): ViewState | null {
    return this.viewStates.get(viewId) || null;
  }

  /**
   * Get current active view state
   */
  getCurrentViewState(): ViewState | null {
    return this.currentViewId ? this.viewStates.get(this.currentViewId) || null : null;
  }

  /**
   * Update entities for a specific view
   */
  updateViewEntities(viewId: string, entities: any[]): boolean {
    const viewState = this.viewStates.get(viewId);
    if (!viewState) {
      return false;
    }

    viewState.entities = entities;
    viewState.lastUpdated = new Date();
    
    if (this.currentViewId === viewId) {
      this.currentViewState.next(viewState);
    }
    
    return true;
  }

  /**
   * Update connections for a specific view
   */
  updateViewConnections(viewId: string, connections: any[]): boolean {
    const viewState = this.viewStates.get(viewId);
    if (!viewState) {
      return false;
    }

    viewState.connections = connections;
    viewState.lastUpdated = new Date();
    
    if (this.currentViewId === viewId) {
      this.currentViewState.next(viewState);
    }
    
    return true;
  }

  /**
   * Select an entity in the current view
   */
  selectEntity(entityId: string): boolean {
    return this.updateCurrentViewState({
      selectedEntity: entityId
    });
  }

  /**
   * Update view position and zoom
   */
  updateViewTransform(panX: number, panY: number, zoom: number): boolean {
    return this.updateCurrentViewState({
      panX,
      panY,
      zoom
    });
  }

  /**
   * Get all view states
   */
  getAllViewStates(): Map<string, ViewState> {
    return new Map(this.viewStates);
  }

  /**
   * Reset a view to its initial state
   */
  resetView(viewId: string): boolean {
    const viewState = this.viewStates.get(viewId);
    if (!viewState) {
      return false;
    }

    // Reset to initial state but keep view type and background color
    const resetState: ViewState = {
      ...viewState,
      entities: [],
      connections: [],
      selectedEntity: null,
      panX: 0,
      panY: 0,
      zoom: 1,
      wasmState: viewState.wasmState ? {
        ...viewState.wasmState,
        selectedEntityId: null,
        hoverTarget: null,
        interactionMode: 'idle',
        undoStack: [],
        redoStack: []
      } : undefined,
      lastUpdated: new Date()
    };

    this.viewStates.set(viewId, resetState);
    
    if (this.currentViewId === viewId) {
      this.currentViewState.next(resetState);
    }
    
    return true;
  }

  /**
   * Initialize WASM state for a view
   */
  initializeWasmState(viewId: string): boolean {
    const viewState = this.viewStates.get(viewId);
    if (!viewState) {
      return false;
    }

    const wasmState: WasmState = {
      renderMode: 'clipart',
      showDebugPanel: false,
      entityPositions: {},
      interactionMode: 'idle',
      dragOffset: { x: 0, y: 0 },
      resizeHandle: null,
      selectedEntityId: null,
      hoverTarget: null,
      undoStack: [],
      redoStack: []
    };

    viewState.wasmState = wasmState;
    viewState.lastUpdated = new Date();
    
    if (this.currentViewId === viewId) {
      this.currentViewState.next(viewState);
    }
    
    return true;
  }

  /**
   * Update WASM state for current view
   */
  updateWasmState(updates: Partial<WasmState>): boolean {
    if (!this.currentViewId) return false;
    
    const viewState = this.viewStates.get(this.currentViewId);
    if (!viewState || !viewState.wasmState) {
      return false;
    }

    viewState.wasmState = {
      ...viewState.wasmState,
      ...updates
    };
    viewState.lastUpdated = new Date();
    
    this.currentViewState.next(viewState);
    return true;
  }

  /**
   * Add state to undo stack for current view
   */
  pushUndoState(state: any): boolean {
    if (!this.currentViewId) return false;
    
    const viewState = this.viewStates.get(this.currentViewId);
    if (!viewState?.wasmState) {
      return false;
    }

    // Deep clone state for undo stack
    const stateClone = JSON.parse(JSON.stringify(state));
    viewState.wasmState.undoStack.push(stateClone);
    
    // Limit undo stack size
    if (viewState.wasmState.undoStack.length > 50) {
      viewState.wasmState.undoStack.shift();
    }
    
    // Clear redo stack when new action performed
    viewState.wasmState.redoStack = [];
    
    return true;
  }

  /**
   * Undo last action
   */
  undo(): any | null {
    if (!this.currentViewId) return null;
    
    const viewState = this.viewStates.get(this.currentViewId);
    if (!viewState?.wasmState || viewState.wasmState.undoStack.length === 0) {
      return null;
    }

    const previousState = viewState.wasmState.undoStack.pop();
    if (previousState) {
      // Push current state to redo stack before restoring
      const currentState = { entities: viewState.entities, connections: viewState.connections };
      viewState.wasmState.redoStack.push(JSON.parse(JSON.stringify(currentState)));
      
      return previousState;
    }
    
    return null;
  }

  /**
   * Redo last undone action
   */
  redo(): any | null {
    if (!this.currentViewId) return null;
    
    const viewState = this.viewStates.get(this.currentViewId);
    if (!viewState?.wasmState || viewState.wasmState.redoStack.length === 0) {
      return null;
    }

    const redoState = viewState.wasmState.redoStack.pop();
    if (redoState) {
      // Push current state back to undo stack
      const currentState = { entities: viewState.entities, connections: viewState.connections };
      viewState.wasmState.undoStack.push(JSON.parse(JSON.stringify(currentState)));
      
      return redoState;
    }
    
    return null;
  }

  /**
   * Save current view state to localStorage
   */
  saveViewState(viewId: string): boolean {
    const viewState = this.viewStates.get(viewId);
    if (!viewState) return false;

    try {
      const serializedState = JSON.stringify({
        entities: viewState.entities,
        connections: viewState.connections,
        panX: viewState.panX,
        panY: viewState.panY,
        zoom: viewState.zoom,
        wasmState: viewState.wasmState
      });
      
      localStorage.setItem(`kalisi_view_state_${viewId}`, serializedState);
      return true;
    } catch (error) {
      console.error('Failed to save view state:', error);
      return false;
    }
  }

  /**
   * Load view state from localStorage
   */
  loadViewState(viewId: string): boolean {
    try {
      const serializedState = localStorage.getItem(`kalisi_view_state_${viewId}`);
      if (!serializedState) return false;

      const savedState = JSON.parse(serializedState);
      
      return this.updateCurrentViewState({
        entities: savedState.entities || [],
        connections: savedState.connections || [],
        panX: savedState.panX || 0,
        panY: savedState.panY || 0,
        zoom: savedState.zoom || 1,
        wasmState: savedState.wasmState
      });
    } catch (error) {
      console.error('Failed to load view state:', error);
      return false;
    }
  }

  saveEntityPosition(entityId: string, position: {x: number, y: number, width: number, height: number}): void {
    const currentState = this.currentViewState.value;
    if (currentState && currentState.wasmState) {
      currentState.wasmState.entityPositions[entityId] = position;
      this.saveViewState(currentState.id);
      console.log(`💾 Saved position for ${entityId}:`, position);
    }
  }

  getEntityPosition(entityId: string): {x: number, y: number, width: number, height: number} | null {
    const currentState = this.currentViewState.value;
    if (currentState && currentState.wasmState) {
      return currentState.wasmState.entityPositions[entityId] || null;
    }
    return null;
  }
}