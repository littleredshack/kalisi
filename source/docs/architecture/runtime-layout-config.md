# Runtime Layout & Rendering Configuration

## Intent
- Treat the containment runtime pipeline as the single surviving code path for every canvas view.
- Allow runtime consumers to toggle containment visuals, switch layout strategies (grid vs. force), and choose edge routing without swapping away from the runtime engine.
- Keep the orchestration surface area small: one runtime engine, multiple renderer modes, driven by a shared configuration object.

## Current Baseline
- The runtime orchestrator (`frontend/src/app/shared/canvas/layout-runtime.ts`) already owns data normalisation, engine dispatch, and presentation frames.
- `ContainmentRuntimeLayoutEngine` (`frontend/src/app/shared/layouts/engines/containment-runtime-layout.engine.ts`) collapses CONTAINS edges into hierarchy, sizes parents, and removes containment relationships from the rendered edge list.
- The runtime renderer (`frontend/src/app/shared/composable/renderers/runtime-containment-renderer.ts`) assumes children remain inside parents and hides containment links.
- Properties Panel exposes an “Enable containment nesting” checkbox, but it does not send any command to the runtime controller. Layout switching only changes engines.

## Design Pillars
1. **Runtime-first:** every layout/rendering mode is a configuration of the runtime engine stack; legacy composable engines stay only as helpers.
2. **Separate concerns:** layout strategy (grid vs force) and render mode (containment vs flat) are orthogonal toggles.
3. **Single façade:** `CanvasControlService` exposes declarative setters; UI panels listen to observable state.
4. **Renderer flexibility:** runtime engines emit geometry once, renderers interpret it (containers vs flat nodes, orthogonal vs straight edges).

## Configuration Surface
```ts
interface RuntimeViewConfig {
  containmentMode: 'containers' | 'flat';
  layoutMode: 'grid' | 'force';
  edgeRouting: 'orthogonal' | 'straight';
}
```

- Stored in `CanvasLayoutRuntime` and forwarded to engines/renderers via `runLayout(engineOptions)`.
- Default derived from view metadata (containment containers + grid).
- Switching any field should invalidate caches but not rebuild engines.

## Engine Responsibilities
### Containment Runtime Engine
- Continue to own hierarchical layout when `containmentMode === 'containers'`.
- When `containmentMode === 'flat'`:
  - Skip `LayoutPrimitives.resizeToFitChildren`; do not clamp children inside parents.
  - Preserve CONTAINS edges in the edge list; nodes can remain in a hierarchy internally but renderers treat them as flat.
  - Emit world coordinates for every node so renderers can display them without nesting.
- Respect `layoutMode`:
  - `grid`: reuse current adaptive stack positioning.
  - `force`: delegate to shared force primitives (`Frontend/src/app/shared/layouts/engines/force-layout.engine.ts`) after flattening hierarchy.
- Expose world-position metadata for both modes to keep drags and incremental updates consistent.

### Layout Primitives
- Accept runtime config flags (containment vs flat) so functions such as `clampChildWithinParent` can noop in flat mode.
- Share force/grid helpers across engines to avoid duplication.

## Renderer Responsibilities
- `runtime-containment-renderer`: unchanged; renders containers and hides containment edges.
- New `runtime-flat-renderer`:
  - Wrap the composable flat primitives (`frontend/src/app/shared/composable/renderers/composable-flat-renderer.ts`) so runtime metadata (badges, style overrides) flow through unchanged.
  - Display CONTAINS edges with orthogonal routing; when `edgeRouting === 'straight'`, bypass routing service.
- Renderer choice is part of `PresentationFrame` metadata so the canvas controller can redraw without re-running layout when only render style changes.

## Control Panel Integration
- Add a dedicated “Layout & Rendering” block in the Properties panel.
- Bind toggles to new `CanvasControlService` methods:
  - `setContainmentMode(mode: 'containers' | 'flat')`
  - `setLayoutMode(mode: 'grid' | 'force')`
  - `setEdgeRouting(mode: 'orthogonal' | 'straight')`
- Service publishes the config over `CanvasEventHubService`, ensuring the runtime controller in the worker/main thread receives updates.
- Observables (e.g., `containmentMode$`, `layoutMode$`) keep the panel in sync with external changes (presets, assistant commands).

## Cascading Configuration Model
- Each `HierarchicalNode` receives an optional `layoutConfig` metadata block describing local overrides.
- Resolution walk:
  1. Start at roots with the global `RuntimeViewConfig`.
  2. For each node, merge parent config with local overrides; default for each key is `inherit`.
  3. When a node sets `applyToDescendants = true`, its resolved config locks in for the entire subtree unless a deeper node explicitly overrides.
- Types:
  ```ts
  interface NodeLayoutConfig {
    layoutMode?: 'inherit' | 'grid' | 'force';
    renderMode?: 'inherit' | 'containers' | 'flat';
    edgeRouting?: 'inherit' | 'orthogonal' | 'straight';
    applyToDescendants?: boolean;
  }

  interface ResolvedNodeConfig {
    layoutMode: 'grid' | 'force';
    renderMode: 'containers' | 'flat';
    edgeRouting: 'orthogonal' | 'straight';
  }
  ```
- `CanvasLayoutRuntime` computes a resolved config map before invoking engines; layout tasks can partition nodes by `layoutMode` while renderers consult per-node `renderMode`.
- Downstream systems (dragging, selection) read the resolved config to maintain consistent behaviour when users mix containers and flat nodes within the same graph.

### Node-Level UX
- When a node is selected, the Properties panel shows effective layout/render settings, indicating inheritance vs override.
- UI actions:
  - “Set layout mode” dropdown (`inherit`, `grid`, `force`).
  - “Set render mode” dropdown (`inherit`, `containers`, `flat`).
  - “Apply to descendants” toggle.
  - “Reset to inherit” button to remove local overrides.
- Commands flow through `CanvasControlService.setNodeLayoutConfig(nodeId, config)` which updates a runtime store and emits an event so the orchestrator recomputes configs and re-runs layouts where necessary.

### Engine Execution with Cascades
- Build partitions of nodes requiring the same layout mode. For example, run grid on the top-level containment subtree, then force-layout a nested subgraph that overrides the mode.
- Merge results by translating child partition coordinates into the parent coordinate system, preserving world metadata so the renderer remains agnostic.
- Renderers resolve on a per-node basis whether to draw containers (respecting padding/clamping) or flat nodes (show CONTAINS edges), using the same geometry produced by the layouts.

## Implementation Steps
1. **Runtime config plumbing**
   - Extend `CanvasLayoutRuntime` to store `RuntimeViewConfig`, include it in `runLayout` calls, and expose getters/observables.
   - Update `LayoutModuleRegistry` descriptors so the `containment-runtime` module advertises both renderer ids (`runtime-containment-renderer`, `runtime-flat-renderer`).
2. **Engine updates**
   - Accept `engineOptions` inside `ContainmentRuntimeLayoutEngine.layout`.
   - Flatten hierarchy + retain containment edges when requested.
   - Share grid/force helpers from `LayoutPrimitives`.
3. **Renderers**
   - Implement `runtime-flat-renderer` leveraging existing flat primitives.
   - Update containment renderer to read the config for edge routing when needed.
4. **Control service & panel**
   - Add config setters/getters to `CanvasControlService`.
   - Wire panel UI to new observables; replace the dormant containment checkbox with active toggles/selectors.
5. **Cascading overrides**
    - Create a `NodeLayoutConfigStore` that maps node GUIDs to overrides and exposes resolved configs.
    - Extend runtime orchestration to recompute resolved configs on changes and batch layout runs per partition.
    - Persist overrides (optional) alongside layouts so user choices survive reload.
5. **Testing**
   - Unit test engine outputs for both modes (containment edges present/absent, node positions stable).
   - Snapshot render tests to verify edge routing and node visibility.
   - Manual smoke: flip containment on/off, switch grid/force, confirm runtime logs show single engine id.
    - Add tests for cascading resolution (inheritance, apply-to-descendants, reset) and mixed-mode rendering.

## Outcome
- Containment runtime remains the sole engine surface.
- Users can toggle containment visuals and layouts without leaving the runtime path.
- Node-level overrides allow any combination of layout/render options with predictable cascading behaviour.
- Future layouts (timelines, swimlanes) become further `RuntimeViewConfig` options instead of new engines.
