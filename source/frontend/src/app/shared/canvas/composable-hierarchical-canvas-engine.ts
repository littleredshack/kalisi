import { HierarchicalNode, Edge, CanvasData, Camera, Point, InteractionEvent, Bounds } from './types';
import { PresentationFrame } from '../render/presentation-frame';
import { CanvasViewStateService, CanvasMutationType } from './state/canvas-view-state.service';
import { CameraSystem } from './camera';
import { IRenderer } from './renderer';
import { NodeVisibilityState } from '../../core/services/view-node-state.service';
import { ViewNodeStateService } from '../../core/services/view-node-state.service';
import { DynamicLayoutService } from '../../core/services/dynamic-layout.service';
import { Subscription } from 'rxjs';
import { CanvasLayoutRuntime } from './layout-runtime';
import { CanvasEventBus, CanvasEvent, CanvasEventSource } from '../layouts/core/layout-events';
import { LayoutRunOptions } from '../layouts/core/layout-orchestrator';
import { CanvasEventHubService } from '../../core/services/canvas-event-hub.service';
import { CanvasInteractionHandler } from './canvas-interaction-handler';
import { ViewPresetManager, ResolvedViewPreset } from './presets/preset-manager';

const COLLAPSED_NODE_WIDTH = 220;
const COLLAPSED_NODE_HEIGHT = 64;

export class ComposableHierarchicalCanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cameraSystem: CameraSystem;
  private renderer: IRenderer;
  private presentationFrame: PresentationFrame | null = null;
  private lastRenderedFrameVersion = -1;
  private lastRenderedCamera: Camera | null = null;
  private lastRenderedLensId: string | undefined;
  private viewNodeStateService?: ViewNodeStateService;
  private dynamicLayoutService?: DynamicLayoutService;
  private data: CanvasData;
  private readonly layoutRuntime: CanvasLayoutRuntime;
  private readonly canvasEventBus: CanvasEventBus;
  private canvasEventSubscription?: Subscription;
  private suppressCanvasEvents = false;
  private readonly eventHub?: CanvasEventHubService;
  private currentEngineName: string;
  private currentLensId = 'full-graph';
  private lensBaseData: CanvasData;
  private pendingRendererInvalidation = false;
  private initialRenderPending = true;
  
  // Event handlers
  private onDataChanged?: (data: CanvasData) => void;
  private onSelectionChanged?: (node: HierarchicalNode | null) => void;
  
  // Interaction state - managed by interaction handler
  private interactionHandler: CanvasInteractionHandler;
  private canvasViewStateService?: CanvasViewStateService;
  private canvasStateSubscription?: Subscription;
  private suppressStateSync = false;
  private applyingExternalState = false;
  private readonly canvasId: string;
  private viewPresetManager = new ViewPresetManager();
  private currentPreset: ResolvedViewPreset | null = null;
  private hasAutoFit = false;

  // Layout engine isolation - each engine maintains its own layout snapshot
  private layoutSnapshots = new Map<string, CanvasData>();
  private originalData: CanvasData;

  constructor(
    canvas: HTMLCanvasElement,
    renderer: IRenderer,
    initialEngineId: string,
    initialData: CanvasData,
    canvasId: string,
    eventHub?: CanvasEventHubService
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.renderer = renderer;
    this.canvasId = canvasId;
    this.data = {
      ...initialData,
      originalEdges: initialData.originalEdges || initialData.edges.filter(e => !e.id.startsWith('inherited-'))
    };
    this.normaliseCanvasData(this.data);
    this.lensBaseData = this.cloneCanvasData(this.data);

    // Store original data for layout engine isolation
    this.originalData = this.cloneCanvasData(this.data);

    const initialEngineName = this.normaliseEngineName(initialEngineId, initialData);

    this.layoutRuntime = new CanvasLayoutRuntime(canvasId, this.data, {
      defaultEngine: initialEngineName,
      runLayoutOnInit: false,
      useWorker: true
    });
    this.layoutRuntime.setLens(this.currentLensId);
    this.canvasEventBus = this.layoutRuntime.getEventBus();
    this.eventHub = eventHub;
    if (this.eventHub) {
      this.eventHub.registerCanvas(this.canvasId, this.canvasEventBus);
    }
    this.cameraSystem = new CameraSystem(canvas.width, canvas.height);
    if (this.data.camera) {
      this.cameraSystem.setCamera(this.data.camera);
    } else if (initialData.camera) {
      this.cameraSystem.setCamera(initialData.camera);
    }

    // Initialize interaction handler for state management
    this.interactionHandler = new CanvasInteractionHandler();

    this.canvasEventSubscription = this.canvasEventBus.events$.subscribe(event => { void this.handleCanvasEvent(event); });
    this.currentEngineName = this.layoutRuntime.getActiveEngineName() ?? initialEngineName;

    this.initialRenderPending = true;
    void this.layoutRuntime.runLayout({ reason: 'initial', source: 'system' })
      .then(result => {
        // Store whether layout provided a camera
        const layoutProvidedCamera = !!result.camera;

        this.initialRenderPending = false;
        this.setData(result, 'system');
        this.lensBaseData = this.cloneCanvasData(this.data);
        this.refreshViewPreset(this.presentationFrame);

        // Only adjust camera if layout didn't provide one
        if (!layoutProvidedCamera) {
          console.log('[INIT] Layout did not provide camera, ensuring bounds');
          this.ensureCameraWithinBounds('initialize');
          if (!this.data.camera) {
            const midpoint = this.calculateContentBounds(this.data.nodes, 0, 0, this.viewNodeStateService?.getCollapseBehaviorValue?.() ?? 'full-size');
            if (midpoint) {
              this.cameraSystem.setCamera({ x: midpoint.x, y: midpoint.y, zoom: this.cameraSystem.getCamera().zoom });
            }
          }
        } else {
          console.log('[INIT] Layout provided camera, trusting it:', result.camera);
        }
      })
      .catch(error => {
        console.error('[CanvasEngine] Initial layout failed; using fallback data', error);
        const fallback = this.layoutRuntime.getCanvasData();
        this.initialRenderPending = false;
        this.setData(fallback, 'system');
        this.lensBaseData = this.cloneCanvasData(this.data);
        this.refreshViewPreset(this.presentationFrame);
        this.ensureCameraWithinBounds('initialize');
      });

    this.setupEventHandlers();
  }

  // Public API
  setData(data: CanvasData, source: CanvasEventSource = 'system', updateLensBase = true): void {
    this.data = { 
      ...data,
      originalEdges: data.originalEdges || data.edges.filter(e => !e.id.startsWith('inherited-'))
    };
    this.normaliseCanvasData(this.data);
    this.data.edges = this.computeEdgesWithInheritance(this.data.originalEdges);
    this.invalidateRendererCache();
    if (updateLensBase) {
      this.lensBaseData = this.cloneCanvasData(this.data);
    }
    
    if (data.camera) {
      this.cameraSystem.setCamera(data.camera);
    }
    this.pendingRendererInvalidation = true;
    this.render();
    this.ensureCameraWithinBounds('set-data');
    this.onDataChanged?.(this.data);
    const selectedNode = this.interactionHandler.getSelectedNode();
    if (selectedNode) {
      const worldPos = this.interactionHandler.getAbsolutePosition(selectedNode, this.data.nodes);
      this.interactionHandler.updateSelectedNodeWorldPos(worldPos);
    }
    this.publishState('replace');
    this.syncRuntimeFromCurrentData(source);
    this.refreshViewPreset(this.presentationFrame);
  }

  getData(): CanvasData {
    return { 
      ...this.data, 
      camera: this.cameraSystem.getCamera()
    };
  }

  setRenderer(renderer: IRenderer): void {
    this.renderer = renderer;
    this.render();
  }

  getRenderer(): IRenderer {
    return this.renderer;
  }

  getCurrentViewPreset(): ResolvedViewPreset | null {
    return this.currentPreset;
  }

  getAvailableLayoutEngines(): string[] {
    return this.layoutRuntime.getAvailableEngines();
  }

  getActiveLayoutEngine(): string | null {
    return this.layoutRuntime.getActiveEngineName();
  }

  getActiveGraphLens(): string {
    return this.currentLensId;
  }

  setGraphLens(lensId: string): void {
    if (!lensId || lensId === this.currentLensId) {
      return;
    }
    this.currentLensId = lensId;
    console.debug('[CanvasEngine] Graph lens set', {
      canvasId: this.canvasId,
      lensId
    });
    this.layoutRuntime.setLens(lensId);
    const filtered = this.applyLensToData(lensId);
    this.setData(filtered, 'system', false);
    this.lastRenderedFrameVersion = -1;
  }

  async switchLayoutEngine(engineName: string, source: CanvasEventSource = 'user'): Promise<CanvasData | null> {
    if (!engineName || engineName === this.currentEngineName) {
      return null;
    }

    const targetEngine = this.normaliseEngineName(engineName, this.data);

    // Preserve current camera state
    const currentCamera = this.cameraSystem.getCamera();

    this.suppressCanvasEvents = true;
    try {
      this.layoutRuntime.setActiveEngine(targetEngine, source);
    } finally {
      this.suppressCanvasEvents = false;
    }

    this.currentEngineName = this.layoutRuntime.getActiveEngineName() ?? targetEngine;
    const result = await this.runLayout({ reason: 'engine-switch', engineName: targetEngine, source });

    // Restore camera after layout switch
    if (result && currentCamera) {
      result.camera = currentCamera;
      this.cameraSystem.setCamera(currentCamera);
      this.render(); // Re-render with restored camera
    }

    return result;
  }

  async runLayout(options: LayoutRunOptions = {}): Promise<CanvasData> {
    const source = options.source ?? 'system';
    this.syncRuntimeFromCurrentData(source);
    const targetEngine = options.engineName
      ? this.normaliseEngineName(options.engineName, this.data)
      : undefined;
    this.suppressCanvasEvents = true;
    try {
      const result = await this.layoutRuntime.runLayout({ ...options, engineName: targetEngine, source });
      this.presentationFrame = this.layoutRuntime.getPresentationFrame() ?? null;
      this.setData(this.presentationFrame?.canvasData ?? result, source);
      this.currentEngineName = this.layoutRuntime.getActiveEngineName() ?? this.currentEngineName;
      return this.getData();
    } finally {
      this.suppressCanvasEvents = false;
    }
  }

  setOnDataChanged(callback: (data: CanvasData) => void): void {
    this.onDataChanged = callback;
  }

  setOnSelectionChanged(callback: (node: HierarchicalNode | null) => void): void {
    this.onSelectionChanged = callback;
  }

  /**
   * Set services for dynamic layout behavior
   */
  setServices(viewNodeStateService: ViewNodeStateService, dynamicLayoutService: DynamicLayoutService): void {
    this.viewNodeStateService = viewNodeStateService;
    this.dynamicLayoutService = dynamicLayoutService;
  }

  setCanvasViewStateService(canvasViewStateService: CanvasViewStateService): void {
    this.canvasViewStateService = canvasViewStateService;
    this.canvasStateSubscription?.unsubscribe();
    this.canvasStateSubscription = this.canvasViewStateService
      .getCanvasData$(this.canvasId)
      .subscribe(state => {
        if (!state) return;
        if (this.suppressStateSync) {
          // Skip the immediate round-trip after publishing local mutations.
          this.suppressStateSync = false;
          return;
        }
        this.applyExternalState(state);
      });
  }

  /**
   * Analyze hierarchy to determine available depth levels
   */
  getAvailableDepthLevels(): number[] {
    const maxDepth = this.calculateMaxDepth(this.data.nodes, 0);
    const levels: number[] = [];

    for (let i = 0; i <= maxDepth; i++) {
      levels.push(i);
    }

    return levels;
  }

  /**
   * Calculate maximum depth of the hierarchy
   */
  private calculateMaxDepth(nodes: HierarchicalNode[], currentDepth: number): number {
    let maxDepth = currentDepth;

    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        const childDepth = this.calculateMaxDepth(node.children, currentDepth + 1);
        maxDepth = Math.max(maxDepth, childDepth);
      }
    }

    return maxDepth;
  }

  /**
   * Collapse all nodes to a specific depth level
   */
  collapseToLevel(targetLevel: number): void {
    const roots = this.data.nodes;
    this.applyCollapseToLevel(roots, 0, targetLevel);

    if (targetLevel > 0) {
      roots.forEach(root => {
        root.collapsed = false;
        root.visible = true;
        if (root.children && root.children.length > 0) {
          root.children.forEach(child => {
            child.visible = true;
            child.collapsed = true;
            this.hideAllDescendants(child);
          });
        }
      });
    }

    // After collapse, ensure parent containers are properly sized for remaining visible children
    this.data.nodes.forEach(rootNode => {
      const isTreeLayout = rootNode.metadata?.['displayMode'] === 'tree';
      if (isTreeLayout) {
        return;
      }

      if (rootNode.children && rootNode.children.length > 0) {
        // Calculate height for grid layout of collapsed children
        const visibleChildren = rootNode.children.filter(child => child.visible);
        const collapsedChildHeight = 120;
        const collapsedChildWidth = 200;
        const spacing = 30;

        // Calculate grid dimensions
        const containerWidth = rootNode.width - 40; // Available width minus padding
        const nodesPerRow = Math.floor(containerWidth / (collapsedChildWidth + spacing));
        const actualNodesPerRow = Math.max(1, nodesPerRow);
        const rows = Math.ceil(visibleChildren.length / actualNodesPerRow);

        const requiredHeight = Math.max(400, rows * (collapsedChildHeight + spacing) + 100);

        rootNode.height = requiredHeight;

        // Reposition children to fit within the resized container
        if (this.dynamicLayoutService) {
          const containerBounds = { width: rootNode.width, height: rootNode.height };
          const viewportBounds = {
            width: this.canvas.width / this.cameraSystem.getCamera().zoom,
            height: this.canvas.height / this.cameraSystem.getCamera().zoom
          };

          this.dynamicLayoutService.reflowContainer(rootNode.children, containerBounds, viewportBounds, rootNode);
        }
      }
    });

    this.applyCollapsedNodeDimensions(this.data.nodes, true);
    const root = this.data.nodes[0];
    if (root && root.collapsed) {
      this.cameraSystem.setCamera({ ...this.cameraSystem.getCamera(), x: root.x, y: root.y, zoom: Math.min(this.cameraSystem.getCamera().zoom, 0.2) });
    }

    // Recompute edges with inheritance
    this.data.edges = this.computeEdgesWithInheritance(this.data.originalEdges);

    this.render();
    this.notifyDataChanged();
    this.publishState('collapse');
    this.syncRuntimeFromCurrentData('user');
  }

  private applyCollapsedNodeDimensions(nodes: HierarchicalNode[], clampSize = false): void {
    nodes.forEach(node => {
      if (!node.children || node.children.length === 0) {
        return;
      }

      if (node.collapsed) {
        if (clampSize) {
          const isTreeNode = node.metadata?.['displayMode'] === 'tree';
          if (isTreeNode) {
            const defaultWidth = typeof node.metadata?.['defaultWidth'] === 'number'
              ? Number(node.metadata['defaultWidth'])
              : node.width || COLLAPSED_NODE_WIDTH;
            const defaultHeight = typeof node.metadata?.['defaultHeight'] === 'number'
              ? Number(node.metadata['defaultHeight'])
              : node.height || COLLAPSED_NODE_HEIGHT;
            node.width = defaultWidth;
            node.height = defaultHeight;
          } else {
            node.width = COLLAPSED_NODE_WIDTH;
            node.height = COLLAPSED_NODE_HEIGHT;
          }
        }
      }

      node.children.forEach((child, index) => {
        const shouldShowChild = index === 0 || !node.collapsed;
        child.visible = shouldShowChild;
        child.collapsed = shouldShowChild ? false : true;
        this.applyCollapsedNodeDimensions(child.children ?? [], clampSize);
      });
    });
  }

  /**
   * Count visible (non-collapsed) children recursively
   */
  private countVisibleChildren(node: HierarchicalNode): number {
    if (!node.children) return 0;

    let count = 0;
    for (const child of node.children) {
      if (child.visible !== false) {
        count++;
        if (!child.collapsed) {
          count += this.countVisibleChildren(child);
        }
      }
    }
    return count;
  }

  /**
   * Calculate bounding box of all children
   */
  private calculateChildBounds(children: HierarchicalNode[]): { maxX: number; maxY: number } {
    if (children.length === 0) return { maxX: 0, maxY: 0 };

    let maxX = 0;
    let maxY = 0;

    for (const child of children) {
      maxX = Math.max(maxX, child.x + child.width);
      maxY = Math.max(maxY, child.y + child.height);
    }

    return { maxX, maxY };
  }

  /**
   * Recursively apply visibility rules based on target level
   */
  private applyCollapseToLevel(nodes: HierarchicalNode[], currentLevel: number, targetLevel: number): void {
    for (const node of nodes) {
      if (currentLevel < targetLevel) {
        // Before target level - make visible and expand to continue deeper
        node.visible = true;
        node.collapsed = false;

        // Continue to children if they exist
        if (node.children && node.children.length > 0) {
          this.applyCollapseToLevel(node.children, currentLevel + 1, targetLevel);
        }
      } else if (currentLevel === targetLevel) {
        // AT target level - make visible but collapsed (show as collapsed container with badge)
        node.visible = true;
        node.collapsed = true;

        // Hide all descendants (they shouldn't be visible until manually expanded)
        this.hideAllDescendants(node);
      } else {
        // Beyond target level - hide completely
        node.visible = false;
        node.collapsed = true;

        // Hide all descendants recursively
        this.hideAllDescendants(node);
      }
    }
  }

  /**
   * Hide all descendants recursively (set visible = false)
   */
  private hideAllDescendants(node: HierarchicalNode): void {
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        child.visible = false;
        child.collapsed = true;
        this.hideAllDescendants(child);
      });
    }
  }

  /**
   * Restore node state recursively from saved ViewState
   */
  private restoreNodeStateRecursively(node: HierarchicalNode, savedState: any): void {
    if (node.children && node.children.length > 0 && savedState.childrenStates) {
      node.children.forEach(child => {
        const childGuid = child.GUID;
        if (!childGuid) {
          console.warn('Missing GUID for child while restoring node state', { child });
          return;
        }
        const childSavedState = savedState.childrenStates.get(childGuid);

        if (childSavedState) {
          child.visible = childSavedState.visible;
          child.collapsed = childSavedState.collapsed;

          // Recursively restore grandchildren state
          if (childSavedState.childrenStates) {
            this.restoreNodeStateRecursively(child, childSavedState);
          }
        }
      });
    }
  }

  /**
   * Show immediate children only (fallback behavior)
   */
  private showImmediateChildren(node: HierarchicalNode): void {
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        child.visible = true;
        child.collapsed = true; // Immediate children start collapsed
        this.hideAllDescendants(child);
      });
    }
  }

  updateCanvasSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.cameraSystem.updateCanvasSize(width, height);
    this.pendingRendererInvalidation = true;

    // Don't render during initialization
    if (!this.initialRenderPending) {
      this.render();
    }
  }

  // PERSISTENCE METHODS
  saveToStorage(viewId: string): boolean {
    try {
      const currentData = this.getData();
      localStorage.setItem(`view_${viewId}`, JSON.stringify(currentData));
      return true;
    } catch (error) {
      return false;
    }
  }

  loadFromStorage(viewId: string): boolean {
    const savedData = localStorage.getItem(`view_${viewId}`);
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        this.setData(parsedData);
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  // FOLD/UNFOLD WITH EDGE INHERITANCE
  toggleNodeCollapsed(nodeGuid: string, source: CanvasEventSource = 'user'): void {
    this.setNodeCollapsed(nodeGuid, undefined, source);
  }

  setNodeCollapsed(
    nodeGuid: string,
    collapsed?: boolean,
    source: CanvasEventSource = 'user'
  ): void {
    if (!nodeGuid) {
      console.warn('setNodeCollapsed called without a GUID');
      return;
    }
    const node = this.findNodeByGUID(nodeGuid);
    if (!node) return;

    const targetCollapsed = typeof collapsed === 'boolean' ? collapsed : !node.collapsed;
    if (node.collapsed === targetCollapsed) {
      return;
    }

    if (!targetCollapsed) {
      // EXPANDING
      console.debug('[Expand] Node:', nodeGuid, 'Attempting to restore state');
      node.collapsed = false;
      const lockedPosition = (node as any)._lockedPosition;
      if (lockedPosition) {
        node.x = lockedPosition.x;
        node.y = lockedPosition.y;
        (node as any)._userLocked = true;
      }

      if (this.viewNodeStateService) {
        const savedState = this.viewNodeStateService.restoreNodeVisibilityState(nodeGuid);
        if (savedState) {
          console.debug('[Expand] Restoring saved state with', savedState.childrenStates?.size || 0, 'children');
          this.restoreNodeStateRecursively(node, savedState);
        } else {
          console.debug('[Expand] No saved state - showing immediate children in collapsed state');
          // No saved state - show immediate children but keep them collapsed
          // This preserves any existing grandchild states
          this.showImmediateChildren(node);
        }
      } else {
        this.showImmediateChildren(node);
      }

      const childBounds = this.calculateChildBounds(node.children.filter(c => c.visible));
      const requiredWidth = childBounds.maxX + 40;
      const requiredHeight = childBounds.maxY + 40;

      if (requiredWidth > node.width || requiredHeight > node.height) {
        node.width = Math.max(node.width, requiredWidth);
        node.height = Math.max(node.height, requiredHeight);
      }
    } else {
      // COLLAPSING
      console.debug('[Collapse] Node:', nodeGuid, 'Saving state with', node.children?.length || 0, 'children');
      (node as any)._lockedPosition = { x: node.x, y: node.y };
      if (this.viewNodeStateService) {
        this.viewNodeStateService.saveNodeVisibilityState(nodeGuid, node);
        console.debug('[Collapse] State saved for node:', nodeGuid);
      }

      node.collapsed = true;
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          child.visible = false;
          child.collapsed = true;
          this.hideAllDescendants(child);
        });
      }
    }

    this.data.edges = this.computeEdgesWithInheritance(this.data.originalEdges);

    this.render();
    this.onDataChanged?.(this.data);
    const selectedNode = this.interactionHandler.getSelectedNode();
    if (selectedNode) {
      const worldPos = this.interactionHandler.getAbsolutePosition(selectedNode, this.data.nodes);
      this.interactionHandler.updateSelectedNodeWorldPos(worldPos);
    }
    this.publishState('collapse', nodeGuid, {
      viewportBounds: {
        width: this.canvas.width / this.cameraSystem.getCamera().zoom,
        height: this.canvas.height / this.cameraSystem.getCamera().zoom
      }
    });
    this.emitNodeCollapseEvent(nodeGuid, targetCollapsed, source);
    this.syncRuntimeFromCurrentData(source);
  }

  // COPIED DESCENDANT VISIBILITY MANAGEMENT FROM STORE
  private hideDescendants(node: HierarchicalNode): void {
    // Hide all descendants
    const hideRecursive = (children: HierarchicalNode[]) => {
      children.forEach(child => {
        child.visible = false;
        if (child.children.length > 0) {
          hideRecursive(child.children);
        }
      });
    };
    hideRecursive(node.children);
  }

  private restoreDescendants(node: HierarchicalNode): void {
    // Restore direct children
    node.children.forEach(child => {
      child.visible = true;
      
      // Recursively restore grandchildren if child is not collapsed
      if (!child.collapsed) {
        this.restoreDescendants(child);
      }
    });
  }

  // Rendering
  render(): void {
    console.log('[RENDER] Called', {
      canvasId: this.canvasId,
      initialRenderPending: this.initialRenderPending,
      stack: new Error().stack?.split('\n')[2]?.trim()
    });

    this.presentationFrame = this.layoutRuntime.getPresentationFrame() ?? this.presentationFrame;
    const frame = this.presentationFrame;
    const camera = this.cameraSystem.getCamera();
    const shouldForceRender = this.pendingRendererInvalidation;
    const cameraChanged =
      !this.lastRenderedCamera ||
      this.lastRenderedCamera.x !== camera.x ||
      this.lastRenderedCamera.y !== camera.y ||
      this.lastRenderedCamera.zoom !== camera.zoom;
    const lensChanged = frame ? frame.lensId !== this.lastRenderedLensId : false;

    if (frame && frame.version === this.lastRenderedFrameVersion && (!frame.delta || (frame.delta.nodes.length === 0 && frame.delta.edges.length === 0))) {
      if (!cameraChanged && !lensChanged && !shouldForceRender) {
        console.log('[RENDER] Skipped - no changes');
        return;
      }
    }

    console.log('[RENDER] EXECUTING', { camera, shouldForceRender, cameraChanged });
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.renderer.render(this.ctx, this.data.nodes, this.data.edges, camera, frame ?? undefined);
    this.pendingRendererInvalidation = false;

    const selectedNode = this.interactionHandler.getSelectedNode();
    if (selectedNode) {
      const worldPos = this.interactionHandler.getSelectedNodeWorldPos() || this.interactionHandler.getAbsolutePosition(selectedNode, this.data.nodes);
      this.interactionHandler.renderSelectionAtPosition(this.ctx, selectedNode, worldPos, camera, this.viewNodeStateService);
    }

    this.lastRenderedFrameVersion = frame?.version ?? this.lastRenderedFrameVersion;
    this.lastRenderedCamera = { ...camera };
    this.lastRenderedLensId = frame?.lensId ?? this.lastRenderedLensId;
  }

  centerOnNode(node: HierarchicalNode): void {
    const camera = this.cameraSystem.getCamera();
    const zoom = camera.zoom || 1;
    const worldPos = this.interactionHandler.getAbsolutePosition(node, this.data.nodes);

    const collapseBehavior = this.viewNodeStateService?.getCollapseBehaviorValue?.() ?? 'full-size';
    const shouldShrink =
      collapseBehavior === 'shrink' && node.collapsed && node.children && node.children.length > 0;
    const width = shouldShrink ? COLLAPSED_NODE_WIDTH : node.width;
    const height = shouldShrink ? COLLAPSED_NODE_HEIGHT : node.height;

    const canvasWorldWidth = this.canvas.width / zoom;
    const canvasWorldHeight = this.canvas.height / zoom;

    camera.x = worldPos.x + width / 2 - canvasWorldWidth / 2;
    camera.y = worldPos.y + height / 2 - canvasWorldHeight / 2;

    this.cameraSystem.setCamera(camera);
    if (this.interactionHandler.getSelectedNode() === node) {
      this.interactionHandler.updateSelectedNodeWorldPos(worldPos);
    }

    // Don't render during initialization
    if (!this.initialRenderPending) {
      this.render();
      this.publishCameraState('camera', 'user');
    }
  }

  // Camera operations
  getCamera(): Camera {
    return this.cameraSystem.getCamera();
  }

  setCamera(camera: Camera, source: CanvasEventSource = 'system'): void {
    this.cameraSystem.setCamera(camera);
    this.render();
    this.publishCameraState('camera', source);
  }

  pan(deltaX: number, deltaY: number): void {
    // Use CameraSystem for consistent coordinate handling
    // Simulate mouse movement for updatePan
    const currentPos = { x: deltaX, y: deltaY };
    this.cameraSystem.startPan(0, 0);
    this.cameraSystem.updatePan(deltaX, deltaY);
    this.cameraSystem.stopPan();
    this.render();
    this.publishCameraState('camera', 'user');
  }

  zoom(screenX: number, screenY: number, zoomDelta: number): void {
    this.cameraSystem.zoom(screenX, screenY, zoomDelta);
    this.render();
    this.publishCameraState('camera', 'user');
  }

  zoomToLevel(level: number): void {
    const camera = this.cameraSystem.getCamera();
    camera.zoom = Math.max(0.1, Math.min(5.0, level));
    this.cameraSystem.setCamera(camera);
    this.render();
    this.publishCameraState('camera', 'user');
  }

  zoomAtCenter(delta: number): void {
    const camera = this.cameraSystem.getCamera();
    const zoomFactor = delta > 0 ? 1.1 : 0.9;
    const oldZoom = camera.zoom;

    // Update zoom level
    camera.zoom = Math.max(0.1, Math.min(5.0, camera.zoom * zoomFactor));

    // Keep camera position unchanged for center zoom
    // This works because renderers use (world - camera) * zoom
    // Camera position stays the same, only zoom changes

    this.cameraSystem.setCamera(camera);
    this.render();
    this.publishCameraState('camera', 'user');
  }

  // Selection operations (now handled by event processing pipeline)

  clearSelection(): void {
    this.clearAllSelection();
    this.interactionHandler.clearSelection();
    this.onSelectionChanged?.(null);
    this.render();
  }

  getSelectedNode(): HierarchicalNode | null {
    return this.interactionHandler.getSelectedNode();
  }

  getInteractionHandler(): CanvasInteractionHandler {
    return this.interactionHandler;
  }

  getCameraSystem(): CameraSystem {
    return this.cameraSystem;
  }

  // Event processing pipeline (Phase 7.3)
  processInteractionEvent(event: any): any {
    const context = {
      allNodes: this.data.nodes,
      renderer: this.renderer,
      camera: this.cameraSystem.getCamera(),
      clearAllSelection: () => this.clearAllSelection(),
      onSelectionChanged: this.onSelectionChanged,
      toggleNodeCollapsed: (nodeGuid: string) => this.toggleNodeCollapsed(nodeGuid)
    };

    const result = this.interactionHandler.processEvent(event, context);

    // Handle side effects that need canvas engine involvement
    if (event.type === 'drag-update' && result && (result as any).dragHandled) {
      const selectedNode = this.interactionHandler.getSelectedNode();
      if (selectedNode) {
        this.updateWorldMetadata(selectedNode);
        this.invalidateEdgeGeometry(selectedNode.GUID ?? selectedNode.id);
        this.invalidateRendererCache(selectedNode.GUID ?? selectedNode.id);
        this.data.edges = this.computeEdgesWithInheritance(this.data.originalEdges);
        this.render();
        this.notifyDataChanged();
      }
    }

    if (event.type === 'drag-stop') {
      const node = this.interactionHandler.getSelectedNode();
      if (node) {
        this.updateWorldMetadata(node);
        this.invalidateEdgeGeometry(node.GUID ?? node.id);
        this.invalidateRendererCache(node.GUID ?? node.id);
        this.render();
        this.notifyDataChanged();
        this.syncRuntimeFromCurrentData('user');
      }
    }

    if (event.type === 'select') {
      this.render();
    }

    if (event.type === 'double-click') {
      // Double-click handling is now centralized in interaction handler
      // No additional side effects needed here
      console.debug('[DoubleClick] Processed through interaction handler');
    }

    return result;
  }

  // Private methods
  private setupEventHandlers(): void {
    // Event handlers will be managed externally by InteractionManager
    // This keeps the engine pure and testable
  }

  private clearAllSelection(): void {
    const clearSelection = (nodes: HierarchicalNode[]): void => {
      nodes.forEach(node => {
        node.selected = false;
        node.dragging = false;
        clearSelection(node.children);
      });
    };
    clearSelection(this.data.nodes);
  }

  private notifyDataChanged(): void {
    this.presentationFrame = this.layoutRuntime.getPresentationFrame();
    if (this.presentationFrame) {
      this.onDataChanged?.({
        ...this.presentationFrame.canvasData,
        camera: this.cameraSystem.getCamera()
      });
    } else {
      this.onDataChanged?.({
        ...this.data,
        camera: this.cameraSystem.getCamera()
      });
    }
    this.lastRenderedFrameVersion = -1;
  }

  private refreshViewPreset(frame?: PresentationFrame | null): void {
    const resolved = this.viewPresetManager.resolveFromCanvasData(this.data);
    if (resolved) {
      this.currentPreset = {
        preset: resolved.preset,
        metadata: { ...resolved.metadata }
      };
    } else {
      this.currentPreset = null;
    }
  }

  private ensureCameraWithinBounds(_reason: 'set-data' | 'external-state' | 'initialize' = 'set-data'): void {
    if (!this.data?.nodes?.length) {
      return;
    }
    if (this.canvas.width === 0 || this.canvas.height === 0) {
      return;
    }

    const collapseBehavior = this.viewNodeStateService?.getCollapseBehaviorValue?.() ?? 'full-size';
    const contentBounds = this.calculateContentBounds(this.data.nodes, 0, 0, collapseBehavior);
    if (!contentBounds) {
      return;
    }

    const currentCamera = this.cameraSystem.getCamera();
    const safeZoom = Number.isFinite(currentCamera.zoom) && currentCamera.zoom > 0 ? currentCamera.zoom : 1;
    const viewportWidth = this.canvas.width / safeZoom;
    const viewportHeight = this.canvas.height / safeZoom;

    const viewportBounds: Bounds = {
      x: Number.isFinite(currentCamera.x) ? currentCamera.x : contentBounds.x,
      y: Number.isFinite(currentCamera.y) ? currentCamera.y : contentBounds.y,
      width: viewportWidth,
      height: viewportHeight
    };

    const paddingX = viewportWidth * 0.25;
    const paddingY = viewportHeight * 0.25;
    const expandedContent: Bounds = {
      x: contentBounds.x - paddingX,
      y: contentBounds.y - paddingY,
      width: contentBounds.width + paddingX * 2,
      height: contentBounds.height + paddingY * 2
    };

    const cameraInvalid = !Number.isFinite(currentCamera.x) ||
      !Number.isFinite(currentCamera.y) ||
      !Number.isFinite(currentCamera.zoom) ||
      currentCamera.zoom <= 0;

    if (cameraInvalid || !this.rectanglesIntersect(expandedContent, viewportBounds)) {
      this.centerCameraOnBounds(contentBounds, safeZoom);
    }
  }

  private rectanglesIntersect(a: Bounds, b: Bounds): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    );
  }

  private centerCameraOnBounds(bounds: Bounds, zoom: number): void {
    const viewportWidth = this.canvas.width / zoom;
    const viewportHeight = this.canvas.height / zoom;
    const nextCamera: Camera = {
      x: bounds.x + bounds.width / 2 - viewportWidth / 2,
      y: bounds.y + bounds.height / 2 - viewportHeight / 2,
      zoom
    };

    this.cameraSystem.setCamera(nextCamera);
    const selectedNode = this.interactionHandler.getSelectedNode();
    if (selectedNode) {
      const worldPos = this.interactionHandler.getAbsolutePosition(selectedNode, this.data.nodes);
      this.interactionHandler.updateSelectedNodeWorldPos(worldPos);
    }
    this.render();
    this.publishCameraState('camera', 'system');
  }

  private calculateContentBounds(
    nodes: HierarchicalNode[],
    offsetX: number,
    offsetY: number,
    collapseBehavior: string
  ): Bounds | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const visit = (nodeList: HierarchicalNode[], parentX: number, parentY: number): void => {
      nodeList.forEach(node => {
        if (node.visible === false) {
          return;
        }

        const worldX = parentX + (Number.isFinite(node.x) ? node.x : 0);
        const worldY = parentY + (Number.isFinite(node.y) ? node.y : 0);
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        const shouldShrink = collapseBehavior === 'shrink' && node.collapsed && hasChildren;
        const width = shouldShrink ? COLLAPSED_NODE_WIDTH : (Number.isFinite(node.width) ? node.width : 0);
        const height = shouldShrink ? COLLAPSED_NODE_HEIGHT : (Number.isFinite(node.height) ? node.height : 0);

        minX = Math.min(minX, worldX);
        minY = Math.min(minY, worldY);
        maxX = Math.max(maxX, worldX + width);
        maxY = Math.max(maxY, worldY + height);

        if (!node.collapsed && hasChildren) {
          visit(node.children, worldX, worldY);
        }
      });
    };

    visit(nodes, offsetX, offsetY);

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY)
    };
  }
  private applyExternalState(state: CanvasData): void {
    // Skip during initial setup - the init flow will handle rendering
    if (this.initialRenderPending) {
      console.log('[EXTERNAL STATE] Skipped during initialization');
      return;
    }

    this.applyingExternalState = true;
    this.data = {
      ...state,
      originalEdges: state.originalEdges || state.edges.filter(edge => !edge.id.startsWith('inherited-'))
    };
    this.normaliseCanvasData(this.data);
    if (state.camera) {
      this.cameraSystem.setCamera(state.camera);
    }
    this.data.camera = this.cameraSystem.getCamera();
    const selectedNode = this.interactionHandler.getSelectedNode();
    if (selectedNode) {
      this.interactionHandler.updateSelectedNodeWorldPos(this.interactionHandler.getAbsolutePosition(selectedNode, this.data.nodes));
    }
    this.render();
    this.ensureCameraWithinBounds('external-state');
    this.applyingExternalState = false;
  }

  private syncRuntimeFromCurrentData(source: CanvasEventSource = 'system'): void {
    const snapshot = this.getData();
    this.layoutRuntime.setCanvasData(snapshot, false, source);
  }

  private emitCanvasEvent(event: CanvasEvent): void {
    if (this.suppressCanvasEvents) {
      return;
    }

    this.suppressCanvasEvents = true;
    try {
      this.canvasEventBus.emit({
        ...event,
        timestamp: event.timestamp ?? Date.now()
      });
    } finally {
      this.suppressCanvasEvents = false;
    }
  }

  private async withEventSuppressed<T>(callback: () => Promise<T> | T): Promise<T> {
    const previous = this.suppressCanvasEvents;
    this.suppressCanvasEvents = true;
    try {
      return await Promise.resolve(callback());
    } finally {
      this.suppressCanvasEvents = previous;
    }
  }

  private async handleCanvasEvent(event: CanvasEvent): Promise<void> {
    if (this.suppressCanvasEvents) {
      return;
    }

    switch (event.type) {
      case 'CollapseNode':
        this.withEventSuppressed(() => this.setNodeCollapsed(event.nodeId, true, event.source));
        break;
      case 'ExpandNode':
        this.withEventSuppressed(() => this.setNodeCollapsed(event.nodeId, false, event.source));
        break;
      case 'NodeMoved':
        this.withEventSuppressed(() => this.applyExternalNodeMove(event.nodeId, event.x, event.y, event.source));
        break;
      case 'ResizeNode':
        this.withEventSuppressed(() =>
          this.applyExternalNodeResize(event.nodeId, event.width, event.height, event.source)
        );
        break;
      case 'CameraChanged':
        if (event.canvasId === this.canvasId) {
          this.withEventSuppressed(() => this.setCamera(event.camera, event.source));
        }
        break;
      case 'LayoutRequested':
        if (event.canvasId === this.canvasId) {
          await this.withEventSuppressed(() =>
            this.runLayout({
              engineName: event.engineName,
              reason: 'user-command',
              engineOptions: event.payload,
              source: event.source
            })
          );
        }
        break;
      case 'EngineSwitched':
        if (event.canvasId === this.canvasId) {
          // Preserve current camera state before switching
          const currentCamera = this.cameraSystem.getCamera();

          // Save current layout state to the outgoing engine's snapshot
          const previousEngine = this.currentEngineName;
          if (previousEngine && event.engineName !== previousEngine) {
            this.layoutSnapshots.set(previousEngine, this.cloneCanvasData(this.data));
          }

          // Load clean data for the incoming engine
          const targetEngineData = this.layoutSnapshots.get(event.engineName) || this.cloneCanvasData(this.originalData);

          // Set clean data before running layout
          this.setData(targetEngineData, event.source, false);

          this.currentEngineName = event.engineName;
          const result = await this.withEventSuppressed(() =>
            this.runLayout({
              reason: 'engine-switch',
              engineName: event.engineName,
              source: event.source
            })
          );

          // Restore camera after layout switch
          if (currentCamera) {
            this.cameraSystem.setCamera(currentCamera);
            this.render(); // Re-render with restored camera
          }
        }
        break;
      case 'LayoutApplied':
        if (event.canvasId === this.canvasId) {
          this.currentEngineName = event.engineName;
        }
        break;
      case 'HistoryReplay':
        if (event.canvasId === this.canvasId) {
          // Future: implement batched history replay processing.
        }
        break;
      case 'GraphLensChanged':
        if (event.canvasId === this.canvasId) {
          this.setGraphLens(event.lensId);
        }
        break;
      case 'CollapseToLevel':
        if (event.canvasId === this.canvasId) {
          this.withEventSuppressed(() => this.collapseToLevel(event.level));
        }
        break;
    }
  }

  private applyExternalNodeMove(
    nodeGuid: string,
    absoluteX: number,
    absoluteY: number,
    source: CanvasEventSource
  ): void {
    const node = this.findNodeByGUID(nodeGuid);
    if (!node) {
      return;
    }

    const parentPos = this.interactionHandler.getParentAbsolutePosition(node, this.data.nodes);
    node.x = absoluteX - parentPos.x;
    node.y = absoluteY - parentPos.y;
    if (this.interactionHandler.getSelectedNode() === node) {
      this.interactionHandler.updateSelectedNodeWorldPos(this.interactionHandler.getAbsolutePosition(node, this.data.nodes));
    }
    this.updateWorldMetadata(node);
    this.invalidateEdgeGeometry(nodeGuid);
    this.invalidateRendererCache(nodeGuid);
    this.data.edges = this.computeEdgesWithInheritance(this.data.originalEdges);

    this.render();
    this.notifyDataChanged();
    this.syncRuntimeFromCurrentData(source);
  }

  private applyExternalNodeResize(
    nodeGuid: string,
    width: number,
    height: number,
    source: CanvasEventSource
  ): void {
    const node = this.findNodeByGUID(nodeGuid);
    if (!node) {
      return;
    }

    node.width = Math.max(0, width);
    node.height = Math.max(0, height);
    if (this.interactionHandler.getSelectedNode() === node) {
      this.interactionHandler.updateSelectedNodeWorldPos(this.interactionHandler.getAbsolutePosition(node, this.data.nodes));
    }
    this.updateWorldMetadata(node);
    this.invalidateEdgeGeometry(nodeGuid);
    this.invalidateRendererCache(nodeGuid);
    this.data.edges = this.computeEdgesWithInheritance(this.data.originalEdges);

    this.render();
    this.notifyDataChanged();
    this.syncRuntimeFromCurrentData(source);
  }

  private emitNodeCollapseEvent(nodeGuid: string, collapsed: boolean, source: CanvasEventSource): void {
    if (!nodeGuid) {
      return;
    }
    this.emitCanvasEvent({
      type: collapsed ? 'CollapseNode' : 'ExpandNode',
      nodeId: nodeGuid,
      source,
      timestamp: Date.now()
    });
  }

  private emitNodeMovementEvent(node: HierarchicalNode, source: CanvasEventSource): void {
    if (!node?.GUID) {
      return;
    }
    const absolute = this.interactionHandler.getAbsolutePosition(node, this.data.nodes);
    this.emitCanvasEvent({
      type: 'NodeMoved',
      nodeId: node.GUID,
      x: absolute.x,
      y: absolute.y,
      source,
      timestamp: Date.now()
    });
  }

  private emitNodeResizeEvent(node: HierarchicalNode, source: CanvasEventSource): void {
    if (!node?.GUID) {
      return;
    }
    this.emitCanvasEvent({
      type: 'ResizeNode',
      nodeId: node.GUID,
      width: node.width,
      height: node.height,
      source,
      timestamp: Date.now()
    });
  }

  private emitCameraChangedEvent(source: CanvasEventSource): void {
    this.emitCanvasEvent({
      type: 'CameraChanged',
      canvasId: this.canvasId,
      camera: this.cameraSystem.getCamera(),
      source,
      timestamp: Date.now()
    });
  }

  private publishState(type: CanvasMutationType, nodeGuid?: string, payload?: Record<string, unknown>): void {
    if (!this.canvasViewStateService || this.applyingExternalState) {
      return;
    }
    this.data.camera = this.cameraSystem.getCamera();
    this.suppressStateSync = true;
    this.canvasViewStateService.publishFromEngine(this.canvasId, this.data, {
      type,
      nodeGuid,
      payload
    });
  }

  private publishCameraState(
    source: CanvasMutationType | 'camera' = 'camera',
    eventSource: CanvasEventSource = 'system'
  ): void {
    if (!this.canvasViewStateService) {
      return;
    }
    const camera = this.cameraSystem.getCamera();
    this.data.camera = camera;
    this.suppressStateSync = true;
    this.canvasViewStateService.updateCamera(this.canvasId, camera, 'engine');
    this.emitCameraChangedEvent(eventSource);
  }

  // Drag operations (now handled by event processing pipeline)

  // Node manipulation operations
  moveNode(node: HierarchicalNode, newX: number, newY: number): void {
    node.x = newX;
    node.y = newY;
    this.updateWorldMetadata(node);
    this.invalidateEdgeGeometry(node.GUID ?? node.id);
    this.invalidateRendererCache(node.GUID ?? node.id);
    this.data.edges = this.computeEdgesWithInheritance(this.data.originalEdges);
    this.render();
    this.notifyDataChanged();
    this.publishState('position', node.GUID);
    this.emitNodeMovementEvent(node, 'system');
    this.syncRuntimeFromCurrentData('system');
  }

  resizeNode(node: HierarchicalNode, newWidth: number, newHeight: number): void {
    node.width = newWidth;
    node.height = newHeight;
    this.updateWorldMetadata(node);
    this.invalidateEdgeGeometry(node.GUID ?? node.id);
    this.invalidateRendererCache(node.GUID ?? node.id);
    this.data.edges = this.computeEdgesWithInheritance(this.data.originalEdges);
    this.render();
    this.notifyDataChanged();
    this.publishState('resize', node.GUID);
    this.emitNodeResizeEvent(node, 'system');
    this.syncRuntimeFromCurrentData('system');
  }

  // Utility methods

  private findParentNode(targetNode: HierarchicalNode): HierarchicalNode | null {
    const matchesTarget = (candidate: HierarchicalNode): boolean => {
      if (candidate === targetNode) {
        return true;
      }
      if (targetNode.GUID && candidate.GUID === targetNode.GUID) {
        return true;
      }
      return false;
    };

    const findParent = (nodes: HierarchicalNode[]): HierarchicalNode | null => {
      for (const node of nodes) {
        const childList = node.children ?? [];
        if (childList.some(matchesTarget)) {
          return node;
        }
        const found = findParent(childList);
        if (found) {
          return found;
        }
      }
      return null;
    };

    return findParent(this.data.nodes);
  }





  // COPIED EXACT RESIZE LOGIC FROM WORKING MONOLITHIC SYSTEM
  handleResize(node: HierarchicalNode, handle: string, mouseX: number, mouseY: number): void {
    const camera = this.cameraSystem.getCamera();
    
    // Convert mouse position to world coordinates
    const worldMouseX = mouseX / camera.zoom + camera.x;
    const worldMouseY = mouseY / camera.zoom + camera.y;
    
    // Get current world position
    const worldPos = this.interactionHandler.getAbsolutePosition(node, this.data.nodes);
    
    const minSize = 50; // Minimum node size
    
    switch (handle) {
      case 'se': // Bottom-right corner
        node.width = Math.max(minSize, worldMouseX - worldPos.x);
        node.height = Math.max(minSize, worldMouseY - worldPos.y);
        break;
      case 'ne': // Top-right corner
        const newHeight = Math.max(minSize, worldPos.y + node.height - worldMouseY);
        node.y += node.height - newHeight;
        node.height = newHeight;
        node.width = Math.max(minSize, worldMouseX - worldPos.x);
        break;
      case 'nw': // Top-left corner
        const newWidth = Math.max(minSize, worldPos.x + node.width - worldMouseX);
        const newHeight2 = Math.max(minSize, worldPos.y + node.height - worldMouseY);
        node.x += node.width - newWidth;
        node.y += node.height - newHeight2;
        node.width = newWidth;
        node.height = newHeight2;
        break;
      case 'sw': // Bottom-left corner
        const newWidth2 = Math.max(minSize, worldPos.x + node.width - worldMouseX);
        node.x += node.width - newWidth2;
        node.width = newWidth2;
        node.height = Math.max(minSize, worldMouseY - worldPos.y);
        break;
      case 'e': // Right edge
        node.width = Math.max(minSize, worldMouseX - worldPos.x);
        break;
      case 'w': // Left edge
        const newWidth3 = Math.max(minSize, worldPos.x + node.width - worldMouseX);
        node.x += node.width - newWidth3;
        node.width = newWidth3;
        break;
      case 'n': // Top edge
        const newHeight3 = Math.max(minSize, worldPos.y + node.height - worldMouseY);
        node.y += node.height - newHeight3;
        node.height = newHeight3;
        break;
      case 's': // Bottom edge
        node.height = Math.max(minSize, worldMouseY - worldPos.y);
        break;
    }
    
    // COPIED EXACT RESIZE CONSTRAINTS FROM MONOLITHIC SYSTEM
    this.applyResizeConstraints(node);
    
    // Apply movement constraints (in case resize changed position)
    const constrainedPosition = this.interactionHandler.applyMovementConstraints(node, node.x, node.y, this.data.nodes);
    node.x = constrainedPosition.x;
    node.y = constrainedPosition.y;

    // Reflow children if this container was resized and has children
    if (node.children && node.children.length > 0 && this.dynamicLayoutService) {
      const containerBounds = { width: node.width, height: node.height };
      this.dynamicLayoutService.reflowContainer(node.children, containerBounds, undefined, node);
    }

    if (this.interactionHandler.getSelectedNode() === node) {
      this.interactionHandler.updateSelectedNodeWorldPos(this.interactionHandler.getAbsolutePosition(node, this.data.nodes));
    }

    this.render();
    this.notifyDataChanged();
    if (node.GUID) {
      this.publishState('resize', node.GUID);
      this.emitNodeResizeEvent(node, 'user');
    }
    this.syncRuntimeFromCurrentData('user');
  }


  private applyResizeConstraints(node: HierarchicalNode): void {
    const parent = this.findParentNode(node);
    
    if (parent) {
      // Child resize constraint - cannot exceed parent bounds
      const padding = 10;
      const maxWidth = parent.width - node.x - padding;
      const maxHeight = parent.height - node.y - padding;
      
      if (node.width > maxWidth) {
        node.width = maxWidth;
      }
      if (node.height > maxHeight) {
        node.height = maxHeight;
      }
    } else {
      // Parent resize constraint - cannot be smaller than children
      this.applyParentResizeConstraint(node);
    }
    
    // If this is a parent with children, check if any children are now outside bounds
    if (node.children.length > 0) {
      this.adjustChildrenAfterParentResize(node);
    }
  }

  private applyParentResizeConstraint(parentNode: HierarchicalNode): void {
    if (parentNode.children.length === 0) return;
    
    const padding = 20;
    let minWidth = 100; // Absolute minimum
    let minHeight = 100;
    
    // Calculate minimum size needed to contain all children
    parentNode.children.forEach(child => {
      const childRight = child.x + child.width + padding;
      const childBottom = child.y + child.height + padding;
      
      minWidth = Math.max(minWidth, childRight);
      minHeight = Math.max(minHeight, childBottom);
    });
    
    // Enforce minimum sizes
    if (parentNode.width < minWidth) {
      parentNode.width = minWidth;
    }
    if (parentNode.height < minHeight) {
      parentNode.height = minHeight;
    }
  }

  private adjustChildrenAfterParentResize(parentNode: HierarchicalNode): void {
    const padding = 10;
    
    // Recursively adjust all children to stay within parent bounds
    const adjustChild = (child: HierarchicalNode) => {
      // Check if child is now outside parent bounds
      const maxX = parentNode.width - child.width - padding;
      const maxY = parentNode.height - child.height - padding;
      const minX = padding;
      const minY = padding;
      
      // Adjust position if outside bounds
      child.x = Math.max(minX, Math.min(maxX, child.x));
      child.y = Math.max(minY, Math.min(maxY, child.y));
      
      // Adjust size if still too big
      if (child.x + child.width > parentNode.width - padding) {
        child.width = parentNode.width - child.x - padding;
      }
      if (child.y + child.height > parentNode.height - padding) {
        child.height = parentNode.height - child.y - padding;
      }
      
      // Recursively adjust grandchildren
      if (child.children.length > 0) {
        child.children.forEach(grandchild => adjustChild(grandchild));
      }
    };
    
    parentNode.children.forEach(child => adjustChild(child));
  }

  // COPIED EDGE INHERITANCE METHODS FROM GRAPHSTATESTORE - ADAPTED FOR ENGINE
  private computeEdgesWithInheritance(baseEdges: Edge[]): Edge[] {
    const inheritedEdges: Edge[] = [];

    // Build complete visibility map considering all collapsed states
    const visibilityMap = this.buildNodeVisibilityMap();

    // For each original edge, determine its final representation
    baseEdges.forEach(edge => {
      const sourceVisibility = visibilityMap[edge.from];
      const targetVisibility = visibilityMap[edge.to];

      // Check if source/target exist in visibility map
      if (!sourceVisibility || !targetVisibility) {
        return;
      }

      if (sourceVisibility.isVisible && targetVisibility.isVisible) {
        // Both endpoints visible - show original edge
        inheritedEdges.push(edge);
      } else if (!sourceVisibility.isVisible || !targetVisibility.isVisible) {
        // One or both endpoints hidden - create inherited edge to visible ancestor
        const finalSourceId = sourceVisibility.isVisible ? edge.from : sourceVisibility.visibleAncestor!;
        const finalTargetId = targetVisibility.isVisible ? edge.to : targetVisibility.visibleAncestor!;

        // Only create inherited edge if both final endpoints exist and are different
        if (finalSourceId && finalTargetId && finalSourceId !== finalTargetId) {
          inheritedEdges.push({
            ...edge,
            id: `inherited-${edge.id}`,
            from: finalSourceId,
            to: finalTargetId,
            fromGUID: finalSourceId,  // Set GUID fields for composable renderers
            toGUID: finalTargetId,    // Set GUID fields for composable renderers
            style: {
              ...edge.style,
              stroke: '#1e3a8a', // Darker blue for inherited
              strokeWidth: Math.min(6, edge.style.strokeWidth + 1),
              strokeDashArray: [4, 4] // Dashed
            }
          });
        }
      }
    });

    return inheritedEdges;
  }
  
  private buildNodeVisibilityMap(): Record<string, {isVisible: boolean, visibleAncestor?: string}> {
    const visibilityMap: Record<string, {isVisible: boolean, visibleAncestor?: string}> = {};
    const allNodes = this.getAllNodesFlat();


    // First pass: determine which nodes are actually visible
    allNodes.forEach(node => {
      if (!node.GUID) {
        return;
      }
      const isVisible = node.visible !== false && this.hasVisiblePath(node.GUID);
      visibilityMap[node.GUID] = { isVisible };
    });

    // Second pass: find visible ancestors for hidden nodes
    allNodes.forEach(node => {
      if (!node.GUID) return;
      if (!visibilityMap[node.GUID].isVisible) {
        visibilityMap[node.GUID].visibleAncestor = this.findVisibleAncestor(node.GUID, visibilityMap);
      }
    });

    return visibilityMap;
  }
  
  private hasVisiblePath(nodeGUID: string): boolean {
    const node = this.findNodeByGUID(nodeGUID);
    if (!node) {
      return false;
    }
    if (node.visible === false) {
      return false;
    }

    // Check if any ancestor is collapsed (which would hide this node)
    const parent = this.findParentOfNodeByGUID(nodeGUID);
    if (parent) {
      if (parent.collapsed) {
        return false; // Parent is collapsed, so this node is hidden
      }
      if (parent.visible === false) {
        return false;
      }
      // Recursively check parent's visibility
      return parent.GUID ? this.hasVisiblePath(parent.GUID) : false;
    }

    return true;
  }
  
  private findVisibleAncestor(nodeGUID: string, visibilityMap: Record<string, {isVisible: boolean, visibleAncestor?: string}>): string | undefined {
    const parent = this.findParentOfNodeByGUID(nodeGUID);
    if (!parent || !parent.GUID) return undefined;

    if (visibilityMap[parent.GUID]?.isVisible) {
      return parent.GUID;
    }

    // Recursively find visible ancestor
    return this.findVisibleAncestor(parent.GUID, visibilityMap);
  }

  private findParentOfNodeByGUID(nodeGUID: string): HierarchicalNode | null {
    const findParentRecursive = (nodes: HierarchicalNode[]): HierarchicalNode | null => {
      for (const node of nodes) {
        if (node.children.some(child => child.GUID === nodeGUID)) {
          return node;
        }
        const foundInChildren = findParentRecursive(node.children);
        if (foundInChildren) return foundInChildren;
      }
      return null;
    };
    return findParentRecursive(this.data.nodes);
  }

  private findNodeByGUID(nodeGUID: string): HierarchicalNode | null {
    if (!nodeGUID) {
      return null;
    }
    const findRecursive = (nodes: HierarchicalNode[]): HierarchicalNode | null => {
      for (const node of nodes) {
        if (node.GUID === nodeGUID) return node;
        const foundInChildren = findRecursive(node.children);
        if (foundInChildren) return foundInChildren;
      }
      return null;
    };
    return findRecursive(this.data.nodes);
  }

  private normaliseCanvasData(data: CanvasData): void {
    if (!data) {
      return;
    }

    const nodesByGuid = new Map<string, HierarchicalNode>();
    const nodesById = new Map<string, HierarchicalNode>();

    const ensureNode = (node: HierarchicalNode) => {
      const nodeAny = node as any;
      if (!node.GUID && nodeAny.guid) {
        node.GUID = nodeAny.guid;
      }
      if (nodeAny.guid !== undefined) {
        delete nodeAny.guid;
      }
      if (!node.GUID) {
        node.GUID = this.generateGuid();
      }
      nodesByGuid.set(node.GUID, node);
      nodesById.set(node.id, node);
      if (!node.children) {
        node.children = [];
      }
      node.children.forEach(ensureNode);
    };

    data.nodes = data.nodes || [];
    data.nodes.forEach(ensureNode);

    const ensureEdge = (edge: Edge) => {
      const edgeAny = edge as any;
      if (edgeAny.guid && !edgeAny.GUID) {
        edgeAny.GUID = edgeAny.guid;
      }
      if (edgeAny.guid !== undefined) {
        delete edgeAny.guid;
      }

      const sourceNode = this.resolveEdgeNode(edge.fromGUID ?? edge.from, nodesByGuid, nodesById);
      if (sourceNode?.GUID) {
        edge.fromGUID = sourceNode.GUID;
        edge.from = sourceNode.GUID;
      }

      const targetNode = this.resolveEdgeNode(edge.toGUID ?? edge.to, nodesByGuid, nodesById);
      if (targetNode?.GUID) {
        edge.toGUID = targetNode.GUID;
        edge.to = targetNode.GUID;
      }
    };

    data.edges = data.edges || [];
    data.edges.forEach(ensureEdge);

    if (!data.originalEdges || data.originalEdges.length === 0) {
      data.originalEdges = [...data.edges];
    } else {
      data.originalEdges.forEach(ensureEdge);
    }
  }

  private applyLensToData(lensId: string): CanvasData {
    const source = this.lensBaseData ?? this.data;
    const clone = this.cloneCanvasData(source);

    switch (lensId) {
      case 'selected-root-neighborhood':
        this.applyRootNeighborhoodLens(clone);
        break;
      case 'active-containment':
        this.applyActiveContainmentLens(clone);
        break;
      case 'full-graph':
      default:
        break;
    }

    this.trimEdgesToVisible(clone);
    return clone;
  }

  private applyRootNeighborhoodLens(data: CanvasData): void {
    if (!data.nodes.length) {
      return;
    }

    const currentSelectedNode = this.interactionHandler.getSelectedNode();
    const targetGuid = currentSelectedNode?.GUID ?? currentSelectedNode?.id;
    const selectedNode = targetGuid ? this.findNodeInCanvasData(data.nodes, targetGuid) : null;
    const primary = selectedNode ?? data.nodes[0];

    data.nodes.forEach(root => this.hideNodeRecursively(root));

    if (!primary) {
      return;
    }

    this.showNode(primary, false);
    primary.visible = true;
    primary.collapsed = false;

    (primary.children ?? []).forEach(child => {
      child.visible = true;
      child.collapsed = true;
      this.hideNodeRecursively(child);
    });

    const parent = targetGuid ? this.findParentInCanvasData(data.nodes, targetGuid) : null;
    if (parent) {
      this.showNode(parent, false);
      parent.collapsed = false;
      parent.visible = true;
      (parent.children ?? []).forEach(child => {
        child.visible = true;
        child.collapsed = child !== primary;
        if (child !== primary) {
          this.hideNodeRecursively(child);
        }
      });
    }
  }

  private applyActiveContainmentLens(data: CanvasData): void {
    const currentSelectedNode = this.interactionHandler.getSelectedNode();
    const selectionGuid = currentSelectedNode?.GUID ?? currentSelectedNode?.id;
    const target = selectionGuid
      ? this.findContainerAncestor(data.nodes, selectionGuid) ?? this.findFirstContainerNode(data.nodes)
      : this.findFirstContainerNode(data.nodes);
    if (!target) {
      return;
    }
    const targetId = target.GUID ?? target.id;
    data.nodes.forEach(root => {
      const contains = this.applyContainmentLensRecursive(root, targetId);
      if (!contains) {
        this.hideNodeRecursively(root);
      }
    });
  }

  private applyContainmentLensRecursive(node: HierarchicalNode, targetId: string): boolean {
    const nodeId = node.GUID ?? node.id;
    if (nodeId === targetId) {
      this.showNode(node, true);
      return true;
    }

    let descendantMatch = false;
    node.children.forEach(child => {
      if (this.applyContainmentLensRecursive(child, targetId)) {
        descendantMatch = true;
      } else {
        this.hideNodeRecursively(child);
      }
    });

    if (descendantMatch) {
      this.showNode(node, false);
    }
    return descendantMatch;
  }

  private showNode(node: HierarchicalNode, includeDescendants: boolean): void {
    node.visible = true;
    if (includeDescendants) {
      node.children.forEach(child => this.showNode(child, true));
    }
  }

  private hideNodeRecursively(node: HierarchicalNode): void {
    node.visible = false;
    node.children.forEach(child => this.hideNodeRecursively(child));
  }

  private findFirstContainerNode(nodes: HierarchicalNode[]): HierarchicalNode | null {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        return node;
      }
      const candidate = this.findFirstContainerNode(node.children ?? []);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  private findContainerAncestor(nodes: HierarchicalNode[], targetGuid: string): HierarchicalNode | null {
    const visit = (node: HierarchicalNode, ancestors: HierarchicalNode[]): HierarchicalNode | null => {
      const nodeId = node.GUID ?? node.id;
      const nextAncestors = [...ancestors, node];

      if (nodeId === targetGuid) {
        return [...nextAncestors].reverse().find(candidate => candidate.children && candidate.children.length > 0) ?? null;
      }

      for (const child of node.children ?? []) {
        const found = visit(child, nextAncestors);
        if (found) {
          return found;
        }
      }
      return null;
    };

    for (const root of nodes) {
      const candidate = visit(root, []);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }

  private findNodeInCanvasData(nodes: HierarchicalNode[], guid: string): HierarchicalNode | null {
    for (const node of nodes) {
      const nodeId = node.GUID ?? node.id;
      if (nodeId === guid) {
        return node;
      }
      const found = this.findNodeInCanvasData(node.children ?? [], guid);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private findParentInCanvasData(nodes: HierarchicalNode[], targetGuid: string): HierarchicalNode | null {
    for (const node of nodes) {
      for (const child of node.children ?? []) {
        const childId = child.GUID ?? child.id;
        if (childId === targetGuid) {
          return node;
        }
        const found = this.findParentInCanvasData(child.children ?? [], targetGuid);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  private updateWorldMetadata(node: HierarchicalNode, parentWorld?: Point): void {
    const parent = parentWorld ?? this.interactionHandler.getParentAbsolutePosition(node, this.data.nodes);
    const worldX = parent.x + node.x;
    const worldY = parent.y + node.y;
    if (!node.metadata) {
      node.metadata = {};
    }
    const metadata = node.metadata as Record<string, any>;
    metadata['worldPosition'] = { x: worldX, y: worldY };
    metadata['__relative'] = true;
    node.children?.forEach(child => this.updateWorldMetadata(child, { x: worldX, y: worldY }));
  }

  private invalidateEdgeGeometry(nodeGuid: string | undefined): void {
    if (!nodeGuid) {
      return;
    }
    const wipe = (edges?: Edge[]) => {
      edges?.forEach(edge => {
        if (
          edge.fromGUID === nodeGuid ||
          edge.toGUID === nodeGuid ||
          edge.from === nodeGuid ||
          edge.to === nodeGuid
        ) {
          delete (edge as any).waypoints;
        }
      });
    };
    wipe(this.data?.edges);
    wipe(this.data?.originalEdges);
  }

  private invalidateRendererCache(nodeGuid?: string): void {
    this.pendingRendererInvalidation = true;
    const rendererWithCache = this.renderer as IRenderer & { invalidateCache?: (ids?: ReadonlyArray<string>) => void };
    rendererWithCache.invalidateCache?.call(rendererWithCache, nodeGuid ? [nodeGuid] : undefined);
  }

  private trimEdgesToVisible(data: CanvasData): void {
    if (!Array.isArray(data.edges)) {
      return;
    }
    const visibleIds = new Set<string>();
    this.collectVisibleNodeIds(data.nodes, visibleIds);
    const filterEdge = (edge: Edge): boolean => {
      const fromId = edge.fromGUID ?? edge.from;
      const toId = edge.toGUID ?? edge.to;
      return visibleIds.has(fromId) && visibleIds.has(toId);
    };
    data.edges = data.edges.filter(filterEdge);
    if (data.originalEdges) {
      data.originalEdges = data.originalEdges.filter(filterEdge);
    }
  }

  private collectVisibleNodeIds(nodes: HierarchicalNode[], visible: Set<string>): void {
    nodes.forEach(node => {
      if (node.visible !== false) {
        const nodeId = node.GUID ?? node.id;
        visible.add(nodeId);
        this.collectVisibleNodeIds(node.children ?? [], visible);
      }
    });
  }

  private cloneCanvasData(data: CanvasData): CanvasData {
    const structured = (globalThis as unknown as { structuredClone?: <T>(input: T) => T }).structuredClone;
    if (typeof structured === 'function') {
      return structured(data);
    }
    return JSON.parse(JSON.stringify(data));
  }

  private inferEngineFromData(data: CanvasData): string {
    return data.nodes.some(node => node.metadata?.['displayMode'] === 'tree') ? 'tree' : 'containment-grid';
  }

  private normaliseEngineName(legacyName: string | undefined, data: CanvasData): string {
    if (!legacyName) {
      return this.inferEngineFromData(data);
    }

    const normalised = legacyName.trim().toLowerCase();

    switch (normalised) {
      case 'tree':
      case 'code-model-tree':
      case 'tree-table':
        return 'tree';
      case 'orthogonal':
      case 'containment-orthogonal':
        return 'orthogonal';
      case 'flat-graph':
      case 'force-directed':
      case 'force':
        return 'force-directed';
      case 'containment-grid':
      case 'hierarchical':
      case 'grid':
      case 'codebase-hierarchical':
      case 'containment':
        return 'containment-grid';
      default:
        if (normalised === 'tree' || normalised === 'orthogonal' || normalised === 'force-directed' || normalised === 'containment-grid') {
          return normalised;
        }
        return this.inferEngineFromData(data);
    }
  }

  private resolveEdgeNode(
    identifier: string | undefined,
    nodesByGuid: Map<string, HierarchicalNode>,
    nodesById: Map<string, HierarchicalNode>
  ): HierarchicalNode | undefined {
    if (!identifier) return undefined;
    return nodesByGuid.get(identifier) ?? nodesById.get(identifier);
  }

  private generateGuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private getAllNodesFlat(): HierarchicalNode[] {
    const allNodes: HierarchicalNode[] = [];
    const collectRecursive = (nodes: HierarchicalNode[]) => {
      nodes.forEach(node => {
        allNodes.push(node);
        if (node.children.length > 0) {
          collectRecursive(node.children);
        }
      });
    };
    collectRecursive(this.data.nodes);
    return allNodes;
  }

  destroy(): void {
    this.canvasStateSubscription?.unsubscribe();
    this.canvasEventSubscription?.unsubscribe();
    if (this.eventHub) {
      this.eventHub.unregisterCanvas(this.canvasId);
    }
  }

}
