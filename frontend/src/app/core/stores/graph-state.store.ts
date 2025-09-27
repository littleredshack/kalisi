import { Injectable, computed, signal } from '@angular/core';

// Domain data types (facts from Neo4j)
export interface DomainNode {
  id: string;
  type: string;
  labels?: string[];
  properties?: Record<string, any>;
  // Business logic properties only - no visual data
}

export interface DomainEdge {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  properties?: Record<string, any>;
  // Relationship facts only - no visual data
}

// View data types (visual layout/UI state)
export interface ViewNode {
  id: string; // Same as domainNodeId for simplicity
  domainNodeId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  style: {
    fill: string;
    stroke: string;
    icon?: string;
  };
  parentId?: string; // For hierarchical layout
  collapsed?: boolean;
  hidden?: boolean;
  visible?: boolean;
  selected?: boolean;
  dragging?: boolean;
  zIndex?: number;
}

export interface ViewEdge {
  id: string;
  domainEdgeId?: string; // Optional reference to domain edge
  sourceId: string; // Domain node ID
  targetId: string; // Domain node ID
  label: string;
  style: {
    stroke: string;
    strokeWidth: number;
    strokeDashArray?: number[] | null;
  };
  waypoints?: { x: number; y: number }[];
}

// State interfaces
export interface DomainState {
  nodes: Record<string, DomainNode>;
  edges: Record<string, DomainEdge>;
  version: number;
}

export interface ViewState {
  viewId: string;
  viewName: string;
  nodes: Record<string, ViewNode>;
  edges: Record<string, ViewEdge>;
  camera?: { x: number; y: number; zoom: number };
  version: number;
}

export interface AppState {
  domain: DomainState;
  view: ViewState;
}

@Injectable({
  providedIn: 'root'
})
export class GraphStateStore {
  // Private signals for state management
  private _domainState = signal<DomainState>({
    nodes: {},
    edges: {},
    version: 0
  });

  private _viewState = signal<ViewState>({
    viewId: 'default-view',
    viewName: 'Default View',
    nodes: {},
    edges: {},
    camera: { x: 0, y: 0, zoom: 1.0 },
    version: 0
  });

  // PUBLIC SELECTORS (read-only)
  domainState = this._domainState.asReadonly();
  viewState = this._viewState.asReadonly();
  
  // Computed selectors with change tracking
  renderNodes = computed(() => {
    const domain = this._domainState();
    const view = this._viewState();
    
    console.log(`📊 renderNodes computed triggered (view version: ${view.version})`);
    
    // Merge domain data with view data for rendering
    const result = this.mergeNodesForRendering(domain.nodes, view.nodes);
    console.log(`   Result: ${result.length} root nodes (hierarchical structure)`);
    return result;
  });

  renderEdges = computed(() => {
    const domain = this._domainState();
    const view = this._viewState();
    
    console.log(`🔗 renderEdges computed triggered (view version: ${view.version})`);
    
    // Compute edges with inheritance for folded nodes
    const result = this.computeEdgesWithInheritance(domain.edges, view.nodes, view.edges);
    console.log(`   Result: ${result.length} edges`);
    return result;
  });

  // COMMANDS (only way to change state)
  
  // Domain commands
  setDomainData(nodes: Record<string, DomainNode>, edges: Record<string, DomainEdge>): void {
    const currentState = this._domainState();
    this._domainState.set({
      nodes,
      edges,
      version: currentState.version + 1
    });
  }

  // MIGRATION HELPER: Convert existing CanvasData to Domain+View separation
  loadLegacyData(legacyData: any): void {
    const { domainNodes, domainEdges, viewNodes, viewEdges } = this.convertLegacyData(legacyData);
    
    this._domainState.set({
      nodes: domainNodes,
      edges: domainEdges,
      version: 1
    });

    this._viewState.set({
      viewId: 'legacy-view',
      viewName: 'Converted View',
      nodes: viewNodes,
      edges: viewEdges,
      camera: legacyData.camera || { x: 0, y: 0, zoom: 1.0 },
      version: 1
    });
  }

  private convertLegacyData(legacyData: any): {
    domainNodes: Record<string, DomainNode>,
    domainEdges: Record<string, DomainEdge>,
    viewNodes: Record<string, ViewNode>,
    viewEdges: Record<string, ViewEdge>
  } {
    const domainNodes: Record<string, DomainNode> = {};
    const domainEdges: Record<string, DomainEdge> = {};
    const viewNodes: Record<string, ViewNode> = {};
    const viewEdges: Record<string, ViewEdge> = {};

    // Convert nodes (recursive for hierarchy)
    const convertNode = (node: any, parentId?: string) => {
      // Domain node (facts)
      domainNodes[node.id] = {
        id: node.id,
        type: node.type,
        properties: { text: node.text }
      };

      // View node (visual layout)
      viewNodes[node.id] = {
        id: node.id,
        domainNodeId: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        text: node.text,
        style: node.style,
        parentId,
        collapsed: node.collapsed || false,
        visible: node.visible !== false,
        selected: node.selected || false,
        dragging: node.dragging || false
      };

      // Recursively convert children
      if (node.children) {
        node.children.forEach((child: any) => convertNode(child, node.id));
      }
    };

    // Convert all nodes
    if (legacyData.nodes) {
      legacyData.nodes.forEach((node: any) => convertNode(node));
    }

    // Convert edges
    if (legacyData.edges) {
      legacyData.edges.forEach((edge: any) => {
        // Domain edge (relationship fact)
        domainEdges[edge.id] = {
          id: edge.id,
          type: 'connects',
          sourceId: edge.from,
          targetId: edge.to,
          properties: { label: edge.label }
        };

        // View edge (visual representation)
        viewEdges[edge.id] = {
          id: edge.id,
          domainEdgeId: edge.id,
          sourceId: edge.from,
          targetId: edge.to,
          label: edge.label,
          style: edge.style
        };
      });
    }

    return { domainNodes, domainEdges, viewNodes, viewEdges };
  }

  // View commands
  setViewData(viewId: string, nodes: Record<string, ViewNode>, edges: Record<string, ViewEdge>): void {
    const currentState = this._viewState();
    this._viewState.set({
      ...currentState,
      viewId,
      nodes,
      edges,
      version: currentState.version + 1
    });
  }

  updateViewNode(nodeId: string, updates: Partial<ViewNode>): void {
    const currentState = this._viewState();
    const existingNode = currentState.nodes[nodeId];
    if (!existingNode) return;

    this._viewState.set({
      ...currentState,
      nodes: {
        ...currentState.nodes,
        [nodeId]: { ...existingNode, ...updates }
      },
      version: currentState.version + 1
    });
  }

  foldNode(nodeId: string): void {
    this.updateViewNode(nodeId, { collapsed: true });
    this.hideDescendants(nodeId);
  }

  unfoldNode(nodeId: string): void {
    this.updateViewNode(nodeId, { collapsed: false });
    this.restoreDescendants(nodeId);
  }

  setCamera(camera: { x: number; y: number; zoom: number }): void {
    const currentState = this._viewState();
    this._viewState.set({
      ...currentState,
      camera,
      version: currentState.version + 1
    });
  }

  // PRIVATE HELPERS

  private mergeNodesForRendering(domainNodes: Record<string, DomainNode>, viewNodes: Record<string, ViewNode>): any {
    // Convert flat ViewNode structure back to hierarchical structure for engine
    const hierarchicalNodes: any[] = [];
    
    // Find root nodes (no parentId)
    const rootNodes = Object.values(viewNodes).filter(n => !n.parentId && (n.visible !== false));
    
    const buildHierarchical = (viewNode: ViewNode): any => {
      const domainNode = domainNodes[viewNode.domainNodeId];
      if (!domainNode) return null;
      
      // Find children - include them even if parent is collapsed (engine handles visibility)
      const children = Object.values(viewNodes)
        .filter(n => n.parentId === viewNode.id)
        .map(child => buildHierarchical(child))
        .filter(child => child !== null);
      
      return {
        id: viewNode.id,
        type: domainNode.type,
        x: viewNode.x,
        y: viewNode.y,
        width: viewNode.width,
        height: viewNode.height,
        text: viewNode.text,
        style: viewNode.style,
        children: children,
        selected: viewNode.selected || false,
        visible: viewNode.visible !== false,
        collapsed: viewNode.collapsed || false,
        dragging: viewNode.dragging || false
      };
    };
    
    rootNodes.forEach(rootNode => {
      const hierarchical = buildHierarchical(rootNode);
      if (hierarchical) {
        hierarchicalNodes.push(hierarchical);
      }
    });
    
    return hierarchicalNodes;
  }

  private computeEdgesWithInheritance(domainEdges: Record<string, DomainEdge>, viewNodes: Record<string, ViewNode>, viewEdges: Record<string, ViewEdge>): ViewEdge[] {
    const baseEdges = Object.values(viewEdges);
    const inheritedEdges: ViewEdge[] = [];
    
    // Build complete visibility map considering all collapsed states
    const visibilityMap = this.buildNodeVisibilityMap(viewNodes);
    
    // For each original edge, determine its final representation
    baseEdges.forEach(edge => {
      const sourceVisibility = visibilityMap[edge.sourceId];
      const targetVisibility = visibilityMap[edge.targetId];
      
      if (sourceVisibility.isVisible && targetVisibility.isVisible) {
        // Both endpoints visible - show original edge
        inheritedEdges.push(edge);
      } else if (!sourceVisibility.isVisible || !targetVisibility.isVisible) {
        // One or both endpoints hidden - create inherited edge to visible ancestor
        const finalSourceId = sourceVisibility.isVisible ? edge.sourceId : sourceVisibility.visibleAncestor!;
        const finalTargetId = targetVisibility.isVisible ? edge.targetId : targetVisibility.visibleAncestor!;
        
        // Only create inherited edge if both final endpoints exist and are different
        if (finalSourceId && finalTargetId && finalSourceId !== finalTargetId) {
          inheritedEdges.push({
            ...edge,
            id: `inherited-${edge.id}`,
            sourceId: finalSourceId,
            targetId: finalTargetId,
            style: {
              ...edge.style,
              stroke: '#1e3a8a', // Darker blue for inherited
              strokeWidth: Math.min(6, edge.style.strokeWidth + 1),
              strokeDashArray: [4, 4] // Dashed
            }
          });
        }
      }
    });

    return inheritedEdges;
  }
  
  private buildNodeVisibilityMap(viewNodes: Record<string, ViewNode>): Record<string, {isVisible: boolean, visibleAncestor?: string}> {
    const visibilityMap: Record<string, {isVisible: boolean, visibleAncestor?: string}> = {};
    
    // First pass: determine which nodes are actually visible
    Object.values(viewNodes).forEach(node => {
      const isVisible = node.visible !== false && this.hasVisiblePath(node.id, viewNodes);
      visibilityMap[node.id] = { isVisible };
    });
    
    // Second pass: find visible ancestors for hidden nodes
    Object.values(viewNodes).forEach(node => {
      if (!visibilityMap[node.id].isVisible) {
        visibilityMap[node.id].visibleAncestor = this.findVisibleAncestor(node.id, viewNodes, visibilityMap);
      }
    });
    
    return visibilityMap;
  }
  
  private hasVisiblePath(nodeId: string, viewNodes: Record<string, ViewNode>): boolean {
    const node = viewNodes[nodeId];
    if (!node) return false;
    if (node.visible === false) return false;
    
    // Check if any parent is collapsed (which would hide this node)
    let current = node;
    while (current.parentId) {
      const parent = viewNodes[current.parentId];
      if (!parent) break;
      if (parent.collapsed) return false; // Parent is collapsed, so this node is hidden
      if (parent.visible === false) return false;
      current = parent;
    }
    
    return true;
  }
  
  private findVisibleAncestor(nodeId: string, viewNodes: Record<string, ViewNode>, visibilityMap: Record<string, {isVisible: boolean, visibleAncestor?: string}>): string | undefined {
    const node = viewNodes[nodeId];
    if (!node || !node.parentId) return undefined;
    
    const parent = viewNodes[node.parentId];
    if (!parent) return undefined;
    
    if (visibilityMap[parent.id]?.isVisible) {
      return parent.id;
    }
    
    // Recursively find visible ancestor
    return this.findVisibleAncestor(parent.id, viewNodes, visibilityMap);
  }

  private hideDescendants(nodeId: string): void {
    const currentState = this._viewState();
    const descendants = this.getDescendants(nodeId, currentState.nodes);
    
    const updatedNodes = { ...currentState.nodes };
    descendants.forEach(desc => {
      updatedNodes[desc.id] = { ...desc, visible: false };
    });

    this._viewState.set({
      ...currentState,
      nodes: updatedNodes,
      version: currentState.version + 1
    });
  }

  private restoreDescendants(nodeId: string): void {
    const currentState = this._viewState();
    const children = Object.values(currentState.nodes).filter(n => n.parentId === nodeId);
    
    const updatedNodes = { ...currentState.nodes };
    children.forEach(child => {
      updatedNodes[child.id] = { ...child, visible: true };
      
      // Recursively restore if child is not collapsed
      if (!child.collapsed) {
        this.restoreDescendantsRecursive(child.id, updatedNodes);
      }
    });

    this._viewState.set({
      ...currentState,
      nodes: updatedNodes,
      version: currentState.version + 1
    });
  }

  private restoreDescendantsRecursive(parentId: string, nodes: Record<string, ViewNode>): void {
    const children = Object.values(nodes).filter(n => n.parentId === parentId);
    children.forEach(child => {
      nodes[child.id] = { ...child, visible: true };
      if (!child.collapsed) {
        this.restoreDescendantsRecursive(child.id, nodes);
      }
    });
  }

  private getDescendants(nodeId: string, nodes: Record<string, ViewNode>): ViewNode[] {
    const descendants: ViewNode[] = [];
    
    const collectRecursive = (parentId: string) => {
      Object.values(nodes).forEach(node => {
        if (node.parentId === parentId) {
          descendants.push(node);
          collectRecursive(node.id);
        }
      });
    };
    
    collectRecursive(nodeId);
    return descendants;
  }
}