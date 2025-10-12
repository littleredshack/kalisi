import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult } from '../core/layout-contract';
import { layoutGraphToHierarchical, hierarchicalToLayoutGraph } from '../core/layout-graph-utils';
import { HierarchicalNode, Camera } from '../../canvas/types';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;
const COLLAPSED_HEIGHT = 64;
const HORIZONTAL_INDENT = 12;
const VERTICAL_GAP = 24;
const HORIZONTAL_PADDING = 24;

export class TreeLayoutEngine implements LayoutEngine {
  readonly name = 'tree';

  readonly capabilities = {
    supportsIncremental: false,
    deterministic: true,
    canHandleRealtime: false
  } as const;

  layout(graph: LayoutGraph, options: LayoutOptions): LayoutResult {
    const snapshot = layoutGraphToHierarchical(graph);
    const roots = snapshot.nodes.map(node => this.cloneNode(node));

    roots.forEach(root => {
      this.initialiseCollapseState(root, true);
      this.positionTree(root, 0, 0);
    });

    roots.forEach(root => {
      this.convertAbsoluteToRelative(root, 0, 0);
    });

    const updatedGraph = hierarchicalToLayoutGraph({
      nodes: roots,
      edges: snapshot.edges,
      metadata: snapshot.metadata
    });

    const camera: Camera | undefined = options.reason === 'initial' || options.reason === 'engine-switch'
      ? { x: 0, y: 0, zoom: 0.75 }
      : undefined;

    return {
      graph: updatedGraph,
      camera
    };
  }

  private cloneNode(node: HierarchicalNode): HierarchicalNode {
    return {
      ...node,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : [],
      metadata: node.metadata ? { ...node.metadata } : undefined,
      style: node.style ? { ...node.style } : node.style
    };
  }

  private initialiseCollapseState(node: HierarchicalNode, isRoot: boolean): void {
    if (node.children.length > 0) {
      node.collapsed = !isRoot;
      node.children.forEach(child => this.initialiseCollapseState(child, false));
    } else {
      node.collapsed = false;
    }
    node.metadata = {
      ...(node.metadata ?? {}),
      displayMode: 'tree',
      defaultWidth: NODE_WIDTH,
      defaultHeight: COLLAPSED_HEIGHT
    };
    node.width = NODE_WIDTH;
    node.height = node.collapsed ? COLLAPSED_HEIGHT : NODE_HEIGHT;
  }

  private positionTree(node: HierarchicalNode, currentY: number, indent: number): number {
    node.x = indent;
    node.y = currentY;

    if (node.children.length === 0 || node.collapsed) {
      return node.height;
    }

    let totalHeight = node.height + VERTICAL_GAP;
    let childTop = currentY + node.height + VERTICAL_GAP;
    let maxChildWidth = NODE_WIDTH;

    node.children.forEach((child, index) => {
      if (index > 0) {
        childTop += VERTICAL_GAP;
        totalHeight += VERTICAL_GAP;
      }
      const childHeight = this.positionTree(child, childTop, indent + HORIZONTAL_INDENT);
      totalHeight += childHeight;
      childTop += childHeight;
      maxChildWidth = Math.max(maxChildWidth, HORIZONTAL_INDENT + child.width + HORIZONTAL_PADDING);
    });

    node.width = Math.max(node.width, maxChildWidth);
    node.height = totalHeight;
    return totalHeight;
  }

  private convertAbsoluteToRelative(node: HierarchicalNode, parentX: number, parentY: number): void {
    const absX = node.x;
    const absY = node.y;
    node.x = absX - parentX;
    node.y = absY - parentY;
    node.children.forEach(child => this.convertAbsoluteToRelative(child, absX, absY));
  }
}
