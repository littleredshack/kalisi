import { Injectable, signal, computed } from '@angular/core';
import { TreeNode, ItemType } from '../models/view.models';

@Injectable({
  providedIn: 'root'
})
export class TreeStateService {
  // Tree structure and state
  private _nodes = signal<TreeNode[]>([]);
  private _selectedId = signal<string | null>(null);
  private _expandedIds = signal<Set<string>>(new Set());

  // Public read-only signals
  readonly nodes = this._nodes.asReadonly();
  readonly selectedId = this._selectedId.asReadonly();
  readonly selectedNode = computed(() => {
    const id = this._selectedId();
    return id ? this.findNodeById(id) : null;
  });

  // Initialize with mock data
  initializeMockData() {
    const mockNodes: TreeNode[] = [
      {
        id: 'products',
        label: 'Products',
        type: 'folder',
        icon: 'pi pi-folder',
        isExpanded: true,
        children: [
          {
            id: 'payment-systems',
            label: 'Payment Systems',
            type: 'product',
            icon: 'pi pi-credit-card',
            isLeaf: true
          },
          {
            id: 'risk-models',
            label: 'Risk Models', 
            type: 'product',
            icon: 'pi pi-shield',
            isLeaf: true
          }
        ]
      },
      {
        id: 'processes',
        label: 'Processes',
        type: 'folder',
        icon: 'pi pi-folder',
        isExpanded: false,
        children: [
          {
            id: 'loan-approval',
            label: 'Loan Approval',
            type: 'process',
            icon: 'pi pi-check-circle',
            isLeaf: true
          },
          {
            id: 'compliance-check',
            label: 'Compliance Check',
            type: 'process', 
            icon: 'pi pi-verified',
            isLeaf: true
          }
        ]
      },
      {
        id: 'systems',
        label: 'Systems',
        type: 'folder',
        icon: 'pi pi-folder',
        isExpanded: false,
        children: [
          {
            id: 'core-banking',
            label: 'Core Banking System',
            type: 'system',
            icon: 'pi pi-server',
            isLeaf: true
          },
          {
            id: 'fraud-detection',
            label: 'Fraud Detection',
            type: 'system',
            icon: 'pi pi-eye',
            isLeaf: true
          }
        ]
      },
      {
        id: 'controls',
        label: 'Controls',
        type: 'folder',
        icon: 'pi pi-folder',
        isExpanded: false,
        children: [
          {
            id: 'access-control',
            label: 'Access Control',
            type: 'control',
            icon: 'pi pi-lock',
            isLeaf: true
          }
        ]
      },
      {
        id: 'metrics',
        label: 'Metrics',
        type: 'folder',
        icon: 'pi pi-folder',
        isExpanded: false,
        children: [
          {
            id: 'performance-kpis',
            label: 'Performance KPIs',
            type: 'metric',
            icon: 'pi pi-chart-line',
            isLeaf: true
          }
        ]
      }
    ];

    this._nodes.set(mockNodes);
    
    // Initialize expanded state
    const expandedIds = new Set<string>();
    this.collectExpandedIds(mockNodes, expandedIds);
    this._expandedIds.set(expandedIds);
  }

  // Tree navigation methods
  selectNode(nodeId: string) {
    this._selectedId.set(nodeId);
  }

  toggleExpanded(nodeId: string) {
    const currentExpanded = this._expandedIds();
    const newExpanded = new Set(currentExpanded);
    
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    
    this._expandedIds.set(newExpanded);
    
    // Update the node's expanded state
    this.updateNodeExpanded(nodeId, newExpanded.has(nodeId));
  }

  isExpanded(nodeId: string): boolean {
    return this._expandedIds().has(nodeId);
  }

  // Helper methods
  private findNodeById(nodeId: string): TreeNode | null {
    const nodes = this._nodes();
    return this.searchNodes(nodes, nodeId);
  }

  private searchNodes(nodes: TreeNode[], targetId: string): TreeNode | null {
    for (const node of nodes) {
      if (node.id === targetId) {
        return node;
      }
      if (node.children) {
        const found = this.searchNodes(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  private collectExpandedIds(nodes: TreeNode[], expandedSet: Set<string>) {
    nodes.forEach(node => {
      if (node.isExpanded) {
        expandedSet.add(node.id);
      }
      if (node.children) {
        this.collectExpandedIds(node.children, expandedSet);
      }
    });
  }

  private updateNodeExpanded(nodeId: string, expanded: boolean) {
    const currentNodes = this._nodes();
    const updatedNodes = this.updateNodeInTree(currentNodes, nodeId, { isExpanded: expanded });
    this._nodes.set(updatedNodes);
  }

  private updateNodeInTree(nodes: TreeNode[], targetId: string, updates: Partial<TreeNode>): TreeNode[] {
    return nodes.map(node => {
      if (node.id === targetId) {
        return { ...node, ...updates };
      }
      if (node.children) {
        return {
          ...node,
          children: this.updateNodeInTree(node.children, targetId, updates)
        };
      }
      return node;
    });
  }

  // Export state for persistence
  exportState() {
    return {
      nodes: this._nodes(),
      selectedId: this._selectedId(),
      expandedIds: Array.from(this._expandedIds())
    };
  }

  // Import state from persistence
  importState(state: { nodes: TreeNode[], selectedId: string | null, expandedIds: string[] }) {
    this._nodes.set(state.nodes);
    this._selectedId.set(state.selectedId);
    this._expandedIds.set(new Set(state.expandedIds));
  }
}