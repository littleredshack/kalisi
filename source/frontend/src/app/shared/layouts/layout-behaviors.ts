import { HierarchicalNode } from '../canvas/types';

export interface LayoutBehavior {
  collapsedSize(node: HierarchicalNode): { width: number; height: number };
  expandedSize(node: HierarchicalNode): { width: number; height: number };
  allowsDynamicReflow(): boolean;
}

const TREE_BEHAVIOR: LayoutBehavior = {
  collapsedSize(node: HierarchicalNode) {
    return {
      width: getNumeric(node.metadata?.['defaultWidth'], node.width),
      height: getNumeric(node.metadata?.['defaultHeight'], node.height)
    };
  },
  expandedSize(node: HierarchicalNode) {
    return {
      width: getNumeric(node.metadata?.['defaultWidth'], node.width),
      height: getNumeric(node.metadata?.['defaultExpandedHeight'], node.height)
    };
  },
  allowsDynamicReflow() {
    return false;
  }
};

const GRID_BEHAVIOR: LayoutBehavior = {
  collapsedSize() {
    return { width: 80, height: 40 };
  },
  expandedSize(node: HierarchicalNode) {
    return {
      width: getNumeric(node.metadata?.['defaultWidth'], node.width),
      height: getNumeric(node.metadata?.['defaultHeight'], node.height)
    };
  },
  allowsDynamicReflow() {
    return true;
  }
};

export function getCollapsedSize(node: HierarchicalNode): { width: number; height: number } {
  return getBehavior(node).collapsedSize(node);
}

export function getExpandedSize(node: HierarchicalNode): { width: number; height: number } {
  return getBehavior(node).expandedSize(node);
}

export function allowsDynamicReflow(node: HierarchicalNode | null | undefined): boolean {
  return getBehavior(node).allowsDynamicReflow();
}

function getBehavior(node: HierarchicalNode | null | undefined): LayoutBehavior {
  const mode = node?.metadata?.['displayMode'];
  if (mode === 'tree') {
    return TREE_BEHAVIOR;
  }
  return GRID_BEHAVIOR;
}

function getNumeric(value: unknown, fallback: number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback;
  }
  return 0;
}
