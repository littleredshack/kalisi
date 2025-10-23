import { HierarchicalNode, Edge } from '../../canvas/types';

/**
 * Helper functions for flat mode layout
 *
 * Flattens hierarchical containment structures into independent nodes at root level
 * and generates CONTAINS edges to represent the original hierarchy.
 */

export interface FlatLayoutResult {
  /** All nodes flattened to root level with empty children arrays */
  readonly nodes: HierarchicalNode[];
  /** Generated CONTAINS edges representing original parent-child relationships */
  readonly containsEdges: Edge[];
}

export interface FlatLayoutMetrics {
  readonly gap: number;
  readonly padding: number;
}

/**
 * Flatten hierarchy and generate CONTAINS edges
 */
export function flattenHierarchyWithEdges(
  hierarchyRoots: HierarchicalNode[],
  hiddenByCollapse: Set<string>
): FlatLayoutResult {
  const flatNodes: HierarchicalNode[] = [];
  const containsEdges: Edge[] = [];

  const flatten = (node: HierarchicalNode, parent: HierarchicalNode | null) => {
    const guid = node.GUID ?? node.id;
    if ((guid && hiddenByCollapse.has(guid)) || node.metadata?.['hiddenByCollapse']) {
      return;
    }

    // Create flattened clone with empty children
    const clone: HierarchicalNode = {
      id: node.id,
      GUID: node.GUID,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      text: node.text,
      children: [], // MUST be empty - all nodes at root level
      style: node.style ? { ...node.style } : node.style,
      metadata: node.metadata ? { ...node.metadata } : undefined,
      selected: node.selected,
      visible: node.visible,
      collapsed: node.collapsed,
      dragging: node.dragging
    };

    flatNodes.push(clone);

    // Generate CONTAINS edge from parent to this node
    if (parent) {
      const parentGUID = parent.GUID ?? parent.id;
      const childGUID = clone.GUID ?? clone.id;

      if (parentGUID && childGUID) {
        containsEdges.push({
          id: `contains-${parentGUID}-${childGUID}`,
          from: parentGUID,
          to: childGUID,
          fromGUID: parentGUID,
          toGUID: childGUID,
          label: 'CONTAINS',
          style: {
            stroke: '#6b7280',
            strokeWidth: 2,
            strokeDashArray: [5, 5]
          },
          metadata: {
            relationType: 'CONTAINS',
            isGenerated: true
          }
        });
      }
    }

    // Recursively flatten children (passing node as parent, not clone)
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => flatten(child, node));
    }
  };

  // Start flattening from roots
  hierarchyRoots.forEach(root => flatten(root, null));

  return { nodes: flatNodes, containsEdges };
}

/**
 * Apply uniform grid layout to flat list of nodes
 */
export function applyFlatGridLayout(
  nodes: HierarchicalNode[],
  metrics: FlatLayoutMetrics
): void {
  if (nodes.length === 0) {
    return;
  }

  const { gap, padding } = metrics;

  // Calculate grid dimensions
  const nodeCount = nodes.length;
  const cols = Math.ceil(Math.sqrt(nodeCount));

  // Find max node dimensions for uniform grid
  let maxWidth = 0;
  let maxHeight = 0;
  nodes.forEach(node => {
    maxWidth = Math.max(maxWidth, node.width);
    maxHeight = Math.max(maxHeight, node.height);
  });

  const cellWidth = maxWidth + gap;
  const cellHeight = maxHeight + gap;

  // Position nodes in grid
  nodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);

    node.x = padding + col * cellWidth;
    node.y = padding + row * cellHeight;
  });
}

/**
 * Update node metadata with absolute world positions (for flat mode)
 */
export function setAbsoluteWorldPositions(nodes: HierarchicalNode[]): void {
  nodes.forEach(node => {
    node.metadata = {
      ...(node.metadata ?? {}),
      worldPosition: { x: node.x, y: node.y },
      displayMode: 'runtime-flat'
    };
  });
}
