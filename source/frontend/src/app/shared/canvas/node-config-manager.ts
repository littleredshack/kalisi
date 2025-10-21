import { HierarchicalNode } from './types';

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
 * Features:
 * - CSS-like cascading from parent to children
 * - Per-node configuration overrides
 * - Caching for performance
 * - Dirty tracking for incremental updates
 */
export class NodeConfigManager {
  private nodeConfigs = new Map<string, NodeLayoutConfig>();
  private configCache = new Map<string, ResolvedConfig>();
  private dirtyNodes = new Set<string>();

  /**
   * Set configuration for a node
   */
  setNodeConfig(nodeId: string, config: NodeLayoutConfig): void {
    this.nodeConfigs.set(nodeId, config);
    this.invalidateNode(nodeId, config.applyToDescendants ?? false);
  }

  /**
   * Get configuration for a node (returns the override, not resolved)
   */
  getNodeConfig(nodeId: string): NodeLayoutConfig | undefined {
    return this.nodeConfigs.get(nodeId);
  }

  /**
   * Remove configuration for a node
   */
  removeNodeConfig(nodeId: string): void {
    this.nodeConfigs.delete(nodeId);
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
    const nodeConfig = this.nodeConfigs.get(nodeId) ?? node.layoutConfig ?? {};
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
   * Get all configured node IDs
   */
  getConfiguredNodeIds(): string[] {
    return Array.from(this.nodeConfigs.keys());
  }
}
