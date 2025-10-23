import { CanvasData, Camera, HierarchicalNode, Edge, NodeSelectionSnapshot, NodeStyleOverrides, NodeShape } from './types';
import { CanvasLayoutRuntime, RuntimeViewConfig } from './layout-runtime';
import { IRenderer } from './renderer';
import { CameraSystem } from './camera';
import { CanvasInteractionHandler } from './canvas-interaction-handler';
import { GraphDelta } from '../../core/services/neo4j-realtime.service';
import { RawDataInput } from '../layouts/core/layout-contract';
// OverlayService removed
import { Subscription } from 'rxjs';
import { GraphDataSet } from '../graph/graph-data-set';
import { ViewState } from './state/view-state.model';

/**
 * Clean controller for runtime-based layouts.
 *
 * Architecture:
 * - LayoutRuntime calculates ALL positions and dimensions
 * - Controller manages camera and rendering loop
 * - Renderer just draws what it receives
 *
 * NO dimension transformations, NO preset overwriting, NO legacy baggage.
 */
export class RuntimeCanvasController {
  private readonly canvasId: string;
  private readonly layoutRuntime: CanvasLayoutRuntime;
  private renderer: IRenderer; // Not readonly - can switch renderers dynamically
  private readonly cameraSystem: CameraSystem;
  private readonly canvas: HTMLCanvasElement;
  private readonly interactionHandler: CanvasInteractionHandler;
  private animationFrameId: number | null = null;
  private onDataChangedCallback?: (data: CanvasData) => void;
  private onSelectionChanged?: (node: HierarchicalNode | null) => void;
  // Overlay system removed

  constructor(
    canvas: HTMLCanvasElement,
    renderer: IRenderer,
    initialData: CanvasData,
    canvasId: string,
    engineId?: string,
    initialViewConfig?: Partial<RuntimeViewConfig>
  ) {
    this.canvasId = canvasId;
    this.canvas = canvas;
    this.renderer = renderer;
    this.cameraSystem = new CameraSystem(canvas.width, canvas.height);

    // Initialize interaction handler for mouse interactions
    this.interactionHandler = new CanvasInteractionHandler();

    // Check if we have a saved layout
    const hasSavedLayout = initialData.nodes && initialData.nodes.length > 0 && !!initialData.camera;

    // Initialize LayoutRuntime with the specified engine
    this.layoutRuntime = new CanvasLayoutRuntime(canvasId, initialData, {
      defaultEngine: engineId ?? 'containment-runtime',
      runLayoutOnInit: !hasSavedLayout, // Only run layout if we don't have saved positions
      useWorker: false, // Keep worker disabled so console.logs work
      initialViewConfig
    });
    if (initialViewConfig) {
      this.layoutRuntime.setViewConfig(initialViewConfig);
    }

    // Overlay service removed

    // Set initial camera from data
    if (initialData.camera) {
      this.cameraSystem.setCamera(initialData.camera);
    }

    // Start render loop
    this.startRenderLoop();
  }

  /**
   * Get the current canvas data from layout runtime
   */
  getData(): CanvasData {
    return this.layoutRuntime.getCanvasData();
  }

  /**
   * Set new data and optionally run layout
   */
  setData(data: CanvasData, runLayout = false): void {
    // Direct mutation - no cloning
    const currentData = this.layoutRuntime.getCanvasData();

    if (!currentData.originalEdges) {
      currentData.originalEdges = data.originalEdges || data.edges.filter(e => !e.id.startsWith('inherited-'));
    }

    currentData.nodes = data.nodes;

    // CRITICAL: If loaded data has edges (including generated CONTAINS edges), use them
    // Don't recompute from scratch - that loses metadata-generated edges
    if (data.edges && data.edges.length > 0) {
      currentData.edges = this.computeEdgesWithInheritance(data.edges);
    } else {
      currentData.edges = this.computeEdgesWithInheritance(currentData.originalEdges);
    }

    currentData.metadata = data.metadata;

    if (data.camera) {
      currentData.camera = data.camera;
      this.cameraSystem.setCamera(data.camera);
    }

    if (runLayout) {
      this.layoutRuntime.runLayout({ reason: 'data-update', source: 'system' });
    }

    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(currentData);
    }
  }

  async setRawData(input: RawDataInput, runLayout = true): Promise<CanvasData> {
    this.layoutRuntime.setRawData(input, false, 'user');

    if (!runLayout) {
      return this.layoutRuntime.getCanvasData();
    }

    const result = await this.layoutRuntime.runLayout({
      reason: 'data-update',
      source: 'user'
    });
    if (result.camera) {
      this.cameraSystem.setCamera(result.camera);
    }

    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(result);
    }

    return result;
  }

  async loadGraphDataSet(
    dataset: GraphDataSet,
    viewState: ViewState,
    options: { reason?: 'initial' | 'data-update' | 'engine-switch' | 'reflow' | 'user-command' } = {}
  ): Promise<CanvasData> {
    const reason = options.reason ?? 'initial';

    // Set view config before loading dataset
    this.layoutRuntime.setViewConfig(viewState.layout.global);

    // Store dataset in runtime
    this.layoutRuntime.setGraphDataSet(dataset, false, 'system');

    // Run layout - hierarchy preserved via metadata.flattenedChildren, no visual state preservation needed
    const result = await this.layoutRuntime.runLayout({
      reason,
      source: 'system'
    });

    this.applyInitialCamera(result, viewState, reason);

    return result;
  }

  /**
   * Run layout with current data
   */
  async runLayout(): Promise<CanvasData> {
    const result = await this.layoutRuntime.runLayout({
      reason: 'user-command',
      source: 'user'
    });

    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(result);
    }

    return result;
  }

  /**
   * Apply a graph delta from real-time updates
   * Merges incremental changes into the current graph while preserving visibility and selection state
   */
  applyDelta(delta: GraphDelta, options: { recordHistory?: boolean } = {}): void {
    console.log('[Delta] Received delta:', {
      nodesUpdated: delta.nodesUpdated?.length || 0,
      nodesCreated: delta.nodesCreated?.length || 0,
      nodesDeleted: delta.nodesDeleted?.length || 0
    });

    const currentData = this.layoutRuntime.getCanvasData();
    const allNodes = this.getAllNodesFlat(currentData.nodes);

    console.log('[Delta] getAllNodesFlat returned', allNodes.length, 'nodes');

    // Track if we need to run layout (if new nodes lack positions)
    let needsLayout = false;

    // Apply node updates
    if (delta.nodesUpdated && delta.nodesUpdated.length > 0) {
      delta.nodesUpdated.forEach(update => {
        const node = allNodes.find(n => (n as any).GUID === update.guid);
        if (node) {
          console.log('[Delta] Updating node', update.guid, 'properties:', update.properties);
          // Merge properties - update both the property and the display field
          Object.keys(update.properties).forEach(key => {
            if (!['x', 'y', 'width', 'height', 'children', 'selected', 'visible', 'collapsed'].includes(key)) {
              (node as any)[key] = update.properties[key];
              // If updating name, also update text for display
              if (key === 'name') {
                node.text = update.properties[key] as string;
                console.log('[Delta] Updated node.text to:', node.text);
              }
            }
          });
        } else {
          console.warn('[RuntimeCanvasController] Could not find node with GUID:', update.guid);
        }
      });
    }

    // Apply node deletions
    if (delta.nodesDeleted && delta.nodesDeleted.length > 0) {
      delta.nodesDeleted.forEach(guid => {
        this.removeNodeRecursive(currentData.nodes, guid);
      });
    }

    // Apply node creations
    if (delta.nodesCreated && delta.nodesCreated.length > 0) {
      delta.nodesCreated.forEach((newNodeData: any) => {
      const newNode = this.convertToHierarchicalNode(newNodeData);

      // Check if node has position
      if (newNode.x === undefined || newNode.y === undefined) {
        needsLayout = true;
      }

      // Find parent if specified
      if (newNodeData.parent_guid || newNodeData.parentGUID) {
        const parentGuid = newNodeData.parent_guid || newNodeData.parentGUID;
        const parent = allNodes.find(n => n.GUID === parentGuid || n.id === parentGuid);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(newNode);
        } else {
          // No parent found, add to root
          currentData.nodes.push(newNode);
        }
      } else {
        // Add to root
        currentData.nodes.push(newNode);
      }
      });
    }

    // Apply edge deletions
    const originalEdges = currentData.originalEdges || currentData.edges;
    if (delta.relationshipsDeleted && delta.relationshipsDeleted.length > 0) {
      const deletedIds = delta.relationshipsDeleted;
      currentData.originalEdges = originalEdges.filter(edge =>
        !deletedIds.includes(edge.id)
      );
    } else {
      currentData.originalEdges = originalEdges;
    }

    // Apply edge creations
    if (delta.relationshipsCreated && delta.relationshipsCreated.length > 0) {
      delta.relationshipsCreated.forEach((newEdgeData: any) => {
        const newEdge = this.convertToEdge(newEdgeData);
        currentData.originalEdges.push(newEdge);
      });
    }

    // Recompute edges with inheritance
    currentData.edges = this.computeEdgesWithInheritance(currentData.originalEdges);

    // Update layout runtime with system source to suppress history
    // Force cache invalidation by passing true to trigger renderer rebuild
    this.layoutRuntime.setCanvasData(currentData, true, 'system');

    if (options.recordHistory && this.onDataChangedCallback) {
      this.onDataChangedCallback(currentData);
    }
  }

  /**
   * Convert backend node data to HierarchicalNode
   */
  private convertToHierarchicalNode(data: any): HierarchicalNode {
    return {
      id: data.guid,
      GUID: data.guid,
      type: data.labels?.[0] || 'Unknown',
      x: data.position?.x || 0,
      y: data.position?.y || 0,
      width: data.display?.width || 150,
      height: data.display?.height || 100,
      text: data.properties?.name || data.properties?.label || data.guid,
      style: {
        fill: data.display?.color || '#ffffff',
        stroke: data.display?.border_color || '#000000',
        icon: data.display?.icon
      },
      children: [],
      visible: true,
      collapsed: false,
      metadata: data.properties
    };
  }

  /**
   * Convert backend edge data to Edge
   */
  private convertToEdge(data: any): Edge {
    return {
      id: data.guid,
      from: data.source_guid,
      to: data.target_guid,
      fromGUID: data.source_guid,
      toGUID: data.target_guid,
      label: data.type || data.display?.label || '',
      style: {
        stroke: data.display?.color || '#666666',
        strokeWidth: data.display?.width || 2,
        strokeDashArray: data.display?.dash || null
      }
    };
  }

  /**
   * Remove a node from the hierarchy by GUID
   */
  private removeNodeRecursive(nodes: HierarchicalNode[], guid: string): boolean {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].GUID === guid || nodes[i].id === guid) {
        nodes.splice(i, 1);
        return true;
      }
      if (nodes[i].children && this.removeNodeRecursive(nodes[i].children, guid)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get current camera
  */
  getCamera(): Camera {
    return this.cameraSystem.getCamera();
  }

  /**
   * Set camera
   */
  setCamera(camera: Camera): void {
    this.cameraSystem.setCamera(camera);
    this.persistCameraToData();
  }

  /**
   * Update canvas size
   */
  updateCanvasSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    // CameraSystem doesn't have setViewportSize - it's immutable after construction
  }

  /**
   * Set callback for data changes
   */
  setOnDataChanged(callback: (data: CanvasData) => void): void {
    this.onDataChangedCallback = callback;
  }

  /**
   * Get available layout engines
   */
  getAvailableEngines(): string[] {
    return this.layoutRuntime.getAvailableEngines();
  }

  /**
   * Get active engine name
   */
  getActiveEngineName(): string | null {
    return this.layoutRuntime.getActiveEngineName();
  }

  /**
   * Switch layout engine
   */
  async switchEngine(engineName: string): Promise<void> {
    await this.layoutRuntime.switchEngine(engineName, 'user');
  }

  /**
   * Expose layoutRuntime for advanced use cases
   */
  getLayoutRuntime(): CanvasLayoutRuntime {
    return this.layoutRuntime;
  }

  /**
   * Expose camera system for advanced use cases
   */
  getCameraSystem(): CameraSystem {
    return this.cameraSystem;
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    let frameCount = 0;
    const render = () => {
      const ctx = this.canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      // Clear canvas
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Get current data from layout runtime
      const data = this.layoutRuntime.getCanvasData();
      const camera = this.cameraSystem.getCamera();

      // Debug first frame only
      if (frameCount === 0) {
        const flatNode = data.nodes.find(n => n.metadata?.['perNodeFlattened']);
        if (flatNode) {
          const flatChildren = flatNode.metadata?.['flattenedChildren'] as any[] || [];
          console.log('[RenderLoop] Frame 0 - data from layoutRuntime.getCanvasData():',
            flatChildren.map(c => ({ id: c.GUID || c.id, x: c.x, y: c.y })));
        }
        frameCount++;
      }

      // Render directly - NO transformations
      this.renderer.render(ctx, data.nodes, data.edges, camera);

      // Render selection indicator if there's a selected node
      const selectedNode = this.interactionHandler.getSelectedNode();
      if (selectedNode) {
        const worldPos = this.interactionHandler.getSelectedNodeWorldPos() ||
                        this.interactionHandler.getAbsolutePosition(selectedNode, data.nodes);
        this.interactionHandler.renderSelectionAtPosition(ctx, selectedNode, worldPos, camera);
      }

      this.animationFrameId = requestAnimationFrame(render);
    };

    render();
  }

  /**
   * Get the renderer (needed for hit testing)
   */
  getRenderer(): IRenderer {
    return this.renderer;
  }

  /**
   * Set a new renderer (used when switching containment modes)
   */
  setRenderer(renderer: IRenderer): void {
    console.log('[RuntimeCanvasController] Switching renderer:', renderer.constructor.name);
    this.renderer = renderer;
    // Render loop will pick up new renderer on next frame automatically
  }

  /**
   * Get the selected node
   */
  getSelectedNode(): HierarchicalNode | null {
    return this.interactionHandler.getSelectedNode();
  }

  /**
   * Get selected node snapshot for properties panel
   */
  getSelectedNodeSnapshot(): NodeSelectionSnapshot | null {
    const node = this.interactionHandler.getSelectedNode();
    if (!node) {
      return null;
    }

    const metadata = (node as any).metadata ?? {};
    const overrides = (metadata['styleOverrides'] as NodeStyleOverrides | undefined) ?? {};
    const shape: NodeShape = overrides.shape ?? 'rounded';
    const cornerRadius = overrides.cornerRadius ?? 8;
    const labelVisible = overrides.labelVisible ?? (metadata['labelVisible'] !== false);

    // Include layoutConfig if it exists on the node
    const layoutConfig = (node as any).layoutConfig;

    return {
      kind: 'node',
      id: node.GUID ?? node.id,
      guid: node.GUID ?? undefined,
      text: node.text,
      label: node.text,
      type: node.type,
      style: {
        fill: node.style.fill,
        stroke: node.style.stroke,
        icon: node.style.icon,
        shape,
        cornerRadius,
        labelVisible
      },
      overrides: this.cloneOverrides(overrides),
      layoutConfig: layoutConfig ? {
        layoutStrategy: layoutConfig.layoutStrategy,
        renderStyle: layoutConfig.renderStyle
      } : undefined
    };
  }

  /**
   * Clone style overrides
   */
  private cloneOverrides(overrides: NodeStyleOverrides): NodeStyleOverrides {
    return {
      ...overrides,
      badges: overrides.badges ? overrides.badges.map(badge => ({ ...badge })) : undefined
    };
  }

  /**
   * Apply node style overrides
   */
  applyNodeStyleOverride(
    nodeId: string,
    overrides: Partial<NodeStyleOverrides>,
    scope: 'node' | 'type' = 'node'
  ): void {
    const data = this.layoutRuntime.getCanvasData();
    const targetNode = this.findNodeByIdInData(nodeId, data.nodes);

    if (!targetNode) {
      return;
    }

    // Direct mutation of ViewGraph - no overlay system
    const nodesToUpdate = scope === 'type'
      ? this.collectNodesByType(targetNode.type, data.nodes)
      : [targetNode];

    nodesToUpdate.forEach(node => {
      this.mergeNodeStyleOverrides(node, overrides);
      this.applyOverridesToNode(node);
    });

    // ViewGraph is mutated directly - notify observers
    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(data);
    }
  }

  private findNodeByIdInData(nodeId: string, nodes: HierarchicalNode[]): HierarchicalNode | null {
    for (const node of nodes) {
      if (node.GUID === nodeId || node.id === nodeId) {
        return node;
      }
      if (node.children) {
        const found = this.findNodeByIdInData(nodeId, node.children);
        if (found) return found;
      }
    }
    return null;
  }

  private collectNodesByType(type: string, nodes: HierarchicalNode[]): HierarchicalNode[] {
    const normalizedType = typeof type === 'string' ? type.trim().toLowerCase() : '';
    if (!normalizedType) return [];

    const results: HierarchicalNode[] = [];
    const visit = (nodeList: HierarchicalNode[]) => {
      nodeList.forEach(node => {
        const nodeType = (node.type ?? (node as any).metadata?.['type']) as string | undefined;
        const normalizedNodeType = typeof nodeType === 'string' ? nodeType.trim().toLowerCase() : '';
        if (normalizedNodeType === normalizedType) {
          results.push(node);
        }
        if (node.children && node.children.length > 0) {
          visit(node.children);
        }
      });
    };
    visit(nodes);
    return results;
  }

  // Overlay system removed

  private mergeNodeStyleOverrides(node: HierarchicalNode, overrides: Partial<NodeStyleOverrides>): void {
    if (!overrides) return;

    const metadata = (node as any).metadata ?? {};
    (node as any).metadata = metadata;

    const current = { ...(metadata['styleOverrides'] as NodeStyleOverrides | undefined) };
    let changed = false;

    Object.entries(overrides).forEach(([key, value]) => {
      const hasExisting = Object.prototype.hasOwnProperty.call(current, key);
      if (value === undefined) {
        if (hasExisting) {
          delete (current as Record<string, unknown>)[key];
          changed = true;
        }
        return;
      }
      changed = true;
      if (value === null) {
        delete (current as Record<string, unknown>)[key];
      } else {
        (current as Record<string, unknown>)[key] = value as unknown;
      }
    });

    if (!changed) return;

    if (Object.keys(current).length === 0) {
      delete metadata['styleOverrides'];
    } else {
      metadata['styleOverrides'] = current;
    }
  }

  private applyOverridesToNode(node: HierarchicalNode): void {
    const metadata = (node as any).metadata ?? {};
    const overrides = (metadata['styleOverrides'] as NodeStyleOverrides | undefined) ?? {};

    if (overrides.fill !== undefined) {
      node.style.fill = overrides.fill;
    }
    if (overrides.stroke !== undefined) {
      node.style.stroke = overrides.stroke;
    }
    if (overrides.icon !== undefined) {
      node.style.icon = overrides.icon;
    }
    if (overrides.labelVisible !== undefined) {
      metadata['labelVisible'] = overrides.labelVisible;
    }
    if (overrides.shape !== undefined) {
      metadata['shape'] = overrides.shape;
    }
    if (overrides.cornerRadius !== undefined) {
      metadata['cornerRadius'] = overrides.cornerRadius;
    }
    if (overrides.badges !== undefined) {
      metadata['badges'] = overrides.badges;
    }
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.clearAllSelection();
    this.interactionHandler.clearSelection();
    if (this.onSelectionChanged) {
      this.onSelectionChanged(null);
    }
  }

  /**
   * Set callback for selection changes
   */
  setOnSelectionChanged(callback: (node: HierarchicalNode | null) => void): void {
    this.onSelectionChanged = callback;
    // Immediately emit current selection so observers stay in sync
    const selected = this.interactionHandler.getSelectedNode();
    if (this.onSelectionChanged) {
      this.onSelectionChanged(selected ?? null);
    }
  }



  /**
   * Process interaction event
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  processInteractionEvent(event: any): any {
    const context = {
      allNodes: this.layoutRuntime.getCanvasData().nodes,
      renderer: this.renderer,
      camera: this.cameraSystem.getCamera(),
      clearAllSelection: () => this.clearAllSelection(),
      onSelectionChanged: this.onSelectionChanged,
      toggleNodeCollapsed: (nodeGuid: string) => this.toggleNodeCollapsed(nodeGuid)
    };

    const result = this.interactionHandler.processEvent(event, context);

    // Handle side effects that need canvas controller involvement
    if (event.type === 'drag-update' && result && (result as any).dragHandled) {
      if (this.onDataChangedCallback) {
        this.onDataChangedCallback(this.layoutRuntime.getCanvasData());
      }
    }

    if (event.type === 'drag-stop') {
      if (this.onDataChangedCallback) {
        this.onDataChangedCallback(this.layoutRuntime.getCanvasData());
      }
      const latest = this.layoutRuntime.getCanvasData();
      this.layoutRuntime.setCanvasData(latest, false, 'system');
    }

    if (event.type === 'select') {
      // Selection handled by interaction handler
    }

    if (event.type === 'double-click') {
      // Double-click handled by interaction handler
    }

    return result;
  }

  private applyInitialCamera(
    result: CanvasData,
    viewState: ViewState,
    reason: 'initial' | 'data-update' | 'engine-switch' | 'reflow' | 'user-command'
  ): void {
    let applied = false;

    if (viewState.camera) {
      result.camera = { ...viewState.camera };
      this.setCamera(viewState.camera);
      applied = true;
    } else if (result.camera) {
      this.setCamera(result.camera);
      applied = true;
    } else if (reason === 'initial') {
      const centered = this.centerCameraOnGraph(result);
      if (centered) {
        applied = true;
      }
    }

    if (applied && this.onDataChangedCallback) {
      this.onDataChangedCallback(result);
    } else if (!applied && this.onDataChangedCallback) {
      // Ensure initial data broadcast even if camera unchanged
      this.onDataChangedCallback(result);
    }
  }

  private centerCameraOnGraph(data: CanvasData): boolean {
    const bounds = this.computeVisibleBounds(data.nodes);
    if (!bounds) {
      return false;
    }

    const currentCamera = this.cameraSystem.getCamera();
    const zoom = currentCamera.zoom || 1;
    const viewportWidth = this.canvas.width / zoom;
    const viewportHeight = this.canvas.height / zoom;

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    if (!isFinite(centerX) || !isFinite(centerY)) {
      return false;
    }

    const newCamera = {
      x: centerX - viewportWidth / 2,
      y: centerY - viewportHeight / 2,
      zoom
    };

    data.camera = newCamera;
    this.setCamera(newCamera);
    return true;
  }

  private computeVisibleBounds(
    nodes: HierarchicalNode[],
    offsetX = 0,
    offsetY = 0,
    bounds?: { minX: number; minY: number; maxX: number; maxY: number }
  ): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (!nodes || nodes.length === 0) {
      return bounds ?? null;
    }

    let result =
      bounds ??
      {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY
      };
    let found = false;

    for (const node of nodes) {
      if (node.visible === false) {
        continue;
      }

      const x = offsetX + (node.x ?? 0);
      const y = offsetY + (node.y ?? 0);
      const width = node.width ?? 0;
      const height = node.height ?? 0;

      result.minX = Math.min(result.minX, x);
      result.minY = Math.min(result.minY, y);
      result.maxX = Math.max(result.maxX, x + width);
      result.maxY = Math.max(result.maxY, y + height);
      found = true;

      if (node.children && node.children.length > 0) {
        result =
          this.computeVisibleBounds(node.children, x, y, result) ??
          result;
      }
    }

    if (!found) {
      return bounds ?? null;
    }

    return result;
  }

  private persistCameraToData(): void {
    const data = this.layoutRuntime.getCanvasData();
    data.camera = { ...this.cameraSystem.getCamera() };
  }

  /**
   * Pan the camera
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  pan(deltaX: number, deltaY: number): void {
    // Use CameraSystem for consistent coordinate handling
    // Simulate mouse movement for updatePan
    this.cameraSystem.startPan(0, 0);
    this.cameraSystem.updatePan(deltaX, deltaY);
    this.cameraSystem.stopPan();
    this.persistCameraToData();
  }

  /**
   * Zoom the camera
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  zoom(screenX: number, screenY: number, zoomDelta: number): void {
    this.cameraSystem.zoom(screenX, screenY, zoomDelta);
    this.persistCameraToData();
  }

  /**
   * Handle resize operation
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  handleResize(node: HierarchicalNode, handle: string, mouseX: number, mouseY: number): void {
    const camera = this.cameraSystem.getCamera();

    // Convert mouse position to world coordinates
    const worldMouseX = mouseX / camera.zoom + camera.x;
    const worldMouseY = mouseY / camera.zoom + camera.y;

    // Get current data
    const data = this.layoutRuntime.getCanvasData();

    // Get current world position
    const worldPos = this.interactionHandler.getAbsolutePosition(node, data.nodes);

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

    // Apply resize constraints
    this.applyResizeConstraints(node);

    // Apply movement constraints (in case resize changed position)
    const constrainedPosition = this.interactionHandler.applyMovementConstraints(node, node.x, node.y, data.nodes);
    node.x = constrainedPosition.x;
    node.y = constrainedPosition.y;

    // Update selection position tracking
    this.interactionHandler.updateSelectedNodeWorldPos(this.interactionHandler.getAbsolutePosition(node, data.nodes));

    // Direct mutation of ViewGraph - no overlay system needed
    // Position and size are already mutated directly on the node above
  }

  /**
   * Toggle node collapsed state
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private toggleNodeCollapsed(nodeGuid: string): void {
    const data = this.layoutRuntime.getCanvasData();
    const node = this.findNodeByGuid(data.nodes, nodeGuid);
    if (!node) return;

    const currentlyCollapsed = node.collapsed === true;

    if (!currentlyCollapsed) {
      this.saveVisibilityState(node);
      node.collapsed = true;
      this.hideAllDescendants(node);
      node.visible = true;
    } else {
      // EXPANDING - need to restore hierarchy from source if THIS node has per-node flatten config
      node.collapsed = false;
      this.restoreVisibilityState(node);
      if (node.metadata && node.metadata['_visibilitySnapshot']) {
        delete node.metadata['_visibilitySnapshot'];
      }
    }

    // No GraphDataSet reload needed - hierarchy preserved in node.children
    const baseEdges = data.originalEdges || data.edges;
    data.edges = this.computeEdgesWithInheritance(baseEdges);

    this.layoutRuntime.setCanvasData(data, false, 'system');

    this.layoutRuntime.runLayout({
      reason: 'user-command',
      source: 'system'
    }).then(updated => {
      // Use updated.edges (includes generated CONTAINS edges from metadata) as base
      updated.edges = this.computeEdgesWithInheritance(updated.edges);
      this.layoutRuntime.setCanvasData(updated, false, 'system');
      if (this.onDataChangedCallback) {
        this.onDataChangedCallback(updated);
      }
    }).catch(error => {
      console.error('[RuntimeCanvasController] Failed to run layout after collapse toggle', error);
    });
  }

  /**
   * Show immediate children of a node
   * PORTED FROM ComposableHierarchicalCanvasEngine (line 632)
   * Immediate children start collapsed with hidden descendants
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

  /**
   * Hide all descendants recursively
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private hideAllDescendants(node: HierarchicalNode): void {
    const hideRecursive = (children: HierarchicalNode[]) => {
      children.forEach(child => {
        child.visible = false;
        child.collapsed = true;
        if (child.children && child.children.length > 0) {
          hideRecursive(child.children);
        }
      });
    };
    if (node.children) {
      hideRecursive(node.children);
    }
  }

  /**
   * Save visibility state of all descendants before collapsing
   * PORTED FROM ComposableHierarchicalCanvasEngine
   * Uses same structure as ViewNodeStateService for consistency
   */
  private saveVisibilityState(node: HierarchicalNode): void {
    if (!node.children || node.children.length === 0) return;

    const captureNodeState = (n: HierarchicalNode): any => {
      const nodeGuid = n.GUID ?? n.id;
      const childrenStates = new Map<string, any>();

      if (n.children && n.children.length > 0) {
        n.children.forEach(child => {
          const childGuid = child.GUID ?? child.id;
          const childState = captureNodeState(child);
          childrenStates.set(childGuid, childState);
        });
      }

      return {
        nodeGuid,
        visible: n.visible !== false,
        collapsed: n.collapsed === true,
        childrenStates: childrenStates.size > 0 ? childrenStates : undefined
      };
    };

    const state = captureNodeState(node);

    // Store snapshot on the node (in metadata to avoid polluting the node structure)
    if (!node.metadata) {
      node.metadata = {};
    }
    node.metadata['_visibilitySnapshot'] = state;
  }

  /**
   * Restore visibility state of all descendants from saved snapshot
   * PORTED FROM ComposableHierarchicalCanvasEngine
   * If no snapshot exists, defaults to showing only immediate children
   */
  private restoreVisibilityState(node: HierarchicalNode): void {
    if (!node.children || node.children.length === 0) return;

    const savedState = node.metadata?.['_visibilitySnapshot'];

    if (savedState) {
      // Restore from snapshot using same recursive method as composable
      this.restoreNodeStateRecursively(node, savedState);
    } else {
      // No snapshot - default to showing only immediate children
      this.showImmediateChildren(node);
    }
  }

  /**
   * Restore node state recursively from saved state
   * PORTED FROM ComposableHierarchicalCanvasEngine (line 606)
   */
  private restoreNodeStateRecursively(node: HierarchicalNode, savedState: any): void {
    if (node.children && node.children.length > 0 && savedState.childrenStates) {
      node.children.forEach(child => {
        const childGuid = child.GUID ?? child.id;
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
   * Calculate bounds of children
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private calculateChildBounds(children: HierarchicalNode[]): { maxX: number; maxY: number } {
    let maxX = 0;
    let maxY = 0;
    children.forEach(child => {
      const childRight = child.x + child.width;
      const childBottom = child.y + child.height;
      maxX = Math.max(maxX, childRight);
      maxY = Math.max(maxY, childBottom);
    });
    return { maxX, maxY };
  }

  /**
   * Find node by GUID
   */
  private findNodeByGuid(nodes: HierarchicalNode[], guid: string): HierarchicalNode | null {
    for (const node of nodes) {
      if (node.GUID === guid || node.id === guid) {
        return node;
      }
      // Check flattened children in metadata first (per-node flatten mode)
      const childrenToSearch = (node.metadata?.['flattenedChildren'] as HierarchicalNode[] | undefined) || node.children || [];
      const found = this.findNodeByGuid(childrenToSearch, guid);
      if (found) {
        return found;
      }
    }
    return null;
  }

  /**
   * Clear all selection flags on nodes
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private clearAllSelection(): void {
    const data = this.layoutRuntime.getCanvasData();
    const clearSelection = (nodes: HierarchicalNode[]): void => {
      nodes.forEach(node => {
        node.selected = false;
        node.dragging = false;
        // Check flattened children in metadata first (per-node flatten mode)
        const childrenToClear = (node.metadata?.['flattenedChildren'] as HierarchicalNode[] | undefined) || node.children || [];
        clearSelection(childrenToClear);
      });
    };
    clearSelection(data.nodes);
  }

  /**
   * Apply resize constraints
   * RECURSIVE: Handles deep hierarchies and propagates changes upward
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private applyResizeConstraints(node: HierarchicalNode): void {
    const data = this.layoutRuntime.getCanvasData();
    const parent = this.findParentNode(node, data.nodes);

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
    }

    // Parent resize constraint - cannot be smaller than children
    // This applies to ANY node with children, regardless of whether it has a parent
    // NOW RECURSIVE: Calculates minimum size based on entire descendant tree
    if (node.children && node.children.length > 0) {
      this.applyParentResizeConstraint(node);
    }

    // If this is a parent with children, check if any children are now outside bounds
    if (node.children && node.children.length > 0) {
      this.adjustChildrenAfterParentResize(node);
    }

    // UPWARD PROPAGATION: If this node grew, ensure all ancestors can contain it
    if (parent) {
      this.propagateResizeUpward(node, parent, data.nodes);
    }
  }

  /**
   * Propagate resize changes upward through ancestor hierarchy
   * Ensures all ancestors can contain their children after a resize
   * ONLY propagates for VISIBLE nodes
   */
  private propagateResizeUpward(
    resizedNode: HierarchicalNode,
    parent: HierarchicalNode,
    allNodes: HierarchicalNode[]
  ): void {
    // Skip if the resized node is not visible
    if (resizedNode.visible === false) return;

    // Check if parent needs to grow to contain this child
    const padding = 20;
    const requiredWidth = resizedNode.x + resizedNode.width + padding;
    const requiredHeight = resizedNode.y + resizedNode.height + padding;

    let parentResized = false;

    if (parent.width < requiredWidth) {
      parent.width = requiredWidth;
      parentResized = true;
    }
    if (parent.height < requiredHeight) {
      parent.height = requiredHeight;
      parentResized = true;
    }

    // If parent was resized, propagate upward to grandparent
    if (parentResized) {
      const grandparent = this.findParentNode(parent, allNodes);
      if (grandparent) {
        this.propagateResizeUpward(parent, grandparent, allNodes);
      }
    }
  }

  /**
   * Apply parent resize constraint - ensures parent can't shrink smaller than children
   * RECURSIVE: Calculates minimum size based on entire descendant hierarchy
   * ONLY considers VISIBLE children
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private applyParentResizeConstraint(parentNode: HierarchicalNode): void {
    if (!parentNode.children || parentNode.children.length === 0) return;

    const padding = 20;
    let minWidth = 100; // Absolute minimum
    let minHeight = 100;

    // Filter for visible children only
    const visibleChildren = parentNode.children.filter(child => child.visible !== false);
    if (visibleChildren.length === 0) return;

    // Calculate minimum size needed to contain all VISIBLE children
    // RECURSIVE: First ensure each child respects ITS children's constraints
    visibleChildren.forEach(child => {
      // Recursively apply constraints to child first (bottom-up)
      if (child.children && child.children.length > 0) {
        this.applyParentResizeConstraint(child);
      }

      // Now calculate minimum bounds based on child's final size
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

  /**
   * Adjust children that are outside parent bounds after parent resize
   * ONLY adjusts VISIBLE children
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private adjustChildrenAfterParentResize(parentNode: HierarchicalNode): void {
    const padding = 10;

    // Recursively adjust all VISIBLE children to stay within parent bounds
    const adjustChild = (child: HierarchicalNode) => {
      // Skip invisible children
      if (child.visible === false) return;

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
      if (child.children && child.children.length > 0) {
        child.children.forEach(grandchild => adjustChild(grandchild));
      }
    };

    if (parentNode.children && parentNode.children.length > 0) {
      parentNode.children.forEach(child => adjustChild(child));
    }
  }

  /**
   * Find parent node
   * PORTED FROM CanvasInteractionHandler
   */
  private findParentNode(targetNode: HierarchicalNode, allNodes: HierarchicalNode[]): HierarchicalNode | null {
    return this.interactionHandler.findParentNode(targetNode, allNodes);
  }

  /**
   * Compute edges with inheritance
   * PORTED FROM ComposableHierarchicalCanvasEngine
   * When nodes are collapsed, edges to hidden nodes are inherited up to visible ancestors
   */
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

  /**
   * Build node visibility map
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private buildNodeVisibilityMap(): Record<string, {isVisible: boolean, visibleAncestor?: string}> {
    const visibilityMap: Record<string, {isVisible: boolean, visibleAncestor?: string}> = {};
    const data = this.layoutRuntime.getCanvasData();
    const allNodes = this.getAllNodesFlat(data.nodes);

    // First pass: determine which nodes are actually visible
    allNodes.forEach(node => {
      if (!node.GUID) {
        return;
      }
      const isVisible = node.visible !== false && this.hasVisiblePath(node.GUID, data.nodes);
      visibilityMap[node.GUID] = { isVisible };
    });

    // Second pass: find visible ancestors for hidden nodes
    allNodes.forEach(node => {
      if (!node.GUID) return;
      if (!visibilityMap[node.GUID].isVisible) {
        visibilityMap[node.GUID].visibleAncestor = this.findVisibleAncestor(node.GUID, visibilityMap, data.nodes);
      }
    });

    return visibilityMap;
  }

  /**
   * Check if node has visible path to root
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private hasVisiblePath(nodeGUID: string, nodes: HierarchicalNode[]): boolean {
    const node = this.findNodeByGuid(nodes, nodeGUID);
    if (!node) {
      return false;
    }
    if (node.visible === false) {
      return false;
    }

    // Check if any ancestor is collapsed (which would hide this node)
    const parent = this.findParentOfNodeByGUID(nodeGUID, nodes);
    if (parent) {
      if (parent.collapsed) {
        return false; // Parent is collapsed, so this node is hidden
      }
      if (parent.visible === false) {
        return false;
      }
      // Recursively check parent's visibility
      return parent.GUID ? this.hasVisiblePath(parent.GUID, nodes) : false;
    }

    return true;
  }

  /**
   * Find visible ancestor
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private findVisibleAncestor(
    nodeGUID: string,
    visibilityMap: Record<string, {isVisible: boolean, visibleAncestor?: string}>,
    nodes: HierarchicalNode[]
  ): string | undefined {
    const parent = this.findParentOfNodeByGUID(nodeGUID, nodes);
    if (!parent || !parent.GUID) return undefined;

    if (visibilityMap[parent.GUID]?.isVisible) {
      return parent.GUID;
    }

    // Recursively find visible ancestor
    return this.findVisibleAncestor(parent.GUID, visibilityMap, nodes);
  }

  /**
   * Find parent of node by GUID
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private findParentOfNodeByGUID(nodeGUID: string, nodes: HierarchicalNode[]): HierarchicalNode | null {
    const findParentRecursive = (currentNodes: HierarchicalNode[]): HierarchicalNode | null => {
      for (const node of currentNodes) {
        if (node.children && node.children.some(child => child.GUID === nodeGUID || child.id === nodeGUID)) {
          return node;
        }
        const foundInChildren = findParentRecursive(node.children || []);
        if (foundInChildren) return foundInChildren;
      }
      return null;
    };
    return findParentRecursive(nodes);
  }

  /**
   * Get all nodes in flat array
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private getAllNodesFlat(nodes: HierarchicalNode[]): HierarchicalNode[] {
    const allNodes: HierarchicalNode[] = [];
    const collectRecursive = (currentNodes: HierarchicalNode[]) => {
      currentNodes.forEach(node => {
        allNodes.push(node);
        // Check flattened children in metadata first (per-node flatten mode)
        const childrenToCollect = (node.metadata?.['flattenedChildren'] as HierarchicalNode[] | undefined) || node.children;
        if (childrenToCollect && childrenToCollect.length > 0) {
          collectRecursive(childrenToCollect);
        }
      });
    };
    collectRecursive(nodes);
    return allNodes;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
