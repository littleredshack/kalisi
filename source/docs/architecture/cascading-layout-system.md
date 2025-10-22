# Cascading Layout & Rendering System (Overlay Architecture)

This document supersedes earlier drafts. The runtime must guarantee that Neo4j graph data stays canonical, while view-specific configuration and styling are managed through explicit overlays that can cascade across the hierarchy.

## Core Requirements

1. **Canonical Data Integrity** – Snapshot fetched from Neo4j (and realtime deltas) lives in the layout runtime store untouched by UI mutations.
2. **Overlay-Driven Customisation** – All user and system overrides (layout mode, containment, styling, visibility) are represented as overlays instead of modifying the base graph.
3. **Cascading Configuration** – Overlays cascade through the graph (global → subtree → node) with inheritance/stop rules similar to CSS.
4. **Runtime-First Stack** – Every layout/rendering mode runs through the containment runtime engine, consuming overlays to determine behaviour.
5. **Realtime Friendly** – Incoming deltas update only canonical data; overlays persist until explicitly changed.

## Runtime Data Flow

```
 Neo4j Snapshot / Realtime Delta
            │
            ▼
   Canonical Graph Store (immutable)
    - CanvasLayoutRuntime.modelData
    - GraphStore (layout-runtime)
            │
   Overlay Store (user/system overrides)
    - Style, layout, containment, visibility
    - Cascade-aware resolution
            │
            ▼
 Layout + Presentation Pipeline
    1. Resolve effective config for each node/edge
    2. Run layout engine with resolved config
    3. Build presentation frame
    4. Apply overlay styling metadata
            │
            ▼
   Renderers draw final scene
```

## Overlay Model

Overlays describe how the view should differ from the canonical graph.

```typescript
type OverlayScope = 'global' | 'subtree' | 'node';

interface OverlayPatch {
  id: string;                     // GUID for node or edge (or 'global')
  scope: OverlayScope;
  style?: Partial<NodeStyleOverrides>;
  edgeStyle?: Partial<EdgeStyleOverrides>;
  layout?: Partial<NodeLayoutConfig>;  // layout strategy, options, etc.
  containmentMode?: 'containers' | 'flat' | 'inherit';
  visibility?: 'visible' | 'hidden' | 'inherit';
  stopCascade?: boolean;          // stop inheritance below this patch
  updatedAt: number;
  author: 'user' | 'system';
}
```

### Overlay Store

`OverlayStore` maintains three collections:
- `globalPatch` – optional default for entire view.
- `nodePatches` – map keyed by GUID for node-specific overlays.
- `edgePatches` – map keyed by edge GUID.

Patches are immutable record objects. New changes produce new patches (no in-place mutations) to enable time-travel/history if required.

### Overlay Resolution

`OverlayResolver` computes the effective configuration for a node/edge.

```typescript
interface ResolvedNodeProfile {
  layout: ResolvedLayoutConfig;        // strategy + options
  containmentMode: 'containers' | 'flat';
  style: NodeStyleSnapshot;            // fill, stroke, icon, etc.
  visibility: 'visible' | 'hidden';
}
```

Resolution steps:
1. Start with global defaults.
2. Apply ancestor subtree patches in order, respecting `stopCascade`.
3. Apply node patch (scope `node`).
4. Produce final profile; flags with `inherit` fall back to previous value.

For edges, the resolver determines `style`, `visibility`, and other metadata.

Overlay resolution happens twice:
- **Layout Phase** – engine receives per-node layout/containment configuration (`layout`, `containmentMode`).
- **Presentation Phase** – node/edge styling and visibility applied to rendered `canvasData`.

## Updated Layout + Presentation Pipeline

1. **Canonical snapshot** – retrieved from `CanvasLayoutRuntime.modelData` (clone).
2. **Resolve configs** – `OverlayResolver` builds `ResolvedNodeProfile` per GUID.
3. **Run layout** – `ContainmentRuntimeLayoutEngine` (and future strategies) use resolved profiles:
   - If node’s containment is `containers`, enforce parent bounds.
   - If `flat`, treat node as independent.
   - Layout strategy/parameters derived from overlay.
4. **Build presentation frame** – `buildPresentationFrame` constructs `CanvasData` from layout result.
5. **Apply styling overlay** – final pass merges `ResolvedNodeProfile.style`, `visibility`, and edge overlays.
6. **Render** – `RuntimeContainmentRenderer` / `RuntimeFlatRenderer` respect metadata without mutating canonical data.

## Editor Integration

- **Node Style Panel** – calls `OverlayService.applyNodeStyle(guid, overrides)`. Service writes a `node` patch and emits overlay change event.
- **Containment Toggle** – updates `globalPatch` (`containmentMode`) or targeted node patch. Triggers re-layout because layout resolver sees new configuration.
- **Preset/Save** – overlay state serialised with view presets and persisted with `CanvasViewStateService`.
- **History/Undo** – overlay change feed can be recorded by `canvasHistoryService`, enabling undo without touching canonical graph.

## Realtime Updates

1. Delta updates canonical store only (add/remove nodes, edges).
2. After delta applied, overlay resolver recomputes profiles. New nodes inherit overlays from nearest ancestor (subtree patch) or global defaults.
3. Removed nodes automatically drop overlay patches (garbage-collect entries with missing GUID to keep store clean).

## Implementation Plan

### Phase 1 – Overlay Infrastructure
1. Introduce `OverlayStore`, `OverlayPatch`, `ResolvedNodeProfile`, `ResolvedEdgeProfile` types under `frontend/src/app/shared/canvas/overlay`.
2. Implement `OverlayResolver` with cascade logic and memoisation for performance.
3. Add `OverlayService` (Angular injectable) to manage overlay state, persistence hooks, and change observables.

### Phase 2 – Layout Runtime Integration
1. Extend `CanvasLayoutRuntime` to accept an overlay reference (`setOverlayStore`). Store remains immutable; runtime queries it during layout/presentation.
2. Modify `runLayout` to pass resolved node config to engines (containment mode, layout strategy).
3. Update `buildPresentationFrame` to call overlay resolver for styling/visibility application.

### Phase 3 – Renderer + Controller Updates
1. Update `RuntimeContainmentRenderer` and `RuntimeFlatRenderer` to assume incoming `CanvasData` already contains overlay-applied metadata. Remove mutation hooks.
2. Refactor `RuntimeCanvasController.applyNodeStyleOverride` to call `OverlayService` instead of mutating nodes.
3. Adjust containment toggle and layout panel controls to use overlay updates.

### Phase 4 – Persistence & Realtime
1. Update `CanvasViewStateService` and preset manager to serialize overlay snapshots.
2. Wire realtime delta handler to drop overlay patches for removed GUIDs and inherit defaults for newly added nodes.
3. Ensure undo/redo captures overlay changes.

### Phase 5 – Testing & Validation
1. Unit tests for overlay resolution (inheritance, stopCascade, performance).
2. Integration tests verifying layout/resolution interplay (containment vs flat, layout overrides).
3. End-to-end tests: user styles node, toggles containment, style persists; realtime delta doesn’t remove custom styling.

This architecture ensures the canonical graph remains pristine, user customisations cascade predictably, and the containment system scales to complex, mixed-mode layouts.

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
