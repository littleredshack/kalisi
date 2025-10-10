import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Neo4jDataService } from './neo4j-data.service';

// Interface for library items displayed in the panel
export interface LibraryItem {
  id: string;
  label: string;
  viewType?: string;
  summary: string;
  detail: string;
  nested?: boolean;
}

export type CollapseBehavior = 'full-size' | 'shrink';
export type ReflowBehavior = 'static' | 'dynamic';

export interface NodeVisibilityState {
  nodeGuid: string;
  visible: boolean;
  collapsed: boolean;
  childrenStates?: Map<string, NodeVisibilityState>;
}

@Injectable({
  providedIn: 'root'
})
export class ViewNodeStateService {
  // State management
  private setNodes$ = new BehaviorSubject<any[]>([]);
  private viewNodes$ = new BehaviorSubject<any[]>([]);
  private selectedViewNode$ = new BehaviorSubject<any | null>(null);
  private expandedSetNodes$ = new BehaviorSubject<Set<string>>(new Set());
  private collapseBehavior$ = new BehaviorSubject<CollapseBehavior>(this.loadCollapseBehavior());
  private reflowBehavior$ = new BehaviorSubject<ReflowBehavior>(this.loadReflowBehavior());
  private nodeVisibilityStates$ = new BehaviorSubject<Map<string, NodeVisibilityState>>(new Map());

  // Public observables
  public readonly selectedViewNode = this.selectedViewNode$.asObservable();
  public readonly expandedSetNodes = this.expandedSetNodes$.asObservable();
  public readonly collapseBehavior = this.collapseBehavior$.asObservable();
  public readonly reflowBehavior = this.reflowBehavior$.asObservable();
  public readonly nodeVisibilityStates = this.nodeVisibilityStates$.asObservable();

  constructor(private neo4jDataService: Neo4jDataService) {
    // Load data on service initialization
    this.loadViewNodesFromDatabase();
  }

  /**
   * Load SetNodes and ViewNodes from Neo4j database
   */
  async loadViewNodesFromDatabase(): Promise<void> {
    try {
      // Try to load SetNodes first (hierarchical structure)
      const setNodes = await this.neo4jDataService.getAllSetNodes();

      if (setNodes.length > 0) {
        this.setNodes$.next(setNodes);
        // Extract ViewNodes from SetNodes
        const allViewNodes: any[] = [];
        setNodes.forEach(setNode => {
          if (setNode.viewNodes && setNode.viewNodes.length > 0) {
            allViewNodes.push(...setNode.viewNodes);
          }
        });
        this.viewNodes$.next(allViewNodes);
      } else {
        // Fallback to flat ViewNodes if no SetNodes found
        const viewNodes = await this.neo4jDataService.getAllViewNodes();
        this.viewNodes$.next(viewNodes);
      }
    } catch (error) {
      console.error('Failed to load ViewNodes from database:', error);
      // Keep empty arrays on error
      this.setNodes$.next([]);
      this.viewNodes$.next([]);
    }
  }

  /**
   * Get library items for display in the panel
   */
  getLibraryItems(): Observable<LibraryItem[]> {
    return this.setNodes$.pipe(
      map(setNodes => {
        if (setNodes.length > 0) {
          return this.createHierarchicalLibraryItems(setNodes);
        } else {
          // Fallback to flat ViewNodes
          return this.viewNodes$.value.map(viewNode => ({
            id: viewNode.id,
            label: viewNode.name,
            viewType: viewNode.renderer || viewNode.viewType || 'modular-canvas',
            summary: viewNode.name,
            detail: viewNode.detail || `Loading ${viewNode.name} data from database`,
            nested: false
          }));
        }
      })
    );
  }

  /**
   * Create hierarchical library items from SetNodes
   */
  private createHierarchicalLibraryItems(setNodes: any[]): LibraryItem[] {
    const items: LibraryItem[] = [];

    setNodes.forEach(setNode => {
      // Add SetNode as parent item
      const setItem: LibraryItem = {
        id: setNode.id,
        label: setNode.name,
        summary: setNode.name,
        detail: `${setNode.name} set with ${setNode.viewNodes?.length || 0} views`,
        nested: false
      };
      items.push(setItem);

      // Add ViewNodes as nested children
      if (setNode.viewNodes) {
        setNode.viewNodes.forEach((viewNode: any) => {
          const viewItem: LibraryItem = {
            id: viewNode.id,
            label: viewNode.name,
            viewType: viewNode.renderer || viewNode.viewType || 'modular-canvas',
            summary: viewNode.summary || viewNode.name,
            detail: viewNode.detail || `Loading ${viewNode.name} data from database`,
            nested: true
          };
          items.push(viewItem);
        });
      }
    });

    return items;
  }

  /**
   * Select a ViewNode by ID
   */
  selectViewNodeById(itemId: string): void {
    // Check if this is a ViewNode
    let viewNode = this.viewNodes$.value.find(vn => vn.id === itemId);

    // If not found in flat list, search within SetNodes
    if (!viewNode) {
      for (const setNode of this.setNodes$.value) {
        viewNode = setNode.viewNodes?.find((vn: any) => vn.id === itemId);
        if (viewNode) break;
      }
    }

    if (viewNode) {
      this.selectedViewNode$.next(viewNode);
    } else {
      // Check if it's a SetNode
      const setNode = this.setNodes$.value.find(sn => sn.id === itemId);
      if (setNode) {
        // For SetNodes, we just store the details but don't select as ViewNode
        console.log('SetNode selected:', setNode.name);
        // Could emit a different event for SetNode selection if needed
      }
    }
  }

  /**
   * Clear the current selection
   */
  clearSelection(): void {
    this.selectedViewNode$.next(null);
  }

  /**
   * Get current SetNodes
   */
  getSetNodes(): any[] {
    return this.setNodes$.value;
  }

  /**
   * Get current ViewNodes
   */
  getViewNodes(): any[] {
    return this.viewNodes$.value;
  }

  /**
   * Toggle SetNode expansion state
   */
  toggleSetNodeExpansion(setNodeId: string): void {
    const expanded = new Set(this.expandedSetNodes$.value);
    if (expanded.has(setNodeId)) {
      expanded.delete(setNodeId);
    } else {
      expanded.add(setNodeId);
    }
    this.expandedSetNodes$.next(expanded);
  }

  /**
   * Check if a SetNode is expanded
   */
  isSetNodeExpanded(setNodeId: string): boolean {
    return this.expandedSetNodes$.value.has(setNodeId);
  }

  /**
   * Get details for a specific item (ViewNode or SetNode)
   */
  getItemDetails(itemId: string): any {
    // Check ViewNodes first
    let viewNode = this.viewNodes$.value.find(vn => vn.id === itemId);
    if (viewNode) return viewNode;

    // Check SetNodes
    const setNode = this.setNodes$.value.find(sn => sn.id === itemId);
    if (setNode) return setNode;

    return null;
  }

  /**
   * Load collapse behavior - now from database per ViewNode, default for initialization
   */
  private loadCollapseBehavior(): CollapseBehavior {
    return 'full-size'; // Default only, actual value loaded from ViewNode database
  }

  /**
   * Save collapse behavior - no longer saved to localStorage, handled by ViewNode persistence
   */
  private saveCollapseBehavior(behavior: CollapseBehavior): void {
    // No localStorage saving - handled by ViewNode database persistence
  }

  /**
   * Get current collapse behavior
   */
  getCollapseBehaviorValue(): CollapseBehavior {
    return this.collapseBehavior$.value;
  }

  /**
   * Set collapse behavior
   */
  setCollapseBehavior(behavior: CollapseBehavior): void {
    this.collapseBehavior$.next(behavior);
    this.saveCollapseBehavior(behavior);
  }

  /**
   * Toggle collapse behavior between full-size and shrink
   */
  toggleCollapseBehavior(): void {
    const current = this.collapseBehavior$.value;
    const newBehavior = current === 'full-size' ? 'shrink' : 'full-size';
    this.setCollapseBehavior(newBehavior);
  }

  /**
   * Load reflow behavior - now from database per ViewNode, default for initialization
   */
  private loadReflowBehavior(): ReflowBehavior {
    return 'static'; // Default only, actual value loaded from ViewNode database
  }

  /**
   * Save reflow behavior - no longer saved to localStorage, handled by ViewNode persistence
   */
  private saveReflowBehavior(behavior: ReflowBehavior): void {
    // No localStorage saving - handled by ViewNode database persistence
  }

  /**
   * Get current reflow behavior
   */
  getReflowBehaviorValue(): ReflowBehavior {
    return this.reflowBehavior$.value;
  }

  /**
   * Save current node visibility state before collapsing
   */
  saveNodeVisibilityState(nodeGuid: string, node: any): void {
    if (!nodeGuid) {
      console.warn('[ViewNodeStateService] Attempted to save node state without a GUID', node);
      return;
    }
    const state = this.captureNodeState(node);
    if (!state) {
      return;
    }
    const currentStates = this.nodeVisibilityStates$.value;
    currentStates.set(nodeGuid, state);
    this.nodeVisibilityStates$.next(currentStates);
  }

  /**
   * Restore previously saved node visibility state
   */
  restoreNodeVisibilityState(nodeGuid: string): NodeVisibilityState | null {
    const currentStates = this.nodeVisibilityStates$.value;
    return currentStates.get(nodeGuid) || null;
  }

  /**
   * Capture complete state of node and all descendants
   */
  private captureNodeState(node: any): NodeVisibilityState | null {
    const nodeGuid = node?.GUID;
    if (!nodeGuid) {
      console.warn('[ViewNodeStateService] Skipping node state capture because node lacks a GUID', node);
      return null;
    }
    const childrenStates = new Map<string, NodeVisibilityState>();

    if (node.children && node.children.length > 0) {
      node.children.forEach((child: any) => {
        const childGuid = child?.GUID;
        if (!childGuid) {
          console.warn('[ViewNodeStateService] Child node missing GUID during state capture', child);
          return;
        }
        const childState = this.captureNodeState(child);
        if (childState) {
          childrenStates.set(childGuid, childState);
        }
      });
    }

    return {
      nodeGuid,
      visible: node.visible !== false,
      collapsed: node.collapsed || false,
      childrenStates: childrenStates.size > 0 ? childrenStates : undefined
    };
  }

  /**
   * Get current node visibility states
   */
  getNodeVisibilityStates(): Map<string, NodeVisibilityState> {
    return this.nodeVisibilityStates$.value;
  }

  /**
   * Set reflow behavior
   */
  setReflowBehavior(behavior: ReflowBehavior): void {
    this.reflowBehavior$.next(behavior);
    this.saveReflowBehavior(behavior);
  }

  /**
   * Toggle reflow behavior between static and dynamic
   */
  toggleReflowBehavior(): void {
    const current = this.reflowBehavior$.value;
    const newBehavior = current === 'static' ? 'dynamic' : 'static';
    this.setReflowBehavior(newBehavior);
  }

}
