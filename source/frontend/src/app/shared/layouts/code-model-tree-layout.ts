import { BaseLayoutEngine, ILayoutEngine, LayoutResult } from '../canvas/layout';
import { HierarchicalNode, Camera } from '../canvas/types';

interface EntityModel {
  id: string;
  name: string;
  properties?: Record<string, any>;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;
const HORIZONTAL_SPACING = 260;
const VERTICAL_SPACING = 110;

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
          displayMode: 'tree'
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
    });

    let nextY = 0;
    roots.forEach(root => {
      const subtreeHeight = this.assignAbsolutePositions(root, 0, nextY);
      nextY += Math.max(VERTICAL_SPACING, subtreeHeight);
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

  private assignAbsolutePositions(node: HierarchicalNode, depth: number, currentY: number): number {
    const absX = depth * HORIZONTAL_SPACING;
    (node as any).__absX = absX;

    if (!node.children.length) {
      (node as any).__absY = currentY;
      return VERTICAL_SPACING;
    }

    let accumulatedHeight = 0;
    node.children.forEach((child, index) => {
      const childOffset = currentY + accumulatedHeight;
      const childHeight = this.assignAbsolutePositions(child, depth + 1, childOffset);
      accumulatedHeight += childHeight;
    });

    const firstChild = node.children[0] as any;
    const lastChild = node.children[node.children.length - 1] as any;
    const midpoint = ((firstChild.__absY ?? currentY) + (lastChild.__absY ?? currentY)) / 2;
    (node as any).__absY = midpoint;

    return Math.max(VERTICAL_SPACING, accumulatedHeight);
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
