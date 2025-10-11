import { BaseLayoutEngine, ILayoutEngine, LayoutResult } from '../canvas/layout';
import { HierarchicalNode, Camera } from '../canvas/types';

interface EntityModel {
  id: string;
  name: string;
  properties?: Record<string, any>;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;
const HORIZONTAL_INDENT = 10;
const HORIZONTAL_PADDING = 20;
const VERTICAL_GAP = 20;
const COLLAPSED_NODE_HEIGHT = 64;

/**
 * Layout engine that arranges CodeElement nodes in a classic tree layout.
 * Each directory/file sits in its own row, children are indented, and
 * parent-child connectors are drawn by the tree renderer.
 */
export class CodeModelTreeLayoutEngine extends BaseLayoutEngine implements ILayoutEngine {
  getName(): string {
    return 'code-model-tree';
  }

  applyLayout(entities: EntityModel[], relationships: any[]): LayoutResult {
    const nodeMap = new Map<string, HierarchicalNode>();
    const roots: HierarchicalNode[] = [];

    entities.forEach(entity => {
      const props = entity.properties ?? {};
      const guid = (props['GUID'] ?? props['guid'] ?? entity.id ?? props['id']) as string | undefined;

      if (!guid) {
        return;
      }

      const kind: string = (props['kind'] as string) || 'Node';
      const name: string = (props['name'] as string) || entity.name || guid;
      const type = kind.toLowerCase();

      const node: HierarchicalNode = {
        id: guid,
        GUID: guid,
        type,
        text: name,
        x: 0,
        y: 0,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        style: this.getColourForKind(kind),
        children: [],
        selected: false,
        visible: true,
        collapsed: false,
        dragging: false,
        metadata: {
          kind,
          displayMode: 'tree',
          defaultWidth: NODE_WIDTH,
          defaultHeight: NODE_HEIGHT
        } as Record<string, any>
      };

      nodeMap.set(guid, node);
    });

    entities.forEach(entity => {
      const props = entity.properties ?? {};
      const guid = (props['GUID'] ?? props['guid'] ?? entity.id ?? props['id']) as string | undefined;
      if (!guid) {
        return;
      }
      const node = nodeMap.get(guid);
      if (!node) return;

      const parentGuid = (props['parent_guid'] ?? props['parentGUID'] ?? props['parentGuid']) as
        | string
        | undefined;

      if (parentGuid) {
        const parent = nodeMap.get(parentGuid);
        if (parent) {
          parent.children.push(node);
          return;
        }
      }

      roots.push(node);
    });

    roots.forEach(root => {
      this.sortChildrenRecursive(root);
      this.initialiseCollapseState(root, true);
    });

    let nextY = 0;
    roots.forEach(root => {
      const subtreeHeight = this.assignAbsolutePositions(root, nextY, 0);
      nextY += subtreeHeight + VERTICAL_GAP;
    });

    roots.forEach(root => {
      this.convertAbsoluteToRelative(root, 0, 0);
    });

    const camera: Camera = {
      x: 0,
      y: 0,
      zoom: 0.8
    };

    return {
      nodes: roots,
      camera
    };
  }

  private sortChildrenRecursive(node: HierarchicalNode): void {
    node.children.sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));
    node.children.forEach(child => this.sortChildrenRecursive(child));
  }

  private initialiseCollapseState(node: HierarchicalNode, isRoot: boolean): void {
    if (node.children.length > 0) {
      node.collapsed = !isRoot;
      node.children.forEach(child => this.initialiseCollapseState(child, false));
    }
  }

  private assignAbsolutePositions(node: HierarchicalNode, currentY: number, indent: number): number {
    const absX = indent;
    (node as any).__absX = absX;
    (node as any).__absY = currentY;

    const hasChildren = node.children.length > 0;
    const isCollapsed = hasChildren && node.collapsed;
    const nodeHeight = isCollapsed ? COLLAPSED_NODE_HEIGHT : NODE_HEIGHT;

    node.width = NODE_WIDTH;
    node.height = nodeHeight;

    if (!hasChildren || isCollapsed) {
      if (node.metadata) {
        node.metadata['defaultWidth'] = node.width;
        node.metadata['defaultHeight'] = nodeHeight;
      }
      return nodeHeight;
    }

    let totalHeight = nodeHeight;
    let childTop = currentY + nodeHeight + VERTICAL_GAP;
    totalHeight += VERTICAL_GAP;
    let maxChildExtent = NODE_WIDTH;

    node.children.forEach((child, index) => {
      if (index > 0) {
        childTop += VERTICAL_GAP;
        totalHeight += VERTICAL_GAP;
      }
      const childHeight = this.assignAbsolutePositions(child, childTop, indent + HORIZONTAL_INDENT);
      totalHeight += childHeight;
      childTop += childHeight;

      const childExtent = HORIZONTAL_INDENT + (child.width ?? NODE_WIDTH) + HORIZONTAL_PADDING;
      if (childExtent > maxChildExtent) {
        maxChildExtent = childExtent;
      }
    });

    node.width = Math.max(NODE_WIDTH, maxChildExtent);
    if (hasChildren) {
      totalHeight -= VERTICAL_GAP;
    }
    node.height = totalHeight;

    if (node.metadata) {
      node.metadata['defaultWidth'] = node.width;
      node.metadata['defaultHeight'] = COLLAPSED_NODE_HEIGHT;
    }
    return totalHeight;
  }

  private convertAbsoluteToRelative(node: HierarchicalNode, parentAbsX: number, parentAbsY: number): void {
    const absX = (node as any).__absX ?? 0;
    const absY = (node as any).__absY ?? 0;

    node.x = absX - parentAbsX;
    node.y = absY - parentAbsY;

    delete (node as any).__absX;
    delete (node as any).__absY;

    node.children.forEach(child => this.convertAbsoluteToRelative(child, absX, absY));
  }

  private getColourForKind(kind: string): { fill: string; stroke: string } {
    const normalized = kind.toLowerCase();
    if (normalized === 'directory' || normalized === 'workspace' || normalized === 'repository') {
      return { fill: '#1f2937', stroke: '#4b5563' };
    }
    if (normalized === 'file') {
      return { fill: '#22384f', stroke: '#5b7287' };
    }
    if (normalized === 'function' || normalized === 'method' || normalized === 'component') {
      return { fill: '#2d4f22', stroke: '#5b8729' };
    }
    return { fill: '#22384f', stroke: '#5b7287' };
  }
}
