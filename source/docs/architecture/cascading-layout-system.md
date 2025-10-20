# Cascading Layout & Rendering System

## Requirements

1. **Mix & Match**: Independent choice of layout algorithm and rendering style
2. **Hierarchical Configuration**: Settings cascade down from parent to children
3. **Node-Level Overrides**: Any node can override settings for its subtree
4. **Performance**: Handle thousands of nodes efficiently
5. **Runtime-First**: All layout/rendering modes must be configurations of the containment runtime engine stack—the single surviving code path for all canvas views

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
  - Extracts grid algorithm from `containment-runtime-layout.engine.ts`
  - Shares helpers from `LayoutPrimitives`
- `ForceLayoutStrategy` - Physics simulation
  - Delegates to shared force primitives from `force-layout.engine.ts`
- `TreeLayoutStrategy` - Hierarchical tree
  - Extracts tree algorithm from existing tree engine
- `ManualLayoutStrategy` - Preserve user positions

**Layout Primitives** (`LayoutPrimitives`):
- Accept runtime config flags (containment vs flat)
- Functions like `clampChildWithinParent` noop in flat mode
- Share grid/force helpers across engines to avoid duplication

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
- `RuntimeContainmentRenderer` - Renders boxes with children inside (containment ON)
  - nodeMode: 'container'
  - Hides CONTAINS edges
  - Draws parent boundaries
  - Located: `frontend/src/app/shared/composable/renderers/runtime-containment-renderer.ts`
- `RuntimeFlatRenderer` - Renders independent shapes (containment OFF)
  - nodeMode: 'flat'
  - Shows ALL edges including CONTAINS
  - Ignores parent boundaries
  - **Wraps existing `composable-flat-renderer.ts`** to preserve runtime metadata (badges, style overrides)
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

### Phase 2.5: Angular Service Integration

The cascading system integrates with existing Angular services to ensure observable state management and worker/main thread communication.

#### 2.5.1 CanvasControlService
Declarative setters expose configuration with observable state:

```typescript
@Injectable()
export class CanvasControlService {
  // Observable state streams
  readonly containmentMode$ = new BehaviorSubject<'containers' | 'flat'>('containers');
  readonly layoutMode$ = new BehaviorSubject<'grid' | 'force'>('grid');
  readonly edgeRouting$ = new BehaviorSubject<'orthogonal' | 'straight'>('orthogonal');

  // Declarative setters
  setContainmentMode(mode: 'containers' | 'flat'): void {
    this.containmentMode$.next(mode);
    this.publishConfigUpdate();
  }

  setLayoutMode(mode: 'grid' | 'force'): void {
    this.layoutMode$.next(mode);
    this.publishConfigUpdate();
  }

  setEdgeRouting(mode: 'orthogonal' | 'straight'): void {
    this.edgeRouting$.next(mode);
    this.publishConfigUpdate();
  }

  // Node-level configuration
  setNodeLayoutConfig(nodeId: string, config: NodeLayoutConfig): void {
    this.nodeConfigStore.set(nodeId, config);
    this.eventHub.publish('node-config-changed', { nodeId, config });
  }

  private publishConfigUpdate(): void {
    const config: RuntimeViewConfig = {
      containmentMode: this.containmentMode$.value,
      layoutMode: this.layoutMode$.value,
      edgeRouting: this.edgeRouting$.value
    };
    this.eventHub.publish('runtime-config-changed', config);
  }
}
```

#### 2.5.2 CanvasEventHubService
Ensures worker/main thread communication for runtime updates:

```typescript
@Injectable()
export class CanvasEventHubService {
  publish(event: string, payload: any): void {
    // Send to worker thread if runtime is running there
    if (this.workerRuntime) {
      this.workerRuntime.postMessage({ event, payload });
    }
    // Also emit locally for main thread listeners
    this.localEmitter.emit(event, payload);
  }
}
```

#### 2.5.3 PresentationFrame Metadata
Renderer choice stored in PresentationFrame so canvas can redraw without re-running layout when only render style changes:

```typescript
interface PresentationFrame {
  nodes: LayoutNode[];
  edges: Edge[];
  rendererId: string;  // 'runtime-containment-renderer' | 'runtime-flat-renderer'
  renderConfig: RenderConfig;
  timestamp: number;
}

class CanvasLayoutRuntime {
  private lastFrame?: PresentationFrame;

  // Only re-run layout if layout config changed
  // Otherwise just update renderer
  async updateConfig(config: RuntimeViewConfig): Promise<void> {
    const layoutChanged = this.hasLayoutChanged(config);

    if (layoutChanged) {
      await this.runLayout(config);
    } else {
      // Just update renderer, reuse positioned nodes
      this.updateRenderer(config);
      this.requestRender();
    }
  }
}
```

#### 2.5.4 LayoutModuleRegistry Updates
Update module descriptors so `containment-runtime` advertises both renderer IDs:

```typescript
const containmentRuntimeModule: LayoutModuleDescriptor = {
  id: 'containment-runtime',
  label: 'Containment Runtime',
  engineId: 'containment-runtime-layout',
  rendererIds: [
    'runtime-containment-renderer',  // Container mode
    'runtime-flat-renderer'          // Flat mode
  ],
  supportsInteraction: true,
  supportsIncremental: true
};
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

## Implementation Plan

### Phase 1: Runtime Configuration Plumbing
**Files:**
- `frontend/src/app/shared/canvas/layout-runtime.ts`
- `frontend/src/app/shared/layouts/layout-module-registry.ts`

**Tasks:**
1. Extend `CanvasLayoutRuntime` to store `RuntimeViewConfig`
2. Include config in `runLayout` calls
3. Expose getters/observables for config state
4. Update `LayoutModuleRegistry` descriptors:
   - `containment-runtime` module advertises both renderer IDs
   - Add metadata for supported config options

**Deliverable:** Runtime can receive and store config, but behavior unchanged

### Phase 2: Engine Configuration Support
**Files:**
- `frontend/src/app/shared/layouts/engines/containment-runtime-layout.engine.ts`
- `frontend/src/app/shared/layouts/layout-primitives.ts`

**Tasks:**
1. Accept `engineOptions` in `ContainmentRuntimeLayoutEngine.layout()`
2. When `containmentMode === 'flat'`:
   - Skip `LayoutPrimitives.resizeToFitChildren`
   - Preserve CONTAINS edges in edge list
   - Emit world coordinates for every node
3. Respect `layoutMode` ('grid' vs 'force'):
   - Extract grid positioning into reusable helper
   - Delegate force layout to shared primitives
4. Update `LayoutPrimitives` to accept config flags:
   - `clampChildWithinParent` noops in flat mode
   - Share grid/force helpers across engines

**Deliverable:** Engine can operate in both container and flat modes

### Phase 3: Flat Renderer Implementation
**Files:**
- `frontend/src/app/shared/composable/renderers/runtime-flat-renderer.ts` (NEW)
- `frontend/src/app/shared/composable/renderers/composable-flat-renderer.ts` (existing)
- `frontend/src/app/shared/composable/renderers/runtime-containment-renderer.ts` (update)

**Tasks:**
1. Create `RuntimeFlatRenderer`:
   - Wrap existing `composable-flat-renderer.ts` primitives
   - Preserve runtime metadata (badges, style overrides)
   - Display CONTAINS edges with orthogonal routing
   - When `edgeRouting === 'straight'`, bypass routing service
2. Update `RuntimeContainmentRenderer` to read config for edge routing
3. Register both renderers in module registry

**Deliverable:** Both container and flat rendering modes available

### Phase 4: Angular Service Integration
**Files:**
- `frontend/src/app/shared/services/canvas-control.service.ts`
- `frontend/src/app/shared/services/canvas-event-hub.service.ts`
- Properties panel component

**Tasks:**
1. Add to `CanvasControlService`:
   - Observable state: `containmentMode$`, `layoutMode$`, `edgeRouting$`
   - Setters: `setContainmentMode()`, `setLayoutMode()`, `setEdgeRouting()`
   - Method: `setNodeLayoutConfig(nodeId, config)`
2. Update `CanvasEventHubService`:
   - Publish config changes to worker/main thread
3. Add "Layout & Rendering" block in Properties panel:
   - Bind toggles to service methods
   - Show current effective config
   - "Apply to descendants" toggle
4. Update `PresentationFrame` to include renderer metadata

**Deliverable:** UI controls wired to runtime config system

### Phase 5: Cascading Configuration System
**Files:**
- `frontend/src/app/shared/canvas/node-config-manager.ts` (NEW)
- `frontend/src/app/shared/canvas/layout-runtime.ts` (update)

**Tasks:**
1. Create `NodeConfigManager`:
   - Store node-level config overrides (keyed by GUID)
   - Implement resolution algorithm with inheritance
   - Cache resolved configs per node
   - Dirty tracking for invalidation
2. Extend `HierarchicalNode` interface:
   - Add `layoutConfig?: NodeLayoutConfig`
   - Add `_resolvedConfig?: ResolvedConfig` (cache)
   - Add `_configDirty?: boolean` (dirty flag)
3. Update `CanvasLayoutRuntime`:
   - Compute resolved config map before invoking engines
   - Partition nodes by `layoutMode`
   - Pass per-node `renderMode` to renderers
4. Implement persistence:
   - Store overrides alongside layouts (localStorage or Neo4j)
   - Load on view initialization

**Deliverable:** Node-level overrides with cascading inheritance

### Phase 6: Engine Execution with Partitioning
**Files:**
- `frontend/src/app/shared/canvas/layout-runtime.ts`

**Tasks:**
1. Build partitions of nodes requiring same layout mode
2. Execute layout strategies per partition:
   - Run grid on top-level containment subtree
   - Run force on nested subgraph with overrides
3. Merge results:
   - Translate child partition coordinates to parent coordinate system
   - Preserve world metadata for renderer
4. Renderers resolve per-node basis:
   - Draw containers (padding/clamping) vs flat nodes (show CONTAINS edges)
   - Use same geometry from layout

**Deliverable:** Mixed layout modes in single graph

### Phase 7: Testing & Validation
**Tasks:**
1. **Unit tests:**
   - Engine outputs for both modes (containment edges present/absent)
   - Node positions stable across mode switches
   - Cascading resolution (inheritance, apply-to-descendants, reset)
2. **Snapshot tests:**
   - Edge routing correctness
   - Node visibility in container vs flat mode
   - Mixed-mode rendering boundaries
3. **Manual smoke tests:**
   - Flip containment on/off, verify visual changes
   - Switch grid/force, confirm layout changes
   - Check runtime logs show single engine ID
   - Test node-level overrides cascade correctly
4. **Performance tests:**
   - Large graphs (1000+ nodes) with mode switches
   - Incremental updates with dirty tracking
   - Verify viewport culling works

**Deliverable:** Fully tested cascading system

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

## Summary

This cascading layout system provides:
- **Runtime-first architecture**: Single code path (containment runtime) with configurable behavior
- **Separation of concerns**: Layout (WHERE) and rendering (HOW) are independent
- **CSS-like cascading**: Configuration flows from parent to children with node-level overrides
- **Angular integration**: Observable state via CanvasControlService, worker communication via EventHub
- **Performance**: Lazy evaluation, dirty tracking, incremental updates, viewport culling
- **Persistence**: Overrides stored alongside layouts, surviving reload

The implementation plan provides a phased approach, each phase delivering incremental value while maintaining system stability.
