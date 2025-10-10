# Session: Code Model Canvas Debugging (2025-10-10)

## User Goals
- Restore the Code Model canvas view, which rendered blank despite queries returning thousands of nodes.
- Ensure Angular build artifacts deploy reliably so the gateway serves current bundles.
- Diagnose and resolve cross-canvas interference that was pushing the Code Model viewport off-screen.

## What Was Done
1. **Rebuilt and Sanitised Assets**
   - Cleared old hashed bundles and pointed `angular.json` outputPath directly at `/workspace/runtime/frontend/dist`.
   - Rebuilt Angular multiple times, ensuring `index.html` references the latest `styles`, `runtime`, `polyfills`, and `main` hashes.
   - Removed stale bundles (e.g., `main.b231…`) so MIME errors disappeared.

2. **Instrumented Rendering Path**
   - Added temporary logs and overlays in `ComposableHierarchicalCanvasEngine` and `HierarchicalNodePrimitive` to confirm the renderer executed and to inspect screen-space bounds.
   - Verified the engine rendered the root node at `(x: 50, y: 50)` with size `≈ 993 × 400` but it later ended up off-screen (`screenY: -32992`), which hinted at external camera mutations.
   - Removed all debug visuals once diagnostics were complete.

3. **Isolated Canvas State per View**
   - Refactored `CanvasViewStateService` to store snapshots/mutations by `canvasId` and expose `getCanvasData$(canvasId)`.
   - Updated `ComposableHierarchicalCanvasEngine` to accept a `canvasId`, subscribe only to its own state stream, and publish back with the same `canvasId`.
   - Updated `DynamicLayoutService` so it reads the originating `canvasId`, clones that canvas' state, and publishes reflow results back to the same channel.
   - Set each `ModularCanvasComponent` instance's `canvasId` to the current ViewNode id, so different views never cross-pollinate camera/layout updates.

4. **Cleaned Repository**
   - Removed obsolete local scripts (`test_agent*.sh`, `test_files*.sh`, `test_tree_agent.rs`).
   - Committed changes as `de8c4f1 Isolate canvas state per view` and pushed to `origin/main`.

## What I Learned About the Codebase
- **Observer Model**: Canvas engines publish full state snapshots to `CanvasViewStateService`; other collaborators (like `DynamicLayoutService`) react to mutations and issue derived updates. Before today, this service acted as a global singleton without `canvasId`, allowing one engine’s camera to overwrite another’s.
- **Rendering Pipeline**: 
  - ViewNode → `ComponentFactory` selects layout + renderer.
  - `LayoutEngineAdapter` + `GridLayoutService` produce the hierarchy (many nodes nested under a single root).
  - `ComposableHierarchicalCanvasEngine` creates the renderer, wires shared state, applies collapse/default hierarchy, and renders via `ComposableContainmentOrthogonalRenderer` + `HierarchicalNodePrimitive`.
  - Previously, all canvases shared the same state bus; now each uses a dedicated channel keyed by `canvasId`.
- **Persisted View State**: The database stores ViewNode `layout` JSON and `autoLayoutSettings` (collapse/reflow). Those are separate from the runtime `CanvasViewStateService`; DB state is only restored on explicit save/load, while the service handles live inter-component communication.
- **Collapse Flow**: `collapseToLevel` still sets descendants via `showImmediateChildren`/`hideAllDescendants`. We verified root nodes remain expanded after the state isolation change.

## Outstanding / Recommended Next Steps
1. **Camera Reset Logic**: Even with state isolation, the root node can still be off-screen if the stored camera in the DB is out of range or if the layout pushes heights beyond the initial viewport. Add a fallback centering routine (`centerOnInitialNode`) that runs after layout when no saved camera is present.
2. **Layout Diagnostics**: The root node reports thousands of children (8470) yet remains visually empty. Investigate whether `showImmediateChildren` + `hideAllDescendants` hides everything by design (collapsed badges) or whether we should render a placeholder when a container has collapsed children.
3. **Consistent Build Script**: Encapsulate the Angular build + hash cleanup into a single script (or CI job) to avoid manual rsync/index rewrites.
4. **Remove Ad-hoc Logging**: Any lingering `console.warn` or debug logs added during ongoing investigation should be cleaned up once the core display issue is resolved.
5. **Verify with Fresh Sessions**: After resetting the camera and layout logic, spin up a fresh environment to ensure the Code Model view renders at first load without needing manual zoom/pan.

The state-isolation refactor is now in place. The remaining work is to make sure the root node actually draws visible content (or at least its collapsed placeholder) once the camera is centred. Continuous testing with multiple canvases open simultaneously is recommended to validate the new per-canvas channels.
