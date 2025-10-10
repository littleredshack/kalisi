import { Injectable } from '@angular/core';
import { HierarchicalNode } from '../../shared/canvas/types';
import { CanvasViewStateService, CanvasMutation } from '../../shared/canvas/state/canvas-view-state.service';
import { CollapseBehavior, ViewNodeStateService } from './view-node-state.service';

/**
 * Dynamic layout responder that listens to canvas state mutations and emits
 * layout adjustments via the shared CanvasViewStateService. This keeps
 * reflow logic decoupled from the rendering engine while preserving user
 * overrides.
 */
@Injectable({
  providedIn: 'root'
})
export class DynamicLayoutService {
  constructor(
    private readonly canvasViewStateService: CanvasViewStateService,
    private readonly viewNodeStateService: ViewNodeStateService
  ) {
    this.canvasViewStateService.mutations$.subscribe(mutation => this.handleCanvasMutation(mutation));
  }

  /**
   * Entry point for tests or manual invocations. Mutates the provided node tree
   * in place using the same rules the reactive pipeline applies.
   */
  reflowSiblings(
    nodes: HierarchicalNode[],
    changedNodeGuid: string,
    collapseBehavior: CollapseBehavior,
    containerBounds?: { width: number; height: number },
    viewportBounds?: { width: number; height: number }
  ): void {
    const context = this.findNodeContext(nodes, changedNodeGuid);
    if (!context) {
      return;
    }

    const { node: changedNode, siblings, parent } = context;

    const userLocked = (changedNode as any)._userLocked === true;
    if (userLocked) {
      if (!changedNode.collapsed && changedNode.children && changedNode.children.length > 0) {
        this.reflowContainer(changedNode.children, { width: changedNode.width, height: changedNode.height }, viewportBounds, changedNode);
      }
      return;
    }

    const effectiveContainer = containerBounds ?? this.deriveContainerBounds(parent, viewportBounds);

    this.reflowContainer(siblings, effectiveContainer, viewportBounds, parent ?? undefined);

    if (!changedNode.collapsed && changedNode.children && changedNode.children.length > 0) {
      this.reflowChildren(changedNode.children, changedNode);
    }

    this.ensureAllParentsContainChildren(nodes, viewportBounds);
  }

  private handleCanvasMutation(mutation: CanvasMutation): void {
    if (mutation.source === 'layout') {
      return;
    }

    if (mutation.type === 'collapse' && mutation.nodeGuid) {
      this.handleCollapseMutation(mutation.canvasId, mutation);
    }
  }

  private handleCollapseMutation(canvasId: string, mutation: CanvasMutation): void {
    const reflowBehavior = this.viewNodeStateService.getReflowBehaviorValue();
    if (reflowBehavior !== 'dynamic') {
      return;
    }

    const nodeGuid = mutation.nodeGuid;
    if (!nodeGuid) {
      console.warn('[DynamicLayout] collapse mutation missing nodeGuid');
      return;
    }

    const currentState = this.canvasViewStateService.getCurrentState(canvasId);
    if (!currentState) {
      console.warn('[DynamicLayout] collapse mutation received with no current canvas state');
      return;
    }

    const draft = this.deepClone(currentState);
    const collapseBehavior = this.viewNodeStateService.getCollapseBehaviorValue();
    const viewportBounds = mutation.payload?.['viewportBounds'] as { width: number; height: number } | undefined;

    const contextBefore = this.findNodeContext(draft.nodes, nodeGuid);
    const originalPosition = contextBefore ? { x: contextBefore.node.x, y: contextBefore.node.y } : undefined;
    const originalLockedPosition = contextBefore ? (contextBefore.node as any)._lockedPosition : undefined;
    const userLocked = (contextBefore?.node as any)?._userLocked === true;
    console.log('[DynamicLayout] collapse mutation received', {
      nodeGuid,
      source: mutation.source,
      collapsed: contextBefore?.node.collapsed,
      userLocked,
      positionBefore: originalPosition
    });

    this.reflowSiblings(
      draft.nodes,
      nodeGuid,
      collapseBehavior,
      undefined,
      viewportBounds
    );

    const contextAfter = this.findNodeContext(draft.nodes, nodeGuid);
    if (contextAfter && originalPosition && !userLocked) {
      contextAfter.node.x = originalPosition.x;
      contextAfter.node.y = originalPosition.y;
    }
    if (contextAfter && originalLockedPosition !== undefined) {
      (contextAfter.node as any)._lockedPosition = originalLockedPosition;
    }
    console.log('[DynamicLayout] layout result', {
      nodeGuid,
      positionAfter: contextAfter ? { x: contextAfter.node.x, y: contextAfter.node.y } : undefined
    });

    this.canvasViewStateService.publishFromLayout(canvasId, draft, {
      type: 'layout',
      nodeGuid,
      payload: {
        reason: 'collapse'
      }
    });
  }

  /**
   * Find a node and its context (siblings and parent)
   */
  private findNodeContext(
    nodes: HierarchicalNode[],
    nodeGuid: string,
    parent: HierarchicalNode | null = null
  ): { node: HierarchicalNode; siblings: HierarchicalNode[]; parent: HierarchicalNode | null } | null {
    for (const node of nodes) {
      if (node.GUID === nodeGuid) {
        return { node, siblings: nodes, parent };
      }
      if (node.children) {
        const result = this.findNodeContext(node.children, nodeGuid, node);
        if (result) return result;
      }
    }
    return null;
  }

  /**
   * Reflow children within their parent container
   */
  private reflowChildren(children: HierarchicalNode[], parentNode?: HierarchicalNode): void {
    const PADDING = 20;
    const SPACING = 20;
    const headerOffset = parentNode ? this.getHeaderOffset(parentNode) : 40;
    let currentY = PADDING + headerOffset;

    for (const child of children) {
      child.y = currentY;
      (child as any).targetY = currentY;

      const childHeight = this.getEffectiveHeight(child);
      currentY += childHeight + SPACING;

      if (!child.collapsed && child.children && child.children.length > 0) {
        this.reflowChildren(child.children, child);
      }
    }
  }

  /**
   * Calculate optimal positions for nodes inside a container.
   */
  public reflowContainer(
    nodes: HierarchicalNode[],
    containerBounds?: { width: number; height: number },
    viewportBounds?: { width: number; height: number },
    parentNode?: HierarchicalNode
  ): void {
    if (nodes.length === 0) return;

    const PADDING = 20;
    const HORIZONTAL_SPACING = 30;
    const VERTICAL_SPACING = 20;

    const effectiveBounds = this.getEffectiveLayoutBounds(containerBounds, viewportBounds);

    if (effectiveBounds) {
      this.applyOptimalGridLayout(
        nodes,
        PADDING,
        HORIZONTAL_SPACING,
        VERTICAL_SPACING,
        effectiveBounds,
        parentNode
      );
    } else {
      this.applyVerticalStackLayout(nodes, PADDING, VERTICAL_SPACING, undefined, parentNode);
    }
  }

  private getEffectiveLayoutBounds(
    containerBounds?: { width: number; height: number },
    viewportBounds?: { width: number; height: number }
  ): { width: number; height: number } | undefined {
    if (!containerBounds && !viewportBounds) return undefined;

    if (!containerBounds) {
      return viewportBounds ? {
        width: viewportBounds.width * 0.9,
        height: viewportBounds.height * 0.9
      } : undefined;
    }

    if (!viewportBounds) {
      return containerBounds;
    }

    return {
      width: Math.min(containerBounds.width, viewportBounds.width * 0.9),
      height: Math.min(containerBounds.height, viewportBounds.height * 0.9)
    };
  }

  private applyVerticalStackLayout(
    nodes: HierarchicalNode[],
    padding: number,
    vSpacing: number,
    containerBounds?: { width: number; height: number },
    parentNode?: HierarchicalNode
  ): void {
    const sortedNodes = [...nodes].sort((a, b) => a.y - b.y);

    const headerOffset = parentNode ? this.getHeaderOffset(parentNode) : 40;
    let currentY = padding + headerOffset;
    const startX = Math.min(...nodes.map(n => n.x));

    for (const node of sortedNodes) {
      node.x = startX;
      node.y = currentY;

      const nodeHeight = this.getEffectiveHeight(node);
      currentY += nodeHeight + vSpacing;
    }
  }

  private applyOptimalGridLayout(
    nodes: HierarchicalNode[],
    padding: number,
    hSpacing: number,
    vSpacing: number,
    containerBounds: { width: number; height: number },
    parentNode?: HierarchicalNode
  ): void {
    if (nodes.length === 0) return;

    const headerOffset = parentNode ? this.getHeaderOffset(parentNode) : 0;
    const availableWidth = containerBounds.width - (padding * 2);
    const availableHeight = Math.max(0, containerBounds.height - (padding * 2) - headerOffset);

    const avgNodeWidth = nodes.reduce((sum, n) => sum + this.getEffectiveWidth(n), 0) / nodes.length;
    const avgNodeHeight = nodes.reduce((sum, n) => sum + this.getEffectiveHeight(n), 0) / nodes.length;

    const idealCols = Math.floor(availableWidth / (avgNodeWidth + hSpacing));
    const actualCols = Math.max(1, Math.min(idealCols, nodes.length));

    let currentX = padding;
    let currentY = padding + headerOffset;
    let currentCol = 0;
    let maxHeightInRow = 0;

    for (const node of nodes) {
      const nodeWidth = this.getEffectiveWidth(node);
      const nodeHeight = this.getEffectiveHeight(node);

      if (currentX + nodeWidth > containerBounds.width - padding && currentCol > 0) {
        currentX = padding;
        currentY += maxHeightInRow + vSpacing;
        currentCol = 0;
        maxHeightInRow = 0;
      }

      if (currentCol >= actualCols) {
        currentX = padding;
        currentY += maxHeightInRow + vSpacing;
        currentCol = 0;
        maxHeightInRow = 0;
      }

      node.x = Math.min(currentX, containerBounds.width - nodeWidth - padding);
      node.y = currentY;

      currentX += nodeWidth + hSpacing;
      maxHeightInRow = Math.max(maxHeightInRow, nodeHeight);
      currentCol++;
    }
  }

  private ensureAllParentsContainChildren(
    nodes: HierarchicalNode[],
    viewportBounds?: { width: number; height: number }
  ): void {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        this.ensureParentContainsChildren(node, viewportBounds);
        this.ensureAllParentsContainChildren(node.children, viewportBounds);
      }
    }
  }

  private ensureParentContainsChildren(
    parentNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number }
  ): void {
    if (!parentNode.children || parentNode.children.length === 0) return;

    const CONTAINER_PADDING = 40;
    const childBounds = this.calculateChildrenBounds(parentNode.children);

    const requiredWidth = childBounds.maxX - childBounds.minX + CONTAINER_PADDING;
    const requiredHeight = childBounds.maxY - childBounds.minY + CONTAINER_PADDING;

    const needsWidthIncrease = requiredWidth > parentNode.width;
    const needsHeightIncrease = requiredHeight > parentNode.height;

    if (needsWidthIncrease || needsHeightIncrease) {
      let newWidth = Math.max(parentNode.width, requiredWidth);
      let newHeight = Math.max(parentNode.height, requiredHeight);

      if (viewportBounds) {
        newWidth = Math.min(newWidth, viewportBounds.width * 0.95);
        newHeight = Math.min(newHeight, viewportBounds.height * 0.95);
      }

      parentNode.width = newWidth;
      parentNode.height = newHeight;
    } else {
      this.resizeContainerToFitChildren(parentNode, viewportBounds);
    }

    const containerBounds = { width: parentNode.width, height: parentNode.height };
    this.reflowContainer(parentNode.children, containerBounds, viewportBounds, parentNode);
  }

  private resizeContainerToFitChildren(
    parentNode: HierarchicalNode,
    viewportBounds?: { width: number; height: number }
  ): void {
    const childBounds = this.calculateChildrenBounds(parentNode.children);
    const padding = 40;

    const newWidth = childBounds.maxX + padding;
    const newHeight = childBounds.maxY + padding;

    const widthChange = Math.abs(parentNode.width - newWidth) / parentNode.width;
    const heightChange = Math.abs(parentNode.height - newHeight) / parentNode.height;

    const heightThreshold = (parentNode.text === 'Kalisi' || parentNode.type === 'root') ? 0.1 : 0.2;

    if (widthChange > 0.2 || heightChange > heightThreshold) {
      const finalWidth = viewportBounds ?
        Math.min(Math.max(newWidth, 400), viewportBounds.width * 0.95) :
        Math.max(newWidth, 400);
      const finalHeight = viewportBounds ?
        Math.min(Math.max(newHeight, 200), viewportBounds.height * 0.95) :
        Math.max(newHeight, 200);

      parentNode.width = finalWidth;
      parentNode.height = finalHeight;
    }
  }

  private calculateChildrenBounds(children: HierarchicalNode[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    if (children.length === 0) {
      return { minX: 0, minY: 0, maxX: 400, maxY: 200 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const child of children) {
      const childWidth = this.getEffectiveWidth(child);
      const childHeight = this.getEffectiveHeight(child);

      minX = Math.min(minX, child.x);
      minY = Math.min(minY, child.y);
      maxX = Math.max(maxX, child.x + childWidth);
      maxY = Math.max(maxY, child.y + childHeight);
    }

    return { minX, minY, maxX, maxY };
  }

  private ensureMinimumSpacing(nodes: HierarchicalNode[]): void {
    const MIN_VERTICAL_SPACING = 20;

    for (let i = 1; i < nodes.length; i++) {
      const prevNode = nodes[i - 1];
      const currNode = nodes[i];

      const prevHeight = this.getEffectiveHeight(prevNode);

      const minY = prevNode.y + prevHeight + MIN_VERTICAL_SPACING;
      if (currNode.y < minY) {
        currNode.y = minY;
        (currNode as any).targetY = currNode.y;
      }
    }
  }

  private getEffectiveHeight(node: HierarchicalNode): number {
    if (node.collapsed && node.children && node.children.length > 0) {
      return 60;
    }
    return node.height;
  }

  private getEffectiveWidth(node: HierarchicalNode): number {
    if (node.collapsed && node.children && node.children.length > 0) {
      return 180;
    }
    return node.width;
  }

  private getHeaderOffset(node: HierarchicalNode): number {
    const maxAllowed = Math.max(20, node.height - 50);
    const proportional = node.height * 0.2;
    const base = Math.max(32, Math.min(proportional, 80));
    return Math.max(20, Math.min(base, maxAllowed));
  }

  private deriveContainerBounds(
    parent: HierarchicalNode | null,
    viewportBounds?: { width: number; height: number }
  ): { width: number; height: number } | undefined {
    if (!parent) {
      if (!viewportBounds) return undefined;
      return {
        width: viewportBounds.width * 0.9,
        height: viewportBounds.height * 0.9
      };
    }

    return {
      width: viewportBounds ? Math.min(parent.width, viewportBounds.width * 0.9) : parent.width,
      height: viewportBounds ? Math.min(parent.height, viewportBounds.height * 0.9) : parent.height
    };
  }

  private deepClone<T>(value: T): T {
    const globalStructuredClone = (globalThis as unknown as { structuredClone?: <Q>(input: Q) => Q }).structuredClone;
    if (typeof globalStructuredClone === 'function') {
      return globalStructuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }
}
