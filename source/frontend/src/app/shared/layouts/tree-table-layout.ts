import { BaseLayoutEngine, LayoutResult } from '../canvas/layout';
import { HierarchicalNode, Camera } from '../canvas/types';
import { TreeTableColumn, TreeTableNode } from '../tree-table/tree-table.types';

interface TreeTableLayoutInput {
  columns: TreeTableColumn[];
  nodes: TreeTableNode[];
}

interface InternalTreeNode {
  row: TreeTableNode;
  node: HierarchicalNode;
}

export class TreeTableLayoutEngine extends BaseLayoutEngine {
  private rowHeight = 52;
  private rowGap = 6;
  private indent = 36;
  private viewportWidth = 1200;

  getName(): string {
    return 'TreeTableLayoutEngine';
  }

  setViewportBounds(bounds: { width: number; height: number }): void {
    this.viewportWidth = bounds.width;
  }

  applyLayout(entities: any[], _relationships: any[]): LayoutResult {
    const input = this.extractInput(entities);

    const hierarchy = this.buildHierarchy(input.nodes);
    const orderedNodes: HierarchicalNode[] = [];
    let rowIndex = 0;

    const assignPositions = (treeNode: InternalTreeNode, depth: number) => {
      const y = rowIndex * (this.rowHeight + this.rowGap);
      const x = depth * this.indent;

      treeNode.node.x = x;
      treeNode.node.y = y;
      treeNode.node.width = Math.max(this.viewportWidth - x, 200);
      treeNode.node.height = this.rowHeight;
      treeNode.node.metadata = {
        ...(treeNode.node.metadata || {}),
        depth,
        rowIndex,
        columns: input.columns,
        values: treeNode.row.values,
        aggregates: treeNode.row.aggregates,
        parentGuid: treeNode.row.parentGuid,
        batchId: treeNode.row.batchId
      };

      orderedNodes.push(treeNode.node);
      rowIndex += 1;

      treeNode.node.children.forEach(child => {
        const childInternal = hierarchy.childrenMap.get(child.GUID!);
        if (childInternal) {
          assignPositions(childInternal, depth + 1);
        }
      });
    };

    hierarchy.roots.forEach(root => assignPositions(root, root.row.depth ?? 0));

    const camera: Camera = {
      x: 0,
      y: 0,
      zoom: 1
    };

    const layoutNodes = hierarchy.roots.map(root => root.node);

    return {
      nodes: layoutNodes,
      camera
    };
  }

  private extractInput(entities: any[]): TreeTableLayoutInput {
    if (entities.length === 1 && entities[0]?.treeTableData) {
      return entities[0].treeTableData as TreeTableLayoutInput;
    }

    if ((entities as TreeTableNode[]).every(entity => entity.guid)) {
      return {
        columns: [],
        nodes: entities as TreeTableNode[]
      };
    }

    throw new Error('TreeTableLayoutEngine: invalid entities payload');
  }

  private buildHierarchy(rows: TreeTableNode[]) {
    const nodeLookup = new Map<string, InternalTreeNode>();
    const childrenMap = new Map<string, InternalTreeNode>();
    const roots: InternalTreeNode[] = [];

    const createNode = (row: TreeTableNode): InternalTreeNode => {
      const node: HierarchicalNode = {
        id: row.guid,
        GUID: row.guid,
        type: 'tree-table-row',
        text: row.label,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        style: {
          fill: 'rgba(27, 38, 53, 0.85)',
          stroke: 'rgba(80, 112, 160, 0.35)'
        },
        selected: false,
        visible: true,
        collapsed: false,
        dragging: false,
        children: [],
        metadata: {
          language: row.language,
          kind: row.kind
        }
      };

      const internal: InternalTreeNode = { row, node };
      nodeLookup.set(row.guid, internal);
      childrenMap.set(row.guid, internal);
      return internal;
    };

    rows.forEach(row => {
      const internal = nodeLookup.get(row.guid) ?? createNode(row);

      if (row.parentGuid) {
        const parentInternal = nodeLookup.get(row.parentGuid) ?? createNode({
          guid: row.parentGuid,
          parentGuid: null,
          label: row.parentGuid,
          kind: 'placeholder',
          depth: (row.depth ?? 0) - 1,
          language: undefined,
          values: {},
          aggregates: undefined,
          tags: [],
          metadataJson: undefined
        });

        if (!parentInternal.node.children.includes(internal.node)) {
          parentInternal.node.children.push(internal.node);
        }
      } else {
        roots.push(internal);
      }
    });

    // Ensure parent nodes are roots when appropriate
    rows.forEach(row => {
      if (!row.parentGuid) {
        const rootInternal = nodeLookup.get(row.guid);
        if (rootInternal && !roots.includes(rootInternal)) {
          roots.push(rootInternal);
        }
      }
    });

    // Sort roots according to original order
    const orderMap = new Map<string, number>();
    rows.forEach((row, index) => orderMap.set(row.guid, index));
    roots.sort((a, b) => (orderMap.get(a.row.guid)! - orderMap.get(b.row.guid)!));

    roots.forEach(root => {
      root.node.children.sort((a, b) => (orderMap.get(a.GUID!)! - orderMap.get(b.GUID!)!));
    });

    return { roots, nodeLookup, childrenMap };
  }
}
