import { CanvasData, Camera, HierarchicalNode, Edge } from './types';
import { CanvasLayoutRuntime } from './layout-runtime';
import { IRenderer } from './renderer';
import { CameraSystem } from './camera';
import { CanvasInteractionHandler } from './canvas-interaction-handler';

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
  private readonly layoutRuntime: CanvasLayoutRuntime;
  private readonly renderer: IRenderer;
  private readonly cameraSystem: CameraSystem;
  private readonly canvas: HTMLCanvasElement;
  private readonly interactionHandler: CanvasInteractionHandler;
  private animationFrameId: number | null = null;
  private onDataChangedCallback?: (data: CanvasData) => void;
  private onSelectionChanged?: (node: HierarchicalNode | null) => void;

  constructor(
    canvas: HTMLCanvasElement,
    renderer: IRenderer,
    initialData: CanvasData,
    canvasId: string,
    engineId?: string
  ) {
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
      useWorker: false
    });

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
    // Store original edges if not already stored
    const dataWithOriginalEdges = {
      ...data,
      originalEdges: data.originalEdges || data.edges.filter(e => !e.id.startsWith('inherited-'))
    };

    // Compute edges with inheritance
    dataWithOriginalEdges.edges = this.computeEdgesWithInheritance(dataWithOriginalEdges.originalEdges);

    this.layoutRuntime.setCanvasData(dataWithOriginalEdges, runLayout);

    if (data.camera) {
      this.cameraSystem.setCamera(data.camera);
    }

    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(this.getData());
    }
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
    this.layoutRuntime.setActiveEngine(engineName, 'user');
    await this.runLayout();
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
   * Get the selected node
   */
  getSelectedNode(): HierarchicalNode | null {
    return this.interactionHandler.getSelectedNode();
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
      const selectedNode = this.interactionHandler.getSelectedNode();
      if (selectedNode) {
        // Node has been modified directly - just update runtime and callbacks
        const data = this.layoutRuntime.getCanvasData();
        this.layoutRuntime.setCanvasData(data, false);

        if (this.onDataChangedCallback) {
          this.onDataChangedCallback(data);
        }
      }
    }

    if (event.type === 'drag-stop') {
      const selectedNode = this.interactionHandler.getSelectedNode();
      if (selectedNode) {
        // Node has been modified directly - just update runtime and callbacks
        const data = this.layoutRuntime.getCanvasData();
        this.layoutRuntime.setCanvasData(data, false);

        if (this.onDataChangedCallback) {
          this.onDataChangedCallback(data);
        }
      }
    }

    if (event.type === 'select') {
      // Selection handled by interaction handler
    }

    if (event.type === 'double-click') {
      // Double-click handled by interaction handler
    }

    return result;
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
  }

  /**
   * Zoom the camera
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  zoom(screenX: number, screenY: number, zoomDelta: number): void {
    this.cameraSystem.zoom(screenX, screenY, zoomDelta);
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

    // Update data
    this.layoutRuntime.setCanvasData(data, false);
    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(data);
    }
  }

  /**
   * Toggle node collapsed state
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private toggleNodeCollapsed(nodeGuid: string): void {
    const data = this.layoutRuntime.getCanvasData();
    const node = this.findNodeByGuid(data.nodes, nodeGuid);
    if (!node) return;

    const targetCollapsed = !node.collapsed;

    if (!targetCollapsed) {
      // EXPANDING
      node.collapsed = false;
      const lockedPosition = (node as any)._lockedPosition;
      if (lockedPosition) {
        node.x = lockedPosition.x;
        node.y = lockedPosition.y;
        (node as any)._userLocked = true;
      }

      // Show immediate children
      this.showImmediateChildren(node);

      const childBounds = this.calculateChildBounds(node.children.filter(c => c.visible));
      const requiredWidth = childBounds.maxX + 40;
      const requiredHeight = childBounds.maxY + 40;

      if (requiredWidth > node.width || requiredHeight > node.height) {
        node.width = Math.max(node.width, requiredWidth);
        node.height = Math.max(node.height, requiredHeight);
      }
    } else {
      // COLLAPSING
      (node as any)._lockedPosition = { x: node.x, y: node.y };
      node.collapsed = true;
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          child.visible = false;
          child.collapsed = true;
          this.hideAllDescendants(child);
        });
      }
    }

    // CRITICAL: Recompute edges with inheritance
    data.edges = this.computeEdgesWithInheritance(data.originalEdges || data.edges);

    this.layoutRuntime.setCanvasData(data, false);

    // Update selected node position if needed
    const selectedNode = this.interactionHandler.getSelectedNode();
    if (selectedNode) {
      const worldPos = this.interactionHandler.getAbsolutePosition(selectedNode, data.nodes);
      this.interactionHandler.updateSelectedNodeWorldPos(worldPos);
    }

    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(data);
    }
  }

  /**
   * Show immediate children of a node
   * PORTED FROM ComposableHierarchicalCanvasEngine
   */
  private showImmediateChildren(node: HierarchicalNode): void {
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        child.visible = true;
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
      const found = this.findNodeByGuid(node.children || [], guid);
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
        clearSelection(node.children || []);
      });
    };
    clearSelection(data.nodes);
  }

  /**
   * Apply resize constraints
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
        if (node.children && node.children.length > 0) {
          collectRecursive(node.children);
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
