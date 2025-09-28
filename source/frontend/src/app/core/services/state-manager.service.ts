import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { filter, map, distinctUntilChanged } from 'rxjs/operators';

/**
 * StateManagerService - Manages independent STATE instances for each tab
 * Part of FR-006: Tab-Specific STATE Management with Observable pattern
 *
 * Each tab has its own completely independent STATE instance that runs continuously
 * No saving/loading occurs on tab switch - only visibility changes
 * Components can subscribe to STATE changes via Observables
 */

// Interface for STATE change events
export interface StateChangeEvent {
  tabId: string;
  path: string[]; // e.g., ['selection', 'selectedId'] or ['entities', 'entity1', 'x']
  value: any;
  previousValue?: any;
  timestamp: number;
}

// Interface for entity change events
export interface EntityChangeEvent {
  tabId: string;
  entityId: string;
  property: string;
  value: any;
  previousValue?: any;
}

@Injectable({
  providedIn: 'root',
})
export class StateManagerService {
  // Map of tab ID to its independent STATE instance
  private tabStates: Map<string, any> = new Map();

  // Map of tab ID to its BehaviorSubject for STATE changes
  private tabStateSubjects: Map<string, BehaviorSubject<any>> = new Map();

  // Map of tab ID to its renderer instance
  private tabRenderers: Map<string, any> = new Map();

  // Map of tab ID to its canvas element
  private tabCanvases: Map<string, HTMLCanvasElement> = new Map();

  // Currently visible tab ID
  private activeTabId: string | null = null;

  // Subject for active tab changes
  private activeTabSubject = new BehaviorSubject<string | null>(null);

  // Subject for STATE change events (all tabs)
  private stateChangeSubject = new Subject<StateChangeEvent>();

  // Subject for entity-specific changes
  private entityChangeSubject = new Subject<EntityChangeEvent>();

  constructor() {
    // console.log('[StateManager] Service initialized with Observable support');

    // Set up global STATE change listener for WASM renderer compatibility
    this.setupGlobalStateListener();
  }

  /**
   * Set up a global listener to detect STATE changes from WASM renderer
   */
  private setupGlobalStateListener(): void {
    // Disabled for now - may interfere with WASM renderer initialization
    // Will rely on explicit notifyStateChange calls instead
  }

  /**
   * Create a new independent STATE instance for a tab with Observable support
   * Canvas 1 gets default entities, others start empty
   */
  createTabState(tabId: string, isFirstTab: boolean = false): any {
    // console.log(
    //   `[StateManager] Creating STATE for tab: ${tabId}, isFirstTab: ${isFirstTab}`,
    // );

    // Always create a new STATE object
    // The renderer will use window.STATE which we'll sync with
    const newState = {
      // View state
      view: {
        panX: 0,
        panY: 0,
        zoom: 1,
        smoothPanX: 0,
        smoothPanY: 0,
        smoothZoom: 1,
        panSensitivity: 1.0,
        zoomSensitivity: 3.0,
        zoomMin: 0.1,
        zoomMax: 10,
      },

      // Selection state
      selection: {
        selectedId: null,
        selectedType: null,
        hoverTarget: null,
        multiSelectIds: new Set(),
        dragOffset: { x: 0, y: 0 },
        lastClickTarget: null,
        lastClickTime: 0,
      },

      // Interaction state
      interaction: {
        mode: 'idle', // 'idle', 'panning', 'dragging', 'selecting'
        isPanning: false,
        isDragging: false,
        isSelecting: false,
        mouseDown: false,
        mouseScreen: { x: 0, y: 0 },
        lastMouseScreen: { x: 0, y: 0 },
        mouseWorld: { x: 0, y: 0 },
        selectBox: null,
      },

      // Entities and connections - EMPTY for non-first tabs
      entities: {},
      connections: [],

      // Entity type tracking
      entityTypes: {
        groups: new Set(),
        items: new Set(),
      },

      // Animation state
      animations: {
        active: new Set(),
        config: {
          duration: 0.5,
          easing: 'ease-in-out',
        },
      },

      // Render state
      render: {
        mode: 'linedraw',
        needsRedraw: true,
        fps: 0,
        lastFrameTime: 0,
        color: [255, 87, 34],
        font: 'Arial',
        fontSize: 14,
      },

      // Effects state
      effects: {
        smoothMovement: true,
        hideChildrenMode: false,
        showGrid: false,
        showDebug: false,
        enableBloom: false,
        enableShadows: true,
      },
    };

    // Store the STATE instance for this tab
    this.tabStates.set(tabId, newState);

    // Create BehaviorSubject for this tab's STATE
    const stateSubject = new BehaviorSubject(newState);
    this.tabStateSubjects.set(tabId, stateSubject);

    // DISABLED PROXY FOR NOW - it may interfere with WASM renderer
    // Will rely on explicit notifyStateChange calls from renderer
    // const proxiedState = this.createStateProxy(newState, tabId);
    // this.tabStates.set(tabId, proxiedState);

    // For the first tab, we'll populate it with default entities later
    // during renderer initialization

    return newState;
  }

  /**
   * Get the STATE instance for a specific tab
   */
  getTabState(tabId: string): any {
    return this.tabStates.get(tabId);
  }

  /**
   * Get Observable for a specific tab's STATE
   */
  getTabState$(tabId: string): Observable<any> {
    let subject = this.tabStateSubjects.get(tabId);
    if (!subject) {
      // Create a new subject if it doesn't exist
      const state = this.tabStates.get(tabId) || null;
      subject = new BehaviorSubject(state);
      this.tabStateSubjects.set(tabId, subject);
    }
    return subject.asObservable();
  }

  /**
   * Get Observable for the active tab's STATE
   */
  getActiveTabState$(): Observable<any> {
    return this.activeTabSubject.pipe(
      filter((tabId) => tabId !== null),
      distinctUntilChanged(),
      map((tabId) => this.getTabState(tabId!)),
    );
  }

  /**
   * Get Observable for STATE change events
   */
  getStateChanges$(): Observable<StateChangeEvent> {
    return this.stateChangeSubject.asObservable();
  }

  /**
   * Get Observable for entity changes in a specific tab
   */
  getEntityChanges$(tabId?: string): Observable<EntityChangeEvent> {
    return this.entityChangeSubject.pipe(
      filter((event) => !tabId || event.tabId === tabId),
    );
  }

  /**
   * Create a Proxy to track STATE changes
   */
  private createStateProxy(
    state: any,
    tabId: string,
    path: string[] = [],
  ): any {
    const that = this;

    return new Proxy(state, {
      get(target, property) {
        const value = target[property];

        // Don't proxy Sets, Arrays, or Date objects - return them directly
        if (
          value instanceof Set ||
          value instanceof Date ||
          Array.isArray(value)
        ) {
          return value;
        }

        // Return proxied objects for nested properties
        if (value && typeof value === 'object') {
          return that.createStateProxy(value, tabId, [
            ...path,
            String(property),
          ]);
        }

        return value;
      },

      set(target, property, value) {
        const previousValue = target[property];
        target[property] = value;

        // Emit change event
        const fullPath = [...path, String(property)];
        that.emitStateChange(tabId, fullPath, value, previousValue);

        // Special handling for entity changes
        if (path[0] === 'entities' && path.length === 1) {
          const entityId = String(property);
          that.entityChangeSubject.next({
            tabId,
            entityId,
            property: 'all',
            value,
            previousValue,
          });
        } else if (path[0] === 'entities' && path.length === 2) {
          const entityId = path[1];
          that.entityChangeSubject.next({
            tabId,
            entityId,
            property: String(property),
            value,
            previousValue,
          });
        }

        return true;
      },
    });
  }

  /**
   * Emit a STATE change event and update BehaviorSubject
   */
  private emitStateChange(
    tabId: string,
    path: string[],
    value: any,
    previousValue?: any,
  ): void {
    // Emit to change subject
    this.stateChangeSubject.next({
      tabId,
      path,
      value,
      previousValue,
      timestamp: Date.now(),
    });

    // Update BehaviorSubject with full STATE
    const subject = this.tabStateSubjects.get(tabId);
    if (subject) {
      const state = this.tabStates.get(tabId);
      subject.next(state);
    }
  }

  /**
   * Manually notify about STATE changes (for WASM renderer compatibility)
   */
  notifyStateChange(tabId: string, path?: string[], value?: any): void {
    const state = this.tabStates.get(tabId);
    if (!state) {
      // console.warn('[StateManager] No state found for tab:', tabId);
      return;
    }

    // If no specific path, assume full STATE update
    if (!path) {
      const subject = this.tabStateSubjects.get(tabId);
      if (subject) {
        subject.next(state);
      }
      return;
    }

    // Debug: console.log('[StateManager] STATE change notification:', tabId, path.join('.'), value);

    // Update the actual state object with the new value
    let target = state;
    for (let i = 0; i < path.length - 1; i++) {
      if (!target[path[i]]) {
        target[path[i]] = {};
      }
      target = target[path[i]];
    }
    const previousValue = target[path[path.length - 1]];
    target[path[path.length - 1]] = value;

    // Emit specific change
    this.emitStateChange(tabId, path, value, previousValue);
  }

  /**
   * Register a renderer instance for a tab
   */
  registerTabRenderer(tabId: string, renderer: any): void {
    // console.log(`[StateManager] Registering renderer for tab: ${tabId}`);
    this.tabRenderers.set(tabId, renderer);
  }

  /**
   * Get the renderer instance for a tab
   */
  getTabRenderer(tabId: string): any {
    return this.tabRenderers.get(tabId);
  }

  /**
   * Register a canvas element for a tab
   */
  registerTabCanvas(tabId: string, canvas: HTMLCanvasElement): void {
    // console.log(`[StateManager] Registering canvas for tab: ${tabId}`);
    this.tabCanvases.set(tabId, canvas);
  }

  /**
   * Get the canvas element for a tab
   */
  getTabCanvas(tabId: string): HTMLCanvasElement | undefined {
    return this.tabCanvases.get(tabId);
  }

  /**
   * Switch which tab is visible (doesn't affect STATE, only visibility)
   */
  setActiveTab(tabId: string): void {
    // console.log(`[StateManager] Setting active tab: ${tabId}`);

    // Hide the previously active canvas
    if (this.activeTabId) {
      const prevCanvas = this.tabCanvases.get(this.activeTabId);
      if (prevCanvas) {
        prevCanvas.style.display = 'none';
      }
    }

    // Show the new active canvas
    const newCanvas = this.tabCanvases.get(tabId);
    if (newCanvas) {
      newCanvas.style.display = 'block';
    }

    this.activeTabId = tabId;

    // Update the active tab subject
    this.activeTabSubject.next(tabId);

    // For the first tab, sync with the renderer's STATE if it exists
    // Otherwise use our managed STATE
    if (typeof window !== 'undefined') {
      const isFirstTab = this.getAllTabIds()[0] === tabId;

      if (isFirstTab && (window as any).STATE) {
        // First tab - sync our STATE with renderer's STATE
        // We need to keep using the same object reference for notifications to work
        const managedState = this.tabStates.get(tabId);
        if (managedState && (window as any).STATE !== managedState) {
          // Copy properties from window.STATE to our managed state
          // This preserves our object reference while getting renderer data
          Object.assign(managedState, (window as any).STATE);
          
          // Make sure window.STATE points to our managed state
          (window as any).STATE = managedState;

          // Update the BehaviorSubject
          const subject = this.tabStateSubjects.get(tabId);
          if (subject) {
            subject.next(managedState);
          }
        }
      } else {
        // Other tabs use our managed STATE
        const tabState = this.tabStates.get(tabId);
        if (tabState) {
          (window as any).STATE = tabState;
        }
      }

      // Also update the renderer reference
      const renderer = this.tabRenderers.get(tabId);
      if (renderer) {
        (window as any).renderer = renderer;
      }

      // Set up change detection bridge for WASM renderer
      this.setupWasmBridge(tabId);
    }
  }

  /**
   * Set up a bridge to detect WASM renderer STATE changes
   */
  private setupWasmBridge(tabId: string): void {
    if (typeof window === 'undefined') return;

    // Store reference to this service
    (window as any).__stateManager = this;
    (window as any).__activeTabId = tabId;

    // Inject a notification function that WASM can call
    (window as any).notifyStateChange = (path?: string[], value?: any) => {
      if ((window as any).__stateManager && (window as any).__activeTabId) {
        (window as any).__stateManager.notifyStateChange(
          (window as any).__activeTabId,
          path,
          value,
        );
      }
    };
  }

  /**
   * Get the currently active tab ID
   */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * Check if a tab has a STATE instance
   */
  hasTabState(tabId: string): boolean {
    return this.tabStates.has(tabId);
  }

  /**
   * Clean up when a tab is closed
   */
  removeTab(tabId: string): void {
    // console.log(`[StateManager] Removing tab: ${tabId}`);

    // Clean up STATE
    this.tabStates.delete(tabId);

    // Clean up BehaviorSubject
    const subject = this.tabStateSubjects.get(tabId);
    if (subject) {
      subject.complete();
      this.tabStateSubjects.delete(tabId);
    }

    // Clean up renderer
    const renderer = this.tabRenderers.get(tabId);
    if (renderer && renderer.cleanup) {
      renderer.cleanup();
    }
    this.tabRenderers.delete(tabId);

    // Clean up canvas
    this.tabCanvases.delete(tabId);

    // If this was the active tab, clear the active ID
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
      this.activeTabSubject.next(null);
    }
  }

  /**
   * Get all tab IDs that have STATE instances
   */
  getAllTabIds(): string[] {
    return Array.from(this.tabStates.keys());
  }

  /**
   * Debug method to log all tab states
   */
  debugLogAllStates(): void {
    // console.log('[StateManager] All tab states:');
    // this.tabStates.forEach((state, tabId) => {
    //   console.log(`  Tab ${tabId}:`, {
    //     entities: Object.keys(state.entities).length,
    //     connections: state.connections.length,
    //     view: state.view,
    //   });
    // });
  }
}
