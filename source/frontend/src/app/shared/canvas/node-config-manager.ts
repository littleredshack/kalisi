import { BehaviorSubject } from 'rxjs';
import { HierarchicalNode } from './types';
import { ViewState } from './state/view-state.model';

/**
 * Node-level layout configuration
 * Like CSS, configuration cascades from parent to children
 */
export interface NodeLayoutConfig {
  // Layout Strategy: WHERE to position nodes
  layoutStrategy?: 'grid' | 'force' | 'tree' | 'manual' | 'inherit';
  layoutOptions?: {
    gridSpacing?: number;
    forceStrength?: number;
    treeOrientation?: 'vertical' | 'horizontal';
  };

  // Rendering Style: HOW to draw nodes and edges
  renderStyle?: {
    nodeMode?: 'container' | 'flat' | 'compact' | 'inherit';
    edgeRouting?: 'orthogonal' | 'straight' | 'curved' | 'inherit';
  };

  // Controls cascade behavior
  applyToDescendants?: boolean; // true = override all children
  stopCascade?: boolean;         // true = children don't inherit beyond this
}

/**
 * Resolved configuration after cascade resolution
 */
export interface ResolvedConfig {
  layoutStrategy: 'grid' | 'force' | 'tree' | 'manual';
  layoutOptions: {
    gridSpacing?: number;
    forceStrength?: number;
    treeOrientation?: 'vertical' | 'horizontal';
  };
  renderStyle: {
    nodeMode: 'container' | 'flat' | 'compact';
    edgeRouting: 'orthogonal' | 'straight' | 'curved';
    showContainsEdges: boolean;  // Derived from nodeMode
  };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ResolvedConfig = {
  layoutStrategy: 'grid',
  layoutOptions: {},
  renderStyle: {
    nodeMode: 'container',
    edgeRouting: 'orthogonal',
    showContainsEdges: false
  }
};

/**
 * Manages node-level configuration overrides with cascading inheritance
 *
 * ARCHITECTURAL CONTRACT:
 * - NodeConfigManager is a FACADE over ViewState.layout.perNode
 * - It does NOT own data - ViewState is the single source of truth
 * - All mutations update ViewState via BehaviorSubject
 * - Caching for performance, invalidated on ViewState changes
 */
export class NodeConfigManager {
  private configCache = new Map<string, ResolvedConfig>();
  private dirtyNodes = new Set<string>();

  constructor(private readonly viewStateSubject: BehaviorSubject<ViewState>) {
    // Subscribe to ViewState changes to invalidate cache
    this.viewStateSubject.subscribe(() => {
      this.clearCache();
    });
  }

  /**
   * Set configuration for a node - updates ViewState
   */
  setNodeConfig(nodeId: string, config: NodeLayoutConfig): void {
    const current = this.viewStateSubject.value;
    const updatedPerNode = {
      ...(current.layout.perNode ?? {}),
      [nodeId]: config
    };

    this.viewStateSubject.next({
      ...current,
      layout: {
        ...current.layout,
        perNode: updatedPerNode
      }
    });

    this.invalidateNode(nodeId, config.applyToDescendants ?? false);
  }

  /**
   * Get configuration for a node - reads from ViewState
   */
  getNodeConfig(nodeId: string): NodeLayoutConfig | undefined {
    const viewState = this.viewStateSubject.value;
    return viewState.layout.perNode?.[nodeId];
  }

  /**
   * Remove configuration for a node - updates ViewState
   */
  removeNodeConfig(nodeId: string): void {
    const current = this.viewStateSubject.value;
    const updatedPerNode = { ...(current.layout.perNode ?? {}) };
    delete updatedPerNode[nodeId];

    this.viewStateSubject.next({
      ...current,
      layout: {
        ...current.layout,
        perNode: updatedPerNode
      }
    });

    this.invalidateNode(nodeId, true);
  }

  /**
   * Get effective configuration (with cascade) for a node
   */
  getResolvedConfig(node: HierarchicalNode, parentConfig?: ResolvedConfig): ResolvedConfig {
    const nodeId = node.GUID ?? node.id;

    // Check cache first
    if (this.configCache.has(nodeId) && !this.dirtyNodes.has(nodeId)) {
      return this.configCache.get(nodeId)!;
    }

    // Resolve from node + parent
    const resolved = this.resolveConfig(node, parentConfig);

    // Cache it
    this.configCache.set(nodeId, resolved);
    this.dirtyNodes.delete(nodeId);

    return resolved;
  }

  /**
   * Resolve configuration for a node, applying cascade rules
   */
  private resolveConfig(node: HierarchicalNode, parentConfig?: ResolvedConfig): ResolvedConfig {
    const nodeId = node.GUID ?? node.id;
    // Read from ViewState (single source of truth)
    const viewState = this.viewStateSubject.value;
    const nodeConfig = viewState.layout.perNode?.[nodeId] ?? node.layoutConfig ?? {};
    const baseConfig = parentConfig ?? DEFAULT_CONFIG;

    // Resolve layout strategy
    const layoutStrategy = this.resolveLayoutStrategy(nodeConfig.layoutStrategy, baseConfig.layoutStrategy);

    // Resolve layout options
    const layoutOptions = {
      ...baseConfig.layoutOptions,
      ...(nodeConfig.layoutOptions ?? {})
    };

    // Resolve rendering style
    const renderStyle = nodeConfig.renderStyle ?? {};
    const nodeMode = this.resolveNodeMode(renderStyle.nodeMode, baseConfig.renderStyle.nodeMode);
    const edgeRouting = this.resolveEdgeRouting(renderStyle.edgeRouting, baseConfig.renderStyle.edgeRouting);

    // Auto-determine showContainsEdges based on nodeMode
    const showContainsEdges = nodeMode === 'flat';

    return {
      layoutStrategy,
      layoutOptions,
      renderStyle: {
        nodeMode,
        edgeRouting,
        showContainsEdges
      }
    };
  }

  private resolveLayoutStrategy(
    value: string | undefined,
    defaultValue: 'grid' | 'force' | 'tree' | 'manual'
  ): 'grid' | 'force' | 'tree' | 'manual' {
    if (!value || value === 'inherit') {
      return defaultValue;
    }
    return value as 'grid' | 'force' | 'tree' | 'manual';
  }

  private resolveNodeMode(
    value: string | undefined,
    defaultValue: 'container' | 'flat' | 'compact'
  ): 'container' | 'flat' | 'compact' {
    if (!value || value === 'inherit') {
      return defaultValue;
    }
    return value as 'container' | 'flat' | 'compact';
  }

  private resolveEdgeRouting(
    value: string | undefined,
    defaultValue: 'orthogonal' | 'straight' | 'curved'
  ): 'orthogonal' | 'straight' | 'curved' {
    if (!value || value === 'inherit') {
      return defaultValue;
    }
    return value as 'orthogonal' | 'straight' | 'curved';
  }

  /**
   * Invalidate cache when config changes
   */
  private invalidateNode(nodeId: string, recursive: boolean): void {
    this.dirtyNodes.add(nodeId);
    if (recursive) {
      this.invalidateDescendants(nodeId);
    }
  }

  /**
   * Mark all descendants dirty (requires node hierarchy to traverse)
   */
  private invalidateDescendants(nodeId: string): void {
    // Mark this node dirty
    this.dirtyNodes.add(nodeId);

    // In a real implementation, we would traverse the node hierarchy
    // For now, just clear the entire cache to be safe
    // TODO: Optimize to only invalidate actual descendants
    this.configCache.clear();
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.configCache.clear();
    this.dirtyNodes.clear();
  }

  /**
   * Get all configured node IDs - reads from ViewState
   */
  getConfiguredNodeIds(): string[] {
    const viewState = this.viewStateSubject.value;
    return Object.keys(viewState.layout.perNode ?? {});
  }
}
