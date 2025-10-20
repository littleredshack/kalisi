# Cascading Layout & Rendering System

## Requirements

1. **Mix & Match**: Independent choice of layout algorithm and rendering style
2. **Hierarchical Configuration**: Settings cascade down from parent to children
3. **Node-Level Overrides**: Any node can override settings for its subtree
4. **Performance**: Handle thousands of nodes efficiently

## Core Architectural Principles

### 1. Separation of Concerns

```
┌─────────────────────────────────────────────────────┐
│                    Node Data                        │
│  (positions, relationships, properties)             │
└─────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│              Layout Strategy                        │
│  WHERE to position nodes (algorithm only)           │
│  - Grid, Force, Tree, Manual                        │
└─────────────────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────┐
│              Rendering Style                        │
│  HOW to draw nodes and edges (visual only)          │
│  - Container mode (nested boxes, hide CONTAINS)     │
│  - Flat mode (show all edges including CONTAINS)    │
│  - Edge routing (orthogonal, straight, curved)      │
└─────────────────────────────────────────────────────┘
```

**Key Point**: These are TWO separate concerns that can be mixed independently.

**Containment is a rendering option**, not a separate concern. When enabled, it:
- Renders parents as boxes containing children
- Hides CONTAINS edges (visual nesting replaces them)
- Requires layout to respect parent bounds

When disabled (flat mode), it:
- Renders all nodes as independent shapes
- Shows CONTAINS edges as visible lines
- Layout can treat graph as flat structure

### 2. Cascading Configuration Model

Like CSS, configuration cascades from parent to children:

```typescript
interface NodeLayoutConfig {
  // Layout Strategy: WHERE to position nodes
  layoutStrategy?: 'grid' | 'force' | 'tree' | 'manual' | 'inherit';
  layoutOptions?: {
    gridSpacing?: number;
    forceStrength?: number;
    treeOrientation?: 'vertical' | 'horizontal';
  };

  // Rendering Style: HOW to draw nodes and edges
  renderStyle?: {
    nodeMode?: 'container' | 'flat' | 'compact' | 'inherit';  // container = containment ON
    edgeRouting?: 'orthogonal' | 'straight' | 'curved' | 'inherit';
    showContainsEdges?: boolean;  // Auto-set based on nodeMode (false for container, true for flat)
  };

  // Controls cascade behavior
  applyToDescendants?: boolean; // true = override all children
  stopCascade?: boolean;         // true = children don't inherit beyond this
}
```

**Example Hierarchy:**

```
Root Node (render: container, layout: grid)
  ├─ Module A (inherits: container + grid)
  │   ├─ Class 1 (inherits: container + grid)
  │   └─ Class 2 (inherits: container + grid)
  │
  └─ Module B (OVERRIDE: layout: tree)  ← Override layout here
      ├─ Class 3 (inherits: container + tree)  ← Gets tree layout, container rendering
      └─ Class 4 (inherits: container + tree)  ← Gets tree layout, container rendering
```

### 3. Configuration Resolution Algorithm

When rendering a node, resolve its effective configuration:

```typescript
function resolveNodeConfig(node: HierarchicalNode, parentConfig?: ResolvedConfig): ResolvedConfig {
  const nodeConfig = node.layoutConfig || {};
  const renderStyle = nodeConfig.renderStyle || {};

  // Resolve layout strategy
  const layoutStrategy = nodeConfig.layoutStrategy === 'inherit'
    ? parentConfig?.layoutStrategy || DEFAULT_LAYOUT
    : nodeConfig.layoutStrategy || parentConfig?.layoutStrategy || DEFAULT_LAYOUT;

  // Resolve rendering style
  const nodeMode = renderStyle.nodeMode === 'inherit'
    ? parentConfig?.renderStyle?.nodeMode || DEFAULT_NODE_MODE
    : renderStyle.nodeMode || parentConfig?.renderStyle?.nodeMode || DEFAULT_NODE_MODE;

  const edgeRouting = renderStyle.edgeRouting === 'inherit'
    ? parentConfig?.renderStyle?.edgeRouting || DEFAULT_EDGE_ROUTING
    : renderStyle.edgeRouting || parentConfig?.renderStyle?.edgeRouting || DEFAULT_EDGE_ROUTING;

  // Auto-determine showContainsEdges based on nodeMode
  const showContainsEdges = nodeMode === 'flat'; // flat mode shows CONTAINS edges

  return {
    layoutStrategy,
    layoutOptions: nodeConfig.layoutOptions || parentConfig?.layoutOptions || {},
    renderStyle: {
      nodeMode,
      edgeRouting,
      showContainsEdges
    }
  };
}
```

## Implementation Architecture

### Phase 1: Core Infrastructure

#### 1.1 Layout Strategy Interface

```typescript
// Pure layout algorithm - no rendering
interface LayoutStrategy {
  id: string;
  label: string;

  // Position nodes within given bounds
  layout(nodes: LayoutNode[], bounds: Bounds, options?: any): LayoutNode[];

  // Incremental update for real-time changes
  updateLayout(nodes: LayoutNode[], changed: Set<string>): LayoutNode[];
}
```

**Implementations:**
- `GridLayoutStrategy` - Grid positioning
- `ForceLayoutStrategy` - Physics simulation
- `TreeLayoutStrategy` - Hierarchical tree
- `ManualLayoutStrategy` - Preserve user positions

#### 1.2 Renderer Interface

```typescript
// Pure visual rendering - receives positioned nodes
interface LayoutRenderer {
  id: string;
  label: string;

  // Render nodes at their positions
  render(ctx: CanvasRenderingContext2D, nodes: LayoutNode[], config: RenderConfig): void;

  // Render edges between nodes
  renderEdges(ctx: CanvasRenderingContext2D, edges: Edge[], config: RenderConfig): void;
}

interface RenderConfig {
  nodeMode: 'container' | 'flat' | 'compact';
  edgeRouting: 'orthogonal' | 'straight' | 'curved';
  showContainsEdges: boolean;  // Derived from nodeMode
}
```

**Implementations:**
- `ContainerRenderer` - Renders boxes with children inside (containment ON)
  - nodeMode: 'container'
  - Hides CONTAINS edges
  - Draws parent boundaries
- `FlatRenderer` - Renders independent shapes (containment OFF)
  - nodeMode: 'flat'
  - Shows ALL edges including CONTAINS
  - Ignores parent boundaries
- `CompactRenderer` - Minimal visual style
  - nodeMode: 'compact'
  - Configurable edge visibility

#### 1.3 Configuration Manager

```typescript
class NodeConfigManager {
  private configCache = new Map<string, ResolvedConfig>();
  private dirtyNodes = new Set<string>();

  // Set configuration for a node
  setNodeConfig(nodeId: string, config: NodeLayoutConfig, applyToDescendants: boolean): void {
    this.nodeConfigs.set(nodeId, config);
    this.invalidateNode(nodeId, applyToDescendants);
  }

  // Get effective configuration (with cascade)
  getResolvedConfig(node: HierarchicalNode, parentConfig?: ResolvedConfig): ResolvedConfig {
    // Check cache first
    if (this.configCache.has(node.id) && !this.dirtyNodes.has(node.id)) {
      return this.configCache.get(node.id)!;
    }

    // Resolve from node + parent
    const resolved = this.resolveConfig(node, parentConfig);

    // Cache it
    this.configCache.set(node.id, resolved);
    this.dirtyNodes.delete(node.id);

    return resolved;
  }

  // Invalidate cache when config changes
  private invalidateNode(nodeId: string, recursive: boolean): void {
    this.dirtyNodes.add(nodeId);
    if (recursive) {
      // Mark all descendants dirty
      this.invalidateDescendants(nodeId);
    }
  }
}
```

### Phase 2: RuntimeCanvasController Integration

```typescript
class RuntimeCanvasController {
  private configManager = new NodeConfigManager();
  private layoutStrategies = new Map<string, LayoutStrategy>();
  private renderers = new Map<string, LayoutRenderer>();

  // Process each node with its resolved configuration
  private processNode(node: HierarchicalNode, parentConfig?: ResolvedConfig): void {
    const config = this.configManager.getResolvedConfig(node, parentConfig);

    // Apply layout strategy to this node's children
    if (node.children && node.children.length > 0) {
      const strategy = this.layoutStrategies.get(config.layoutStrategy);
      if (strategy) {
        // Layout children within parent bounds
        const bounds = {
          x: node.x,
          y: node.y,
          width: node.width,
          height: node.height
        };

        // Apply layout algorithm
        node.children = strategy.layout(node.children, bounds, config.layoutOptions);
      }

      // Recursively process children
      for (const child of node.children) {
        this.processNode(child, config);
      }
    }
  }

  // Render with mixed renderers
  private renderNode(ctx: CanvasRenderingContext2D, node: HierarchicalNode, parentConfig?: ResolvedConfig): void {
    const config = this.configManager.getResolvedConfig(node, parentConfig);
    const renderer = this.renderers.get(config.renderMode);

    if (renderer) {
      renderer.render(ctx, [node], config);

      // Render children recursively
      if (node.children) {
        for (const child of node.children) {
          this.renderNode(ctx, child, config);
        }
      }
    }
  }
}
```

### Phase 3: Performance Optimizations

#### 3.1 Lazy Evaluation
- Only resolve config when actually rendering
- Cache resolved configs per node

#### 3.2 Dirty Tracking
- Track which nodes have config changes
- Only reprocess dirty subtrees

#### 3.3 Incremental Layout
- When config changes at node N:
  - Only re-layout N and its descendants
  - Siblings and ancestors unchanged

#### 3.4 Spatial Partitioning
- Only process visible nodes
- Use quadtree for large graphs

```typescript
class LayoutOptimizer {
  // Only layout visible nodes
  optimizeLayout(nodes: HierarchicalNode[], viewport: Bounds): HierarchicalNode[] {
    const visibleNodes = this.spatialIndex.query(viewport);

    // Only process visible + their ancestors
    const nodesToProcess = this.collectAncestors(visibleNodes);

    return this.layoutSubset(nodesToProcess);
  }

  // Incremental update when config changes
  incrementalUpdate(changedNodeId: string): void {
    // Find the changed node
    const node = this.findNode(changedNodeId);

    // Re-layout only this subtree
    this.layoutSubtree(node);

    // Invalidate render cache for this subtree
    this.invalidateRenderCache(node, true);
  }
}
```

## UI Design

### View Configuration Panel (Option-V)

```
┌─ View Configuration ─────────────────────────────────┐
│                                                       │
│ Apply to: ⦿ Selected Node  ○ Entire Graph            │
│                                                       │
│ ┌─ Layout Strategy ────────────────────────────────┐ │
│ │ Algorithm: [Grid ▼]                              │ │
│ │   Grid Spacing: [24] px                          │ │
│ │   Padding: [16] px                               │ │
│ │ ☑ Apply to all descendants                       │ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│ ┌─ Rendering Style ────────────────────────────────┐ │
│ │ Node Mode: [Container (nested boxes) ▼]         │ │
│ │            • Container - nested boxes, hide      │ │
│ │              CONTAINS edges                      │ │
│ │            • Flat - independent nodes, show      │ │
│ │              CONTAINS edges                      │ │
│ │                                                   │ │
│ │ Edge Routing: [Orthogonal ▼]                     │ │
│ │                                                   │ │
│ │ ☑ Apply to all descendants                       │ │
│ └──────────────────────────────────────────────────┘ │
│                                                       │
│ [Preview] [Apply] [Reset to Default]                 │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### Visual Feedback

When a node has custom configuration, show indicator:
- Small icon in top-right corner
- Tooltip: "Custom layout: Tree (applies to 45 descendants)"

## Complex Scenarios

### Scenario 1: Mixed Layouts with Container Rendering

```
Root (layout: Grid, render: Container)
  ├─ Module A (inherits: Grid + Container)
  │   ├─ Class 1 (inherits: Grid + Container)
  │   └─ Class 2 (inherits: Grid + Container)
  │
  └─ Module B (OVERRIDE layout: Force)  ← Force layout for this subtree
      ├─ Class 3 (inherits: Force + Container)
      ├─ Class 4 (OVERRIDE layout: Tree)  ← Tree layout for this subtree
      │   ├─ Method 1 (inherits: Tree + Container)
      │   └─ Method 2 (inherits: Tree + Container)
      └─ Class 5 (inherits: Force + Container)
```

### Scenario 1b: Mixed Rendering with Same Layout

```
Root (layout: Grid, render: Container)
  ├─ Module A (inherits: Grid + Container)
  │   ├─ Class 1 (inherits: Grid + Container)
  │   └─ Class 2 (inherits: Grid + Container)
  │
  └─ Module B (OVERRIDE render: Flat)  ← Flat rendering for this subtree
      ├─ Class 3 (inherits: Grid + Flat)  ← Still uses Grid, but Flat rendering
      │                                     Shows CONTAINS edges!
      └─ Class 4 (inherits: Grid + Flat)
```

**Rendering:**
1. Root uses Grid to position Module A and B
2. Module A uses Grid to position Class 1 and 2
3. Module B uses Force to position Class 3, 4, 5
4. Class 4 uses Tree to position Method 1 and 2

### Scenario 2: Layout Boundaries

**Challenge**: What happens at the boundary between layouts?

**Solution**: Parent's layout algorithm positions direct children. Children's layout algorithm doesn't affect their own position, only their children's positions.

```
Parent (Grid, positions children in grid)
  ├─ Child A (position from parent's grid)
  │   Children laid out by Child A's algorithm ──┐
  │                                              │
  └─ Child B (position from parent's grid)      ▼
      Children laid out by Child B's algorithm (Force)
```

### Scenario 3: Performance with Thousands of Nodes

**Example**: 1000-node subtree, change root's layout from Grid to Force

**Naive Approach** (BAD):
- Invalidate entire subtree
- Re-layout all 1000 nodes
- 🐌 Slow!

**Optimized Approach** (GOOD):
1. Mark root config as changed
2. **Lazy evaluation**: Don't recalculate until render
3. **Viewport culling**: Only process visible nodes
4. **Incremental updates**: Only affected nodes
5. **Web Worker**: Run layout in background thread

```typescript
class PerformantLayoutManager {
  async updateLayoutAsync(nodeId: string, config: NodeLayoutConfig): Promise<void> {
    // 1. Update config immediately (cheap)
    this.configManager.setNodeConfig(nodeId, config);

    // 2. Mark dirty (cheap)
    this.markDirty(nodeId, config.applyToDescendants);

    // 3. Schedule background layout (if needed)
    if (this.isDirtySubtreeLarge(nodeId)) {
      await this.layoutInWorker(nodeId);
    } else {
      this.layoutSubtree(nodeId);
    }

    // 4. Request render
    this.requestRender();
  }

  private async layoutInWorker(nodeId: string): Promise<void> {
    const subtree = this.extractSubtree(nodeId);
    const config = this.configManager.getResolvedConfig(subtree);

    // Send to Web Worker
    const laidOut = await this.layoutWorker.layout(subtree, config);

    // Merge results back
    this.mergeLayoutResults(nodeId, laidOut);
  }
}
```

## Data Structure

### Extended HierarchicalNode

```typescript
interface HierarchicalNode {
  id: string;
  GUID: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  children: HierarchicalNode[];

  // NEW: Layout configuration
  layoutConfig?: NodeLayoutConfig;

  // NEW: Cached resolved config (for performance)
  _resolvedConfig?: ResolvedConfig;

  // NEW: Dirty flag for incremental updates
  _configDirty?: boolean;
}
```

### Configuration Storage

Stored in Neo4j as node properties:

```cypher
MATCH (n:Node {GUID: "module-b"})
SET n.layoutConfig = {
  layoutStrategy: 'tree',
  renderMode: 'inherit',
  containmentMode: 'hierarchical',
  applyToDescendants: true
}
```

## Migration Path

### Step 1: Add configuration infrastructure (no behavior change)
- Add NodeConfigManager
- Add config storage to nodes
- Add resolution algorithm

### Step 2: Refactor existing engines into strategies
- Extract grid algorithm from containment-grid
- Extract force algorithm from force-directed
- Extract tree algorithm from tree engine

### Step 3: Separate rendering from layout
- Create ContainerRenderer (current rendering)
- Create FlatRenderer (show CONTAINS edges)

### Step 4: Implement cascade system
- Config resolution with inheritance
- Apply to RuntimeCanvasController

### Step 5: Build UI panel
- ViewConfigPanel component
- Per-node configuration UI

## Questions to Resolve

1. **Default Behavior**: What happens if a node has no config and no parent?
   - Answer: Use global default from ViewNode or system default
   - System defaults: layout='grid', nodeMode='container', edgeRouting='orthogonal'

2. **Edge Routing**: How to route edges between nodes with different layouts?
   - Answer: Always route in the common ancestor's coordinate space

3. **Performance Threshold**: When to use Web Worker?
   - Answer: If dirty subtree has > 500 nodes, use worker

4. **Mixed Rendering Boundaries**: How to draw edges between container and flat rendered nodes?
   - Answer: Use edgeRouting from the common ancestor, render in global coordinate space

5. **Persistence**: Store config in Neo4j or localStorage?
   - Answer: Neo4j for shared configs, localStorage for user preferences

6. **CONTAINS Edge Visibility**: In flat mode, should we show CONTAINS edges with special styling?
   - Answer: Yes - distinct color/style to differentiate from other relationship types

What would you like me to implement first?
