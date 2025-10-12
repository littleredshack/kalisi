import { HierarchicalNode, Point, Camera } from './types';

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

  private getNodePath(targetNode: HierarchicalNode, allNodes: HierarchicalNode[]): HierarchicalNode[] | null {
    const targetGuid = targetNode.GUID;

    const matchesTarget = (node: HierarchicalNode): boolean => {
      if (node === targetNode) {
        return true;
      }
      if (targetGuid && node.GUID === targetGuid) {
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
          return path;
        }
        const found = traverse(node.children ?? [], path);
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
      ? Math.max(20, Math.min(parent.height * 0.2, 80))
      : 0;

    // Calculate bounds within parent (in relative coordinates)
    const minX = padding;
    const minY = headerOffset + padding;
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
}