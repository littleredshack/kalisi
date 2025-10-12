import { HierarchicalNode, Point } from './types';

/**
 * MINIMAL interaction state management only
 * Does NOT handle events - that stays in modular-canvas component
 * Does NOT duplicate hit testing - that stays in canvas engine
 * ONLY manages interaction state to reduce canvas engine complexity
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
}