import { HierarchicalNode, Point, Camera } from './types';
import { ViewNodeStateService } from '../../core/services/view-node-state.service';
import { LayoutPrimitives } from './layout-primitives';
import {
  InteractionEvent,
  InteractionEventResult,
  SelectEvent,
  DragStartEvent,
  DragUpdateEvent,
  DragStopEvent,
  ResizeStartEvent,
  ResizeUpdateEvent,
  ResizeStopEvent,
  HitTestResizeEvent,
  DoubleClickEvent,
  SelectResult,
  DragStartResult,
  DragUpdateResult,
  HitTestResizeResult,
  DoubleClickResult
} from './interaction-events';

const COLLAPSED_NODE_HEIGHT = 64;

/**
 * Manages interaction state and computational logic
 * Does NOT handle events - that stays in modular-canvas component
 * Includes hit testing, drag calculations, and selection rendering
 * Reduces canvas engine complexity by extracting interaction concerns
 */
export class CanvasInteractionHandler {
  // Interaction state (moved from canvas engine)
  private selectedNode: HierarchicalNode | null = null;
  private selectedNodeWorldPos: Point | null = null;
  private isDragging = false;
  private isResizing = false;
  private resizeHandle = '';
  private dragOffset: Point = { x: 0, y: 0 };

  // Performance optimization: cache for coordinate calculations
  private nodePathCache = new Map<string, string[]>();
  private lastNodesVersion = -1;

  // Read-only state getters
  getSelectedNode(): HierarchicalNode | null {
    return this.selectedNode;
  }

  getSelectedNodeWorldPos(): Point | null {
    return this.selectedNodeWorldPos;
  }

  isNodeDragging(): boolean {
    return this.isDragging;
  }

  isNodeResizing(): boolean {
    return this.isResizing;
  }

  getResizeHandle(): string {
    return this.resizeHandle;
  }

  getDragOffset(): Point {
    return this.dragOffset;
  }

  // State setters (called by canvas engine)
  setSelectedNode(node: HierarchicalNode | null, worldPos?: Point): void {
    this.selectedNode = node;
    this.selectedNodeWorldPos = worldPos || null;
  }

  clearSelection(): void {
    this.selectedNode = null;
    this.selectedNodeWorldPos = null;
  }

  setDragging(isDragging: boolean, dragOffset?: Point): void {
    this.isDragging = isDragging;
    if (dragOffset) {
      this.dragOffset = dragOffset;
    }
  }

  setResizing(isResizing: boolean, handle?: string): void {
    this.isResizing = isResizing;
    this.resizeHandle = handle || '';
  }

  updateSelectedNodeWorldPos(worldPos: Point): void {
    this.selectedNodeWorldPos = worldPos;
  }

  // Event processing pipeline (Phase 7.3)
  processEvent(
    event: InteractionEvent,
    context: {
      allNodes: HierarchicalNode[];
      renderer: any;
      clearAllSelection: () => void;
      onSelectionChanged?: (node: HierarchicalNode | null) => void;
      camera?: Camera;
      toggleNodeCollapsed?: (nodeGuid: string) => void;
    }
  ): InteractionEventResult {
    switch (event.type) {
      case 'select':
        return this.handleSelectEvent(event, context);
      case 'drag-start':
        return this.handleDragStartEvent(event, context);
      case 'drag-update':
        return this.handleDragUpdateEvent(event, context);
      case 'drag-stop':
        return this.handleDragStopEvent(event, context);
      case 'hit-test-resize':
        return this.handleHitTestResizeEvent(event, context);
      case 'resize-start':
        return this.handleResizeStartEvent(event, context);
      case 'resize-update':
        return this.handleResizeUpdateEvent(event, context);
      case 'resize-stop':
        return this.handleResizeStopEvent(event, context);
      case 'double-click':
        return this.handleDoubleClickEvent(event, context);
      default:
        console.warn('Unknown interaction event type:', (event as any).type);
        return;
    }
  }

  private handleSelectEvent(event: SelectEvent, context: any): SelectResult {
    const result = context.renderer.hitTest(event.worldPos.x, event.worldPos.y, context.allNodes);

    // Clear previous selection
    context.clearAllSelection();

    if (result) {
      this.setSelectedNode(result.node, result.worldPosition);
      result.node.selected = true;
      context.onSelectionChanged?.(result.node);
    } else {
      this.clearSelection();
      context.onSelectionChanged?.(null);
    }

    return { selectedNode: this.getSelectedNode() };
  }

  private handleDragStartEvent(event: DragStartEvent, context: any): DragStartResult {
    const result = context.renderer.hitTest(event.worldPos.x, event.worldPos.y, context.allNodes);

    if (result) {
      context.clearAllSelection();
      this.setSelectedNode(result.node, result.worldPosition);

      const absolutePos = result.worldPosition ?? this.getAbsolutePosition(result.node, context.allNodes);
      const dragOffset = {
        x: event.worldPos.x - absolutePos.x,
        y: event.worldPos.y - absolutePos.y
      };
      this.setDragging(true, dragOffset);

      result.node.selected = true;
      result.node.dragging = true;

      context.onSelectionChanged?.(result.node);
      return { draggedNode: this.getSelectedNode() };
    }

    return { draggedNode: null };
  }

  private handleDragUpdateEvent(event: DragUpdateEvent, context: any): DragUpdateResult {
    const constrainedPosition = this.calculateDragPosition(
      event.worldPos.x,
      event.worldPos.y,
      context.allNodes
    );

    if (!constrainedPosition) return { dragHandled: false };

    const selectedNode = this.getSelectedNode()!;
    selectedNode.x = constrainedPosition.x;
    selectedNode.y = constrainedPosition.y;

    (selectedNode as any)._lockedPosition = {
      x: selectedNode.x,
      y: selectedNode.y
    };
    (selectedNode as any)._userLocked = true;

    const newWorldPos = this.getAbsolutePosition(selectedNode, context.allNodes);
    this.updateSelectedNodeWorldPos(newWorldPos);

    return { dragHandled: true };
  }

  private handleDragStopEvent(event: DragStopEvent, context: any): void {
    const node = this.getSelectedNode();
    if (node) {
      node.dragging = false;
    }
    this.setDragging(false);
  }

  private handleHitTestResizeEvent(event: HitTestResizeEvent, context: any): HitTestResizeResult {
    const handle = this.hitTestResizeHandle(
      event.screenPos.x,
      event.screenPos.y,
      event.node,
      (node) => this.getAbsolutePosition(node, context.allNodes),
      context.camera
    );

    return { handle };
  }

  private handleResizeStartEvent(event: ResizeStartEvent, context: any): void {
    this.setResizing(true, event.handle);
  }

  private handleResizeUpdateEvent(event: ResizeUpdateEvent, context: any): void {
    // Resize logic would be implemented here
    // For now, keeping existing handleResize approach
  }

  private handleResizeStopEvent(event: ResizeStopEvent, context: any): void {
    this.setResizing(false);
  }

  private handleDoubleClickEvent(event: DoubleClickEvent, context: any): DoubleClickResult {
    // Store whether this node was selected before collapse/expand
    // IMPORTANT: Prioritize GUID matching since IDs can change
    const wasSelected = this.selectedNode &&
                       (this.selectedNode.GUID === event.nodeGuid || this.selectedNode.id === event.nodeGuid);

    // Perform the collapse/expand operation
    if (context.toggleNodeCollapsed) {
      context.toggleNodeCollapsed(event.nodeGuid);
    }

    // CRITICAL FIX: If the collapsed/expanded node was selected, update position tracking
    if (wasSelected && this.selectedNode) {
      const newWorldPos = this.getAbsolutePosition(this.selectedNode, context.allNodes);
      this.updateSelectedNodeWorldPos(newWorldPos);
    }

    return {
      handled: true,
      nodeGuid: event.nodeGuid
    };
  }

  // Hit testing methods (extracted from canvas engine)
  hitTestResizeHandle(x: number, y: number, node: HierarchicalNode, getAbsolutePosition: (node: HierarchicalNode) => Point, camera: Camera): string {
    const worldPos = getAbsolutePosition(node);

    // Convert to screen coordinates for handle testing
    const screenX = (worldPos.x - camera.x) * camera.zoom;
    const screenY = (worldPos.y - camera.y) * camera.zoom;
    const screenWidth = node.width * camera.zoom;
    const screenHeight = node.height * camera.zoom;

    // L-corner hit areas: 12x12px boxes centered on each L "elbow"
    const offset = 6;      // 6px gap from border (match visual offset)
    const hitAreaSize = 12; // 12x12px hit area
    const halfHit = hitAreaSize / 2;

    const left = screenX - offset;
    const right = screenX + screenWidth + offset;
    const top = screenY - offset;
    const bottom = screenY + screenHeight + offset;

    // Test L-corner hit areas (only corner resize, no edge handles)
    if (this.pointInArea(x, y, left - halfHit, top - halfHit, hitAreaSize, hitAreaSize)) return 'nw';
    if (this.pointInArea(x, y, right - halfHit, top - halfHit, hitAreaSize, hitAreaSize)) return 'ne';
    if (this.pointInArea(x, y, right - halfHit, bottom - halfHit, hitAreaSize, hitAreaSize)) return 'se';
    if (this.pointInArea(x, y, left - halfHit, bottom - halfHit, hitAreaSize, hitAreaSize)) return 'sw';

    return '';
  }

  private pointInArea(px: number, py: number, ax: number, ay: number, aw: number, ah: number): boolean {
    return px >= ax && px <= ax + aw && py >= ay && py <= ay + ah;
  }

  // Coordinate calculation methods (extracted from canvas engine)
  getAbsolutePosition(targetNode: HierarchicalNode, allNodes: HierarchicalNode[]): Point {
    const path = this.getNodePath(targetNode, allNodes);
    if (path) {
      let x = 0, y = 0;
      path.forEach(node => {
        x += node.x;
        y += node.y;
      });
      return { x, y };
    }
    return { x: 0, y: 0 };
  }

  // Clear caches when nodes structure changes
  clearCache(): void {
    this.nodePathCache.clear();
    this.lastNodesVersion++;
  }

  getParentAbsolutePosition(targetNode: HierarchicalNode, allNodes: HierarchicalNode[]): Point {
    const path = this.getNodePath(targetNode, allNodes);
    if (path && path.length > 1) {
      // Sum all parent positions (exclude the target node itself)
      const parentPath = path.slice(0, -1);
      return this.getAbsolutePositionFromPath(parentPath);
    }
    return {x: 0, y: 0}; // Top-level node
  }

  private getAbsolutePositionFromPath(path: HierarchicalNode[]): Point {
    let x = 0, y = 0;
    path.forEach(node => {
      x += node.x;
      y += node.y;
    });
    return {x, y};
  }

  private lookupNodesByPath(guidPath: string[], allNodes: HierarchicalNode[]): HierarchicalNode[] | null {
    const result: HierarchicalNode[] = [];
    let currentNodes = allNodes;

    for (const guid of guidPath) {
      // IMPORTANT: Prioritize GUID matching since IDs can change
      const node = currentNodes.find(n => n.GUID === guid) ||
                   currentNodes.find(n => n.id === guid);
      if (!node) {
        return null; // Path is stale/invalid
      }
      result.push(node);
      // Check flattened children in metadata first (per-node flatten mode)
      currentNodes = ((node.metadata?.['flattenedChildren'] as HierarchicalNode[] | undefined) || node.children) ?? [];
    }

    return result;
  }

  private getNodePath(targetNode: HierarchicalNode, allNodes: HierarchicalNode[]): HierarchicalNode[] | null {
    const targetGuid = targetNode.GUID || targetNode.id;
    if (!targetGuid) return null;

    // Check cache first - cache contains GUID/ID path, not node references
    const cachedGuidPath = this.nodePathCache.get(targetGuid);
    if (cachedGuidPath) {
      // Look up fresh node references for the cached path
      const freshPath = this.lookupNodesByPath(cachedGuidPath, allNodes);
      if (freshPath) {
        return freshPath;
      }
      // If lookup failed, remove stale cache entry
      this.nodePathCache.delete(targetGuid);
    }

    const matchesTarget = (node: HierarchicalNode): boolean => {
      if (node === targetNode) {
        return true;
      }
      if (targetGuid && (node.GUID === targetGuid || node.id === targetGuid)) {
        return true;
      }
      return false;
    };

    const traverse = (
      nodes: HierarchicalNode[],
      currentPath: HierarchicalNode[] = []
    ): HierarchicalNode[] | null => {
      for (const node of nodes) {
        const path = [...currentPath, node];
        if (matchesTarget(node)) {
          // Cache the GUID/ID path, not node references
          const guidPath = path.map(n => n.GUID || n.id).filter(Boolean) as string[];
          this.nodePathCache.set(targetGuid, guidPath);
          return path;
        }
        // Check flattened children in metadata first (per-node flatten mode)
        const childrenToTraverse = ((node.metadata?.['flattenedChildren'] as HierarchicalNode[] | undefined) || node.children) ?? [];
        const found = traverse(childrenToTraverse, path);
        if (found) {
          return found;
        }
      }
      return null;
    };

    return traverse(allNodes);
  }

  findParentNode(targetNode: HierarchicalNode, allNodes: HierarchicalNode[]): HierarchicalNode | null {
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
        // Check flattened children in metadata first (per-node flatten mode)
        const childList = ((node.metadata?.['flattenedChildren'] as HierarchicalNode[] | undefined) || node.children) ?? [];
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

    return findParent(allNodes);
  }

  // Movement constraint logic (extracted from canvas engine)
  applyMovementConstraints(node: HierarchicalNode, newX: number, newY: number, allNodes: HierarchicalNode[]): {x: number, y: number} {
    // Find the parent of this node
    const parent = this.findParentNode(node, allNodes);
    if (!parent) {
      // Top-level node - no constraints
      return {x: newX, y: newY};
    }

    const padding = 10;

    const headerOffset = parent && parent.children && parent.children.length > 0
      ? LayoutPrimitives.computeHeaderOffset(parent)
      : 0;

    // Calculate bounds within parent (in relative coordinates)
    const minX = padding;
    const minY = headerOffset + LayoutPrimitives.HEADER_GAP;
    const maxX = parent.width - node.width - padding;
    const maxY = parent.height - node.height - padding;

    // Constrain to bounds
    const constrainedX = Math.max(minX, Math.min(maxX, newX));
    const constrainedY = Math.max(minY, Math.min(maxY, newY));

    return {x: constrainedX, y: constrainedY};
  }

  // Core drag calculation logic (extracted from updateDrag method)
  calculateDragPosition(worldX: number, worldY: number, allNodes: HierarchicalNode[]): {x: number, y: number} | null {
    const selectedNode = this.getSelectedNode();
    if (!this.isNodeDragging() || !selectedNode) return null;

    const dragOffset = this.getDragOffset();
    const newWorldX = worldX - dragOffset.x;
    const newWorldY = worldY - dragOffset.y;

    const parentPos = this.getParentAbsolutePosition(selectedNode, allNodes);
    const newRelativeX = newWorldX - parentPos.x;
    const newRelativeY = newWorldY - parentPos.y;

    // Apply movement constraints
    return this.applyMovementConstraints(selectedNode, newRelativeX, newRelativeY, allNodes);
  }

  // Selection rendering methods (extracted from canvas engine)
  renderSelectionAtPosition(
    ctx: CanvasRenderingContext2D,
    node: HierarchicalNode,
    worldPos: Point,
    camera: Camera,
    viewNodeStateService?: ViewNodeStateService
  ): void {
    if (this.getSelectedNode() === node) {
      this.updateSelectedNodeWorldPos(worldPos);
    }
    // ORANGE L-CORNER SELECTION INDICATORS
    // Convert world position to screen coordinates for selection rendering
    const screenX = (worldPos.x - camera.x) * camera.zoom;
    const screenY = (worldPos.y - camera.y) * camera.zoom;

    const defaultWidth = typeof node.metadata?.['defaultWidth'] === 'number'
      ? Number(node.metadata['defaultWidth'])
      : undefined;
    const defaultHeight = typeof node.metadata?.['defaultHeight'] === 'number'
      ? Number(node.metadata['defaultHeight'])
      : undefined;

    const width = Number.isFinite(node.width)
      ? Number(node.width)
      : defaultWidth ?? 220;
    const height = Number.isFinite(node.height)
      ? Number(node.height)
      : defaultHeight ?? COLLAPSED_NODE_HEIGHT;
    const screenWidth = width * camera.zoom;
    const screenHeight = height * camera.zoom;

    // Draw orange L-corner handles (fixed screen pixels, not scaled by zoom)
    this.drawLCornerHandles(ctx, screenX, screenY, screenWidth, screenHeight);
  }

  private drawLCornerHandles(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    // ORANGE L-CORNER HANDLES: Size relative to node, fixed screen pixels
    const baseArmLength = Math.min(width, height) * 0.08; // 8% of smaller dimension
    const armLength = Math.max(8, Math.min(20, baseArmLength)); // Clamp between 8-20px
    const offset = 6;      // 6px gap from border (increased)
    const thickness = 2;   // 2px line thickness

    ctx.strokeStyle = '#FF8A00';  // Orange
    ctx.lineWidth = thickness;
    ctx.lineCap = 'square';

    // Calculate corner positions (outside the rounded rectangle)
    const left = x - offset;
    const right = x + width + offset;
    const top = y - offset;
    const bottom = y + height + offset;

    // Draw 4 L-shaped corner indicators (parallel to node edges)

    // Top-left L (horizontal arm right, vertical arm down)
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left + armLength, top);
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + armLength);
    ctx.stroke();

    // Top-right L (horizontal arm left, vertical arm down)
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right - armLength, top);
    ctx.moveTo(right, top);
    ctx.lineTo(right, top + armLength);
    ctx.stroke();

    // Bottom-right L (horizontal arm left, vertical arm up)
    ctx.beginPath();
    ctx.moveTo(right, bottom);
    ctx.lineTo(right - armLength, bottom);
    ctx.moveTo(right, bottom);
    ctx.lineTo(right, bottom - armLength);
    ctx.stroke();

    // Bottom-left L (horizontal arm right, vertical arm up)
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left + armLength, bottom);
    ctx.moveTo(left, bottom);
    ctx.lineTo(left, bottom - armLength);
    ctx.stroke();
  }
}
