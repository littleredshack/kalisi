import { LayoutEngine, LayoutGraph, LayoutOptions, LayoutResult, RawDataInput } from '../core/layout-contract';
import { buildRuntimeGraphSnapshot, runtimeSnapshotToLayoutGraph } from '../utils/runtime-graph-normalizer';
import { layoutGraphToHierarchical, hierarchicalToLayoutGraph } from '../core/layout-graph-utils';
import { HierarchicalNode, Edge } from '../../canvas/types';
import { LayoutPrimitives } from '../../canvas/layout-primitives';

interface ContainmentMetrics {
  readonly padding: number;
  readonly gap: number;
}

const DEFAULT_PADDING = 48;
const DEFAULT_GAP = 24;

// Containment edge types should NOT be rendered as lines - they define the hierarchy instead
const CONTAINMENT_EDGE_TYPES = new Set(['CONTAINS', 'HAS_CHILD', 'HAS_COMPONENT', 'PARENT_OF']);

export class ContainmentRuntimeLayoutEngine implements LayoutEngine {
  readonly name = 'containment-runtime';

  readonly capabilities = {
    supportsIncremental: true,
    deterministic: true,
    canHandleRealtime: true
  } as const;

  layout(graph: LayoutGraph, options: LayoutOptions): LayoutResult {
    const snapshot = layoutGraphToHierarchical(graph);

    // Log the hierarchical snapshot structure
    console.log('[ContainmentRuntime] Hierarchical snapshot:');
    console.log('  Root nodes:', snapshot.nodes.length);
    snapshot.nodes.forEach(root => {
      console.log(`  Root: ${root.GUID} (${root.text})`);
      console.log(`    Position: (${root.x}, ${root.y})`);
      console.log(`    Children:`, root.children.length);
      root.children.forEach(child => {
        console.log(`      Child: ${child.GUID} (${child.text})`);
        console.log(`        Position: (${child.x}, ${child.y})`);
        console.log(`        Children:`, child.children.length);
        child.children.forEach(grandchild => {
          console.log(`          Grandchild: ${grandchild.GUID} (${grandchild.text})`);
        });
      });
    });

    const layoutMetrics: ContainmentMetrics = {
      padding: DEFAULT_PADDING,
      gap: DEFAULT_GAP
    };

    const processedNodes = snapshot.nodes.map(node => this.layoutContainer(node, layoutMetrics));
    processedNodes.forEach(root => this.updateWorldMetadata(root));

    // Filter out containment edges - they're represented by visual hierarchy, not lines
    const nonContainmentEdges = snapshot.edges.filter(edge => {
      const edgeType = (edge.metadata?.['relationType'] as string)?.toUpperCase() || '';
      return !CONTAINMENT_EDGE_TYPES.has(edgeType);
    });

    const routedEdges = this.computeEdgeWaypoints(processedNodes, nonContainmentEdges);

    const updatedGraph = hierarchicalToLayoutGraph({
      nodes: processedNodes,
      edges: routedEdges,
      metadata: {
        ...snapshot.metadata,
        layoutVersion: (graph.metadata.layoutVersion ?? 0) + 1,
        displayMode: 'containment-runtime'
      }
    });

    const diagnosticMetrics: Record<string, number> = {
      nodeCount: processedNodes.length,
      edgeCount: routedEdges.length
    };
    if (typeof options.timestamp === 'number') {
      diagnosticMetrics['runtimeMs'] = Math.max(0, Date.now() - options.timestamp);
    }

    // Log final output structure
    console.log('[ContainmentRuntime] Final LayoutGraph returned:');
    console.log('  Root IDs:', updatedGraph.metadata.rootIds);
    console.log('  Total nodes in graph:', Object.keys(updatedGraph.nodes).length);
    console.log('  Total edges in graph:', Object.keys(updatedGraph.edges).length);
    console.log('  Nodes with children:');
    Object.entries(updatedGraph.nodes).forEach(([id, node]) => {
      if (node.children.length > 0) {
        console.log(`    ${id} has children:`, node.children);
      }
    });

    return {
      graph: updatedGraph,
      diagnostics: {
        metrics: diagnosticMetrics
      }
    };
  }

  processRawData(input: RawDataInput): LayoutGraph {
    const runtimeSnapshot = buildRuntimeGraphSnapshot(input);
    return runtimeSnapshotToLayoutGraph(runtimeSnapshot);
  }

  private layoutContainer(node: HierarchicalNode, metrics: ContainmentMetrics): HierarchicalNode {
    const clone = this.ensureDefaults(this.cloneNode(node));
    if (!clone.children || clone.children.length === 0) {
      return clone;
    }

    const children = clone.children ?? [];
    const laidOutChildren = children.map(child => this.layoutContainer(child, metrics));

    this.applyWorldRelativePositions(clone, laidOutChildren);

    // Check if children have explicit positions
    // If all children are at the same position, they need auto-layout
    const allSamePosition = laidOutChildren.length > 1 && laidOutChildren.every((child, _, arr) =>
      child.x === arr[0].x && child.y === arr[0].y
    );

    const childrenHaveExplicitPositions = !allSamePosition && laidOutChildren.every(child =>
      Number.isFinite(child.x) && Number.isFinite(child.y)
    );

    console.log(`[ContainmentRuntime] layoutContainer for ${clone.GUID}: childrenHaveExplicitPositions=${childrenHaveExplicitPositions}`);
    if (childrenHaveExplicitPositions) {
      console.log(`[ContainmentRuntime]   Using world-relative positions for ${laidOutChildren.length} children`);
      laidOutChildren.forEach(child => {
        console.log(`[ContainmentRuntime]     ${child.GUID}: (${child.x}, ${child.y})`);
      });
    }

    if (!childrenHaveExplicitPositions) {
      console.log(`[ContainmentRuntime]   Applying adaptive grid for ${laidOutChildren.length} children`);
      this.applyAdaptiveGrid(clone, laidOutChildren, metrics);
      laidOutChildren.forEach(child => {
        console.log(`[ContainmentRuntime]     ${child.GUID}: (${child.x}, ${child.y}) after grid`);
      });
      // Adaptive grid already positioned children and resized parent - no clamping needed
    } else {
      // Only clamp when using explicit positions (manually placed by user)
      console.log(`[ContainmentRuntime]   Before clampChildrenToParent:`);
      laidOutChildren.forEach(child => {
        console.log(`[ContainmentRuntime]     ${child.GUID}: (${child.x}, ${child.y})`);
      });

      this.clampChildrenToParent(clone, laidOutChildren, metrics);

      console.log(`[ContainmentRuntime]   After clampChildrenToParent:`);
      laidOutChildren.forEach(child => {
        console.log(`[ContainmentRuntime]     ${child.GUID}: (${child.x}, ${child.y})`);
      });
    }

    clone.children = laidOutChildren;
    LayoutPrimitives.resizeToFitChildren(clone, metrics.padding, metrics.padding);

    return clone;
  }

  private ensureDefaults(node: HierarchicalNode): HierarchicalNode {
    const defaults = LayoutPrimitives.getMinimumNodeSize(node.type);
    node.width = Number.isFinite(node.width) ? node.width : defaults.width;
    node.height = Number.isFinite(node.height) ? node.height : defaults.height;
    node.metadata = {
      ...(node.metadata ?? {}),
      defaultWidth: node.width,
      defaultHeight: node.height,
      displayMode: 'containment-runtime'
    };
    return node;
  }

  private applyAdaptiveGrid(parent: HierarchicalNode, children: HierarchicalNode[], metrics: ContainmentMetrics): void {
    console.log(`[ContainmentRuntime] applyAdaptiveGrid START for parent ${parent.GUID}`);
    console.log(`[ContainmentRuntime]   Parent width: ${parent.width}, children count: ${children.length}`);

    if (children.length === 0) {
      return;
    }

    const interiorWidth = Math.max(parent.width ?? 0, 256);
    const padding = metrics.padding;
    const gap = metrics.gap;

    console.log(`[ContainmentRuntime]   Interior width: ${interiorWidth}, padding: ${padding}, gap: ${gap}`);

    const rankedChildren = [...children];

    const availableWidth = Math.max(interiorWidth - padding * 2, 120);
    console.log(`[ContainmentRuntime]   Available width for children: ${availableWidth}`);

    let currentRow: HierarchicalNode[] = [];
    const rows: HierarchicalNode[][] = [];
    let rowWidth = 0;

    rankedChildren.forEach(child => {
      const childWidth = Math.min(child.width ?? 200, availableWidth);
      const requiredWidth = currentRow.length === 0 ? childWidth : rowWidth + gap + childWidth;
      console.log(`[ContainmentRuntime]   Child ${child.GUID}: width=${childWidth}, requiredWidth=${requiredWidth}, availableWidth=${availableWidth}`);

      if (requiredWidth > availableWidth) {
        if (currentRow.length > 0) {
          console.log(`[ContainmentRuntime]     Starting new row (required ${requiredWidth} > available ${availableWidth})`);
          rows.push(currentRow);
        }
        currentRow = [child];
        rowWidth = childWidth;
      } else {
        console.log(`[ContainmentRuntime]     Adding to current row (required ${requiredWidth} <= available ${availableWidth})`);
        currentRow.push(child);
        rowWidth = requiredWidth;
      }
    });

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    console.log(`[ContainmentRuntime]   Total rows created: ${rows.length}`);
    rows.forEach((row, i) => {
      console.log(`[ContainmentRuntime]     Row ${i}: ${row.length} children (${row.map(c => c.GUID).join(', ')})`);
    });

    let y = padding;
    let rowHeight = 0;
    rows.forEach((row, rowIndex) => {
      const totalWidth = row.reduce((acc, child, index) => {
        const childWidth = Math.min(child.width ?? 200, availableWidth);
        return acc + childWidth + (index === row.length - 1 ? 0 : gap);
      }, 0);

      let x = padding + Math.max(0, (availableWidth - totalWidth) / 2);
      rowHeight = 0;

      console.log(`[ContainmentRuntime]   Row ${rowIndex}: totalWidth=${totalWidth}, starting x=${x}, starting y=${y}`);

      row.forEach(child => {
        child.width = Math.min(child.width ?? 200, availableWidth);
        child.x = Math.round(x);
        child.y = Math.round(y);
        console.log(`[ContainmentRuntime]     Assigning ${child.GUID}: x=${child.x}, y=${child.y}, width=${child.width}, height=${child.height}`);
        rowHeight = Math.max(rowHeight, child.height ?? 0);
        x += child.width + gap;
      });

      console.log(`[ContainmentRuntime]   Row ${rowIndex} complete: rowHeight=${rowHeight}, next y will be ${y + rowHeight + gap}`);
      y += rowHeight + gap;
    });

    console.log(`[ContainmentRuntime] applyAdaptiveGrid END`);
    LayoutPrimitives.resizeToFitChildren(parent, padding, padding);
  }

  private clampChildrenToParent(parent: HierarchicalNode, children: HierarchicalNode[], metrics: ContainmentMetrics): void {
    if (!children || children.length === 0) {
      return;
    }
    const headerOffset = LayoutPrimitives.computeHeaderOffset(parent);
    children.forEach(child => {
      LayoutPrimitives.clampChildWithinParent(child, parent, metrics.padding, headerOffset);
    });
  }

  private applyWorldRelativePositions(parent: HierarchicalNode, children: HierarchicalNode[]): void {
    if (!children || children.length === 0) {
      return;
    }
    const parentWorld = this.readWorldPosition(parent) ?? { x: parent.x ?? 0, y: parent.y ?? 0 };
    children.forEach(child => {
      const childWorld = this.readWorldPosition(child);
      if (childWorld) {
        child.x = childWorld.x - parentWorld.x;
        child.y = childWorld.y - parentWorld.y;
      } else {
        child.x = Number.isFinite(child.x) ? child.x : 0;
        child.y = Number.isFinite(child.y) ? child.y : 0;
      }
    });
  }

  private readWorldPosition(node: HierarchicalNode): { x: number; y: number } | null {
    const metadata = node.metadata;
    if (metadata && typeof metadata['worldPosition'] === 'object') {
      const value = metadata['worldPosition'] as { x?: number; y?: number };
      const x = Number((value?.x ?? Number.NaN));
      const y = Number((value?.y ?? Number.NaN));
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x, y };
      }
    }
    return null;
  }

  private computeEdgeWaypoints(nodes: HierarchicalNode[], edges: Edge[]): Edge[] {
    if (!edges || edges.length === 0) {
      return edges;
    }

    const nodeMap = new Map<string, HierarchicalNode>();
    const worldPositions = new Map<string, { x: number; y: number }>();

    const collect = (node: HierarchicalNode, offsetX = 0, offsetY = 0) => {
      const worldX = offsetX + (node.x ?? 0);
      const worldY = offsetY + (node.y ?? 0);
      nodeMap.set(node.GUID ?? node.id, node);
      worldPositions.set(node.GUID ?? node.id, { x: worldX, y: worldY });
      node.children?.forEach(child => collect(child, worldX, worldY));
    };
    nodes.forEach(root => collect(root));

    return edges.map(edge => {
      const fromNode = nodeMap.get(edge.fromGUID ?? edge.from);
      const toNode = nodeMap.get(edge.toGUID ?? edge.to);

      if (!fromNode || !toNode) {
        return edge;
      }

      const fromWorld = worldPositions.get(fromNode.GUID ?? fromNode.id) ?? { x: 0, y: 0 };
      const toWorld = worldPositions.get(toNode.GUID ?? toNode.id) ?? { x: 0, y: 0 };
      const fromCenter = {
        x: fromWorld.x + (fromNode.width ?? 0) / 2,
        y: fromWorld.y + (fromNode.height ?? 0) / 2
      };

      const toCenter = {
        x: toWorld.x + (toNode.width ?? 0) / 2,
        y: toWorld.y + (toNode.height ?? 0) / 2
      };

      const gridOffset = 24;
      const waypoints = [
        { x: fromCenter.x, y: fromCenter.y },
        { x: fromCenter.x, y: toCenter.y - gridOffset },
        { x: toCenter.x, y: toCenter.y - gridOffset },
        { x: toCenter.x, y: toCenter.y }
      ];

      return {
        ...edge,
        waypoints
      };
    });
  }

  private updateWorldMetadata(node: HierarchicalNode, parentWorld?: { x: number; y: number }): void {
    const parentX = parentWorld?.x ?? 0;
    const parentY = parentWorld?.y ?? 0;
    const localX = Number(node.x ?? 0);
    const localY = Number(node.y ?? 0);
    const worldX = parentX + localX;
    const worldY = parentY + localY;
    node.metadata = {
      ...(node.metadata ?? {}),
      worldPosition: { x: worldX, y: worldY }
    };
    node.children?.forEach(child => this.updateWorldMetadata(child, { x: worldX, y: worldY }));
  }

  private cloneNode(node: HierarchicalNode): HierarchicalNode {
    return {
      ...node,
      style: node.style ? { ...node.style } : node.style,
      metadata: node.metadata ? { ...node.metadata } : undefined,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : []
    };
  }
}
