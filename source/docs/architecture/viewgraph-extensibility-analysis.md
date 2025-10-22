# ViewGraph Architecture - Extensibility Analysis

## Current State (Post-Refactor)

**Codebase:** ~9,700 lines (shared code)
**Bundle:** 6.54 MB
**Architecture:** ViewGraph with direct mutation, no cloning

---

## ✅ Strengths

### 1. **Clean Separation of Concerns**

**Data Flow:**
```
GraphDataSet (immutable)
  → LayoutRuntime
  → ViewGraph (mutable)
  → LayoutEngine
  → ViewGraph (updated)
  → Renderer
```

- **GraphDataSet**: Immutable source data from Neo4j
- **ViewGraph**: Single mutable presentation state (positions, styles, camera, visibility)
- **LayoutEngine**: Pure function `layout(graph, options) → result`
- **Renderer**: Pure function `render(ctx, nodes, edges, camera)`

### 2. **Pluggable Layout Engine System**

**LayoutOrchestrator** (layout-orchestrator.ts):
- Manages multiple engines
- Engine switching at runtime
- Event bus for layout events

**Adding a new engine:**
```typescript
// 1. Implement interface
export class ForceDirectedEngine implements LayoutEngine {
  readonly name = 'force-directed';
  readonly capabilities = { ... };

  layout(graph: LayoutGraph, options: LayoutOptions): LayoutResult {
    // Apply force-directed algorithm
    return { graph: updatedGraph };
  }
}

// 2. Register in engine-registry.ts
export function registerDefaultLayoutEngines(orchestrator: LayoutOrchestrator) {
  orchestrator.registerEngine(new ContainmentRuntimeLayoutEngine());
  orchestrator.registerEngine(new ForceDirectedEngine()); // ← Add here
  return orchestrator;
}

// 3. Use it
runtime.switchEngine('force-directed');
```

### 3. **Per-Node Config Infrastructure EXISTS**

**Already implemented** (node-config-manager.ts:7-218):

```typescript
interface NodeLayoutConfig {
  layoutStrategy?: 'grid' | 'force' | 'tree' | 'manual' | 'inherit';
  layoutOptions?: { gridSpacing?, forceStrength?, treeOrientation? };
  renderStyle?: { nodeMode?, edgeRouting? };
  applyToDescendants?: boolean;  // Cascade control
  stopCascade?: boolean;         // Stop inheritance
}

class NodeConfigManager {
  getResolvedConfig(node, parentConfig): ResolvedConfig {
    // Resolves with CSS-like inheritance
    // node.layoutConfig → parent → global
  }
}
```

**Node has the field:**
```typescript
HierarchicalNode {
  layoutConfig?: NodeLayoutConfig;  // ← EXISTS in types.ts:31
  metadata?: Record<string, any>;
}
```

---

## ⚠️ Gaps (What's NOT Wired Up)

### 1. **NodeConfigManager Not Used Anywhere**

**Problem:**
- Infrastructure exists but **zero** callsites
- `containment-runtime-layout.engine.ts` doesn't check `node.layoutConfig`
- Global `RuntimeViewConfig` is used, per-node configs ignored

**What's missing:**
```typescript
// In containment-runtime-layout.engine.ts:
layout(graph, options) {
  const configManager = new NodeConfigManager(); // ← Not happening

  processedNodes.forEach(node => {
    const resolved = configManager.getResolvedConfig(node, parentConfig); // ← Not happening

    // Apply resolved.layoutStrategy to THIS node
    if (resolved.layoutStrategy === 'force') {
      this.applyForceLayout(node, resolved.layoutOptions);
    } else if (resolved.layoutStrategy === 'tree') {
      this.applyTreeLayout(node, resolved.layoutOptions);
    }
  });
}
```

### 2. **No Multi-Engine Coordination**

**Current:** One engine processes entire graph
**Needed:** Subtree delegation

```typescript
// Pseudo-code for mixed layouts:
private layoutContainer(node, config) {
  const nodeConfig = this.resolveNodeConfig(node);

  if (nodeConfig.layoutStrategy === 'force') {
    // Delegate this subtree to force engine
    const forceEngine = this.getEngine('force-directed');
    const subtreeGraph = this.extractSubtree(node);
    const result = forceEngine.layout(subtreeGraph, options);
    return this.mergeSubtreeResult(node, result);
  }

  // Default: grid layout
  return this.applyAdaptiveGrid(node, children, metrics);
}
```

### 3. **Renderer Selection is Hardcoded**

**Current:** Binary switch (containment vs flat) in runtime-canvas.component.ts:632

```typescript
const initialRenderer = initialViewConfig.containmentMode === 'containers'
  ? this.containmentRenderer
  : this.flatRenderer;
```

**Needed:** Per-node renderer dispatch

```typescript
class CompositeRenderer implements IRenderer {
  private renderers = new Map<string, IRenderer>();

  render(ctx, nodes, edges, camera) {
    nodes.forEach(node => {
      const rendererType = node.metadata?.['renderer'] ?? 'default';
      const renderer = this.renderers.get(rendererType) ?? this.defaultRenderer;
      renderer.renderNode(ctx, node, camera);
    });
  }
}
```

### 4. **Config Propagation Stops at Engine Boundary**

**Current flow:**
```
RuntimeViewConfig (global)
  → LayoutRuntime.runtimeConfig
  → runLayout() merges into engineOptions (layout-runtime.ts:167-172)
  → Engine receives as options.engineOptions
```

**Gap:** Per-node configs aren't in this flow

---

## 📋 Extensibility Roadmap

### **Phase 1: Wire Up Existing Infrastructure** (LOW effort, HIGH value)

1. **Instantiate NodeConfigManager in LayoutRuntime**
```typescript
export class CanvasLayoutRuntime {
  private nodeConfigManager = new NodeConfigManager();

  setNodeLayoutConfig(nodeId: string, config: NodeLayoutConfig) {
    this.nodeConfigManager.setNodeConfig(nodeId, config);
    // Trigger layout for affected subtree
  }
}
```

2. **Pass NodeConfigManager to Engine**
```typescript
// In runLayout():
const result = await this.workerBridge.run(this.canvasId, baseGraph, {
  ...options,
  engineOptions: {
    ...engineOptions,
    nodeConfigManager: this.nodeConfigManager  // ← Add this
  }
});
```

3. **Engine Checks Node Configs**
```typescript
// In containment-runtime-layout.engine.ts:
private layoutContainer(node, metrics, globalConfig, nodeConfigManager?) {
  let effectiveConfig = globalConfig;

  if (nodeConfigManager) {
    const resolved = nodeConfigManager.getResolvedConfig(node, parentConfig);
    effectiveConfig = this.mergeConfigs(resolved, globalConfig);
  }

  // Use effectiveConfig for THIS node
  if (effectiveConfig.layoutStrategy === 'grid') {
    this.applyAdaptiveGrid(node, children, metrics);
  }
}
```

### **Phase 2: Multi-Engine Support** (MEDIUM effort)

1. **Engine Registry in LayoutEngine**
```typescript
export class ContainmentRuntimeLayoutEngine {
  private engines = new Map<string, LayoutEngine>();

  registerSubEngine(name: string, engine: LayoutEngine) {
    this.engines.set(name, engine);
  }

  private layoutContainer(node, ...) {
    const nodeConfig = this.resolveNodeConfig(node);

    if (nodeConfig.layoutStrategy !== 'grid') {
      // Delegate to specialized engine
      const delegateEngine = this.engines.get(nodeConfig.layoutStrategy);
      if (delegateEngine) {
        return this.delegateSubtree(node, delegateEngine, nodeConfig);
      }
    }

    // Fallback: grid
    return this.applyAdaptiveGrid(node, children, metrics);
  }
}
```

2. **Subtree Extraction & Merging**
```typescript
private delegateSubtree(node, engine, config): HierarchicalNode {
  // Convert node + children to LayoutGraph
  const subtreeGraph = this.nodeToLayoutGraph(node);

  // Run delegated engine
  const result = engine.layout(subtreeGraph, {
    reason: 'subtree-delegation',
    engineOptions: config.layoutOptions
  });

  // Convert result back to HierarchicalNode, merge into parent
  return this.layoutGraphToNode(result.graph);
}
```

### **Phase 3: Per-Node Renderer Dispatch** (MEDIUM effort)

1. **Composite Renderer Pattern**
```typescript
export class CompositeRenderer implements IRenderer {
  private renderers = new Map<string, IRenderer>();
  private defaultRenderer: IRenderer;

  registerRenderer(type: string, renderer: IRenderer) {
    this.renderers.set(type, renderer);
  }

  render(ctx, nodes, edges, camera) {
    this.renderNodes(ctx, nodes, camera);
    this.renderEdges(ctx, edges, camera);
  }

  private renderNodes(ctx, nodes, camera, parentOffset = {x:0, y:0}) {
    nodes.forEach(node => {
      const rendererType = node.metadata?.['rendererType'] ?? 'default';
      const renderer = this.renderers.get(rendererType) ?? this.defaultRenderer;

      renderer.renderNode(ctx, node, camera, parentOffset);

      if (node.children && !node.collapsed) {
        this.renderNodes(ctx, node.children, camera, {
          x: parentOffset.x + node.x,
          y: parentOffset.y + node.y
        });
      }
    });
  }
}
```

2. **Renderer Interface Extension**
```typescript
interface IRenderer {
  render(ctx, nodes, edges, camera): void;        // Full scene
  renderNode?(ctx, node, camera, offset): void;   // Single node (new)
  renderEdge?(ctx, edge, camera): void;           // Single edge (new)
  // ... existing methods
}
```

---

## 🎯 Recommended Approach

### **Immediate: Wire Up NodeConfigManager** (2-4 hours)

**Benefits:**
- Per-node layout options work immediately
- Reuses existing tested infrastructure
- No breaking changes

**Steps:**
1. Add `nodeConfigManager` to CanvasLayoutRuntime
2. Expose `setNodeLayoutConfig(nodeId, config)` API
3. Pass to engine via engineOptions
4. Engine checks `node.layoutConfig` and applies

### **Short-term: Add Force & Tree Engines** (4-8 hours)

Create minimal implementations:

```typescript
// force-directed-engine.ts
export class ForceDirectedEngine implements LayoutEngine {
  layout(graph, options) {
    const nodes = Object.values(graph.nodes);

    // Simple force simulation
    for (let i = 0; i < 100; i++) {
      this.applyForces(nodes, graph.edges);
    }

    return { graph: this.nodesToGraph(nodes) };
  }
}

// tree-layout-engine.ts
export class TreeLayoutEngine implements LayoutEngine {
  layout(graph, options) {
    const roots = this.findRoots(graph);
    roots.forEach(root => this.layoutTreeRecursive(root, 0, 0));
    return { graph: this.nodesToGraph(roots) };
  }
}
```

Register and use via NodeConfigManager.

### **Medium-term: Composite Renderer** (8-12 hours)

Replace hardcoded `containmentRenderer`/`flatRenderer` with:

```typescript
const compositeRenderer = new CompositeRenderer();
compositeRenderer.registerRenderer('containment', new RuntimeContainmentRenderer());
compositeRenderer.registerRenderer('flat', new RuntimeFlatRenderer());
compositeRenderer.registerRenderer('compact', new CompactNodeRenderer());

// Nodes specify renderer via metadata
node.metadata['rendererType'] = 'compact';
```

---

## 📐 Architecture Quality Assessment

### **Score: 7/10** (Good foundation, needs wiring)

**Pros:**
- ✅ ViewGraph eliminates cloning overhead
- ✅ Clean engine interface
- ✅ Per-node config infrastructure exists
- ✅ Cascade logic implemented
- ✅ Immutable dataset preserved
- ✅ Save/load works

**Cons:**
- ❌ NodeConfigManager not used (orphaned code)
- ❌ Global config only (per-node ignored)
- ❌ Single engine processes entire graph
- ❌ Binary renderer selection
- ❌ `normaliseEngineName` has dead code for removed engines

### **Immediate Cleanup Opportunities:**

1. **Remove dead normaliseEngineName aliases** (layout-runtime.ts:257-286)
   - References `tree`, `force-directed`, `orthogonal`, `containment-grid` engines that don't exist
   - Should only have `containment-runtime` case

2. **Remove node-config-manager.ts** (218 lines)
   - OR wire it up properly
   - Currently orphaned

3. **Simplify ComponentFactory** (component-factory.ts:115 lines)
   - Now only creates runtime renderers
   - Could be 10-line factory

---

## 🔧 Concrete Extension Example

**Goal:** Apply force-directed layout to a specific node and descendants

### Step 1: Enable Per-Node Config (30 min)

```typescript
// In your UI or via API:
const runtime = engine.getLayoutRuntime();
runtime.setNodeLayoutConfig('parent-node-guid', {
  layoutStrategy: 'force',
  layoutOptions: { forceStrength: 0.8 },
  applyToDescendants: true
});

runtime.runLayout();
```

### Step 2: Engine Reads Config (1 hour)

```typescript
// In containment-runtime-layout.engine.ts:
private layoutContainer(node, metrics, globalConfig, configManager?) {
  let strategy = globalConfig.layoutMode; // Default: 'grid'

  if (configManager) {
    const resolved = configManager.getResolvedConfig(node);
    strategy = resolved.layoutStrategy;
  }

  if (strategy === 'force') {
    return this.applyForceLayout(node, children, metrics);
  } else if (strategy === 'tree') {
    return this.applyTreeLayout(node, children, metrics);
  }

  // Default: grid
  return this.applyAdaptiveGrid(node, children, metrics);
}
```

### Step 3: Implement Layout Algorithms (2-4 hours each)

```typescript
private applyForceLayout(parent, children, metrics) {
  // Simple force-directed for children
  const simulation = new ForceSimulation(children);
  simulation.run(100); // iterations

  // Fit within parent bounds
  this.scaleToFit(children, parent, metrics);

  parent.children = children;
  return parent;
}

private applyTreeLayout(parent, children, metrics) {
  // Vertical tree layout
  let yOffset = metrics.padding;
  children.forEach((child, i) => {
    child.x = metrics.padding;
    child.y = yOffset;
    yOffset += child.height + metrics.gap;
  });

  parent.children = children;
  return parent;
}
```

---

## 🚀 Recommended Next Steps

### **Option A: Minimal (Keep Clean)**
1. Remove `node-config-manager.ts` (not used, 218 lines)
2. Simplify `component-factory.ts` (now trivial, could be 10 lines)
3. Clean up `normaliseEngineName` dead code
4. **Result:** Ultra-lean runtime system (~9,200 lines)

### **Option B: Enable Extensibility (Activate Existing Code)**
1. Wire up `NodeConfigManager` in `LayoutRuntime`
2. Pass `configManager` to engine via `engineOptions`
3. Engine checks `node.layoutConfig` during layout
4. Add force/tree layout methods to `containment-runtime-layout.engine.ts`
5. **Result:** Per-node layouts work with existing infrastructure

### **Option C: Full Composability (More Work)**
1. Do Option B
2. Create separate `ForceLayoutEngine`, `TreeLayoutEngine`
3. Implement subtree delegation in `ContainmentRuntimeLayoutEngine`
4. Create `CompositeRenderer` for per-node rendering
5. **Result:** Fully composable system

---

## 💡 My Recommendation

**Start with Option B** - it leverages the excellent `NodeConfigManager` infrastructure that already exists and is well-designed.

**Time to working per-node layouts:** ~4 hours

**Key insight:** The hard work (cascade resolution, config inheritance, cache invalidation) is **already done**. You just need to:
1. Instantiate `NodeConfigManager` in `LayoutRuntime`
2. Pass it to the engine
3. Engine reads `node.layoutConfig`
4. Implement 2-3 layout algorithms (force, tree, grid)

Then you can say:
```typescript
node.layoutConfig = { layoutStrategy: 'force', applyToDescendants: true };
```

And it cascades to all descendants automatically.

---

## 📊 Code Quality Metrics

**After refactor:**
- **Removed:** 8,000+ lines of legacy code
- **Kept:** 9,700 lines of core runtime
- **Unused:** ~400 lines (node-config-manager, parts of component-factory)
- **Potential savings:** Another 300-500 lines if you remove unused bits

**Composition Score:**
- Engine pluggability: **9/10** (excellent)
- Renderer pluggability: **5/10** (hardcoded binary switch)
- Per-node config: **8/10** (infrastructure exists, not wired)
- Data flow clarity: **9/10** (ViewGraph is crystal clear)

**Overall: Ready for extension** with minimal wiring work.
