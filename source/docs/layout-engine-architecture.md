# Layout Engine Architecture - Clean Design

## Overview

The containment layout engine is structured for easy extension and maintenance. This document explains the clean architecture and how to add new layout strategies.

## Core Principles

### 1. Single Source of Truth
**ViewState contains ALL visual/layout configuration**
```typescript
interface ViewState {
  layout: {
    global: RuntimeViewConfig;        // Global defaults
    perNode?: Record<string, NodeLayoutConfig>; // Per-node overrides
  }
}
```

### 2. Observer Pattern
```
ViewState change
  → Observable fires
  → Layout engine runs
  → Render updates
```

### 3. Data Separation
- **GraphDataSet** = Data only (entities, relationships, properties)
- **ViewState** = Visual only (positions, sizes, configs, states)

## Clean Method Structure

### Main Entry Point: `layoutContainer()`

**Responsibility:** Orchestration only
```typescript
private layoutContainer(...): HierarchicalNode {
  // 1. Early exits (no children, collapsed)
  if (!node.children || isCollapsed) { return default; }

  // 2. Resolve configuration (global + per-node)
  const effectiveConfig = this.resolveEffectiveConfiguration(node, config, nodeConfigManager);

  // 3. Delegate to appropriate handler
  if (effectiveConfig.containmentMode === 'flat') {
    return this.layoutNodeAsFlat(...);
  } else {
    return this.layoutNodeAsHierarchical(...);
  }
}
```

**Benefits:**
- Clear flow
- No nested conditionals
- Delegates to specialized methods

### Configuration Resolution: `resolveEffectiveConfiguration()`

**Responsibility:** Merge global config with per-node overrides
```typescript
private resolveEffectiveConfiguration(
  node: HierarchicalNode,
  globalConfig: EngineRuntimeConfig,
  nodeConfigManager?: NodeConfigManager
): { containmentMode: 'containers' | 'flat'; layoutMode: 'grid' | 'force' | 'tree' }
```

**Input:** Node + global config + optional overrides
**Output:** Resolved effective config
**Logic:** Apply CSS-like cascade (per-node overrides global)

### Flat Mode: `layoutNodeAsFlat()`

**Responsibility:** Flatten hierarchy and generate CONTAINS edges
```typescript
private layoutNodeAsFlat(...): HierarchicalNode {
  // 1. Flatten hierarchy and extract edges
  const flatResult = flattenHierarchyWithEdges(visibleChildren, hiddenByCollapse);

  // 2. Apply grid layout
  this.applyGridLayoutToNodes(flatResult.nodes, metrics);

  // 3. Collect edges
  if (containsEdgeCollector) {
    containsEdgeCollector.push(...flatResult.containsEdges);
  }

  // 4. Resize parent and return
  LayoutPrimitives.resizeToFitChildren(result, ...);
  return result;
}
```

### Hierarchical Mode: `layoutNodeAsHierarchical()`

**Responsibility:** Nested containment with recursive layout
```typescript
private layoutNodeAsHierarchical(...): HierarchicalNode {
  // 1. Recursively layout children
  const laidOutChildren = visibleChildren.map(child => this.layoutContainer(...));

  // 2. Apply layout strategy
  this.applyLayoutStrategy(result, laidOutChildren, metrics, effectiveConfig.layoutMode);

  // 3. Resize parent and return
  LayoutPrimitives.resizeToFitChildren(result, ...);
  return result;
}
```

### Strategy Pattern: `applyLayoutStrategy()`

**Responsibility:** Dispatch to appropriate layout algorithm
```typescript
private applyLayoutStrategy(
  parent: HierarchicalNode,
  children: HierarchicalNode[],
  metrics: ContainmentMetrics,
  strategy: 'grid' | 'force' | 'tree'
): void {
  switch (strategy) {
    case 'grid':
      this.applyAdaptiveGrid(parent, children, metrics);
      break;
    case 'force':
      this.applyForceDirectedLayout(parent, children, metrics);
      break;
    case 'tree':
      this.applyTreeLayout(parent, children, metrics);
      break;
  }
}
```

**Extension Point:** Adding new layout strategies is a single switch case

## How to Add Force-Directed Layout

### Step 1: Implement the algorithm method
```typescript
private applyForceDirectedLayout(
  parent: HierarchicalNode,
  children: HierarchicalNode[],
  metrics: ContainmentMetrics
): void {
  // Force-directed algorithm implementation
  // Position children using physics simulation
  // Updates child.x and child.y in place
}
```

### Step 2: Add switch case
```typescript
case 'force':
  this.applyForceDirectedLayout(parent, children, metrics);
  break;
```

### Step 3: Update types
```typescript
interface EngineRuntimeConfig {
  readonly layoutMode: 'grid' | 'force' | 'tree' | 'circular'; // Add new mode
}
```

**That's it!** No changes to:
- Main orchestration logic
- Config resolution
- Flat/hierarchical branching
- Edge generation

## Method Responsibilities (Single Responsibility Principle)

| Method | Lines | Responsibility |
|--------|-------|----------------|
| `layoutContainer()` | 44 | Orchestrate layout flow |
| `resolveEffectiveConfiguration()` | 28 | Merge configs |
| `layoutNodeAsFlat()` | 32 | Handle flat mode |
| `layoutNodeAsHierarchical()` | 29 | Handle hierarchical mode |
| `applyLayoutStrategy()` | 21 | Dispatch to algorithm |
| `applyGridLayoutToNodes()` | 14 | Grid algorithm |

**Total:** 168 lines (was 110 in one method)
**Benefit:** Each method is self-contained and testable

## Key Interfaces

### Input to Layout Engine
```typescript
graph: LayoutGraph
options: {
  engineOptions: {
    containmentMode: 'containers' | 'flat';
    layoutMode: 'grid' | 'force' | 'tree';
    nodeConfigManager: NodeConfigManager;  // Facade over ViewState
  }
}
```

### Output from Layout Engine
```typescript
LayoutResult {
  graph: LayoutGraph;  // With positioned nodes
  diagnostics: { metrics: { ... } };
}
```

### Per-Node Config Contract
```typescript
NodeLayoutConfig {
  layoutStrategy?: 'grid' | 'force' | 'tree' | 'manual' | 'inherit';
  renderStyle?: {
    nodeMode?: 'container' | 'flat' | 'compact' | 'inherit';
  }
}
```

## Data Flow (Clean Architecture)

```
User changes Node 1 to Flat via Layout Panel
  ↓
CanvasControlService.setNodeContainmentMode()
  ↓
EventHub emits NodeConfigChanged
  ↓
RuntimeCanvasComponent receives event
  ↓
NodeConfigManager.setNodeConfig()
  ↓
Updates ViewState.layout.perNode['node-1']
  ↓
ViewState observable fires
  ↓
loadGraphDataSet() (preserves visual state)
  ↓
runLayout() with ViewState.layout.perNode
  ↓
ContainmentRuntimeLayoutEngine.layout()
  ↓
  for each node:
    resolveEffectiveConfiguration() → { containmentMode: 'flat' }
    layoutNodeAsFlat() → flatten + generate edges
  ↓
Render with CONTAINS edges
```

## Extension Guidelines

### Adding a New Layout Strategy

1. **Implement algorithm method:**
   ```typescript
   private applyXxxLayout(parent, children, metrics): void
   ```

2. **Add to switch statement:**
   ```typescript
   case 'xxx':
     this.applyXxxLayout(parent, children, metrics);
     break;
   ```

3. **Update types:**
   ```typescript
   layoutMode: 'grid' | 'force' | 'tree' | 'xxx';
   ```

### Adding a New Containment Mode

1. **Update ViewState interface:**
   ```typescript
   nodeMode?: 'container' | 'flat' | 'compact' | 'newmode';
   ```

2. **Add handler method:**
   ```typescript
   private layoutNodeAsNewMode(...): HierarchicalNode
   ```

3. **Add branch in layoutContainer:**
   ```typescript
   if (effectiveConfig.containmentMode === 'newmode') {
     return this.layoutNodeAsNewMode(...);
   }
   ```

## Testing Strategy

Each extracted method can be unit tested independently:
- `resolveEffectiveConfiguration()` - config merging logic
- `layoutNodeAsFlat()` - flattening + edge generation
- `layoutNodeAsHierarchical()` - recursive layout
- `applyLayoutStrategy()` - strategy dispatch

## Maintainability Checklist

✅ Single Responsibility - Each method does one thing
✅ Clear Naming - Method names describe what they do
✅ No Deep Nesting - Max 2 levels of indentation
✅ Strategy Pattern - Easy to add algorithms
✅ Dependency Injection - NodeConfigManager passed in
✅ Immutable by Default - ViewState updates create new objects
✅ Observable Pattern - Automatic re-renders
✅ Documented Extension Points - Clear how to add features

## Common Pitfalls to Avoid

❌ Don't mutate node objects directly
❌ Don't add config logic to layoutNodeAsFlat/Hierarchical
❌ Don't bypass ViewState for per-node configs
❌ Don't add layout strategy code outside applyLayoutStrategy()

✅ Do create new objects via spread
✅ Do use resolveEffectiveConfiguration() for all config
✅ Do update ViewState for all layout changes
✅ Do add new strategies via switch case
