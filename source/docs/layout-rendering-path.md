# Layout & Rendering Path (Current Behaviour)

This note documents how the Angular app loads Neo4j data, normalises it, and renders the composable containment‑orthogonal canvas as of October 2025. It mirrors the code that shipped in commit `39e4a59`.

---

## 1. Library / Menu Population

1. `frontend/src/app/landing-shell.component.ts` subscribes to `ViewNodeStateService.getLibraryItems()` on startup. The returned `LibraryItem[]` powers the left-hand menu.
2. `ViewNodeStateService` fetches graph metadata during construction:
   - Runs `Neo4jDataService.getAllSetNodes()` which executes
     ```cypher
     MATCH (sn:SetNode)
     OPTIONAL MATCH (sn)-[:HAS_VIEWNODE]->(vn:ViewNode)
     OPTIONAL MATCH (sn)-[:HAS_QUERYNODE]->(qn:QueryNode)
     WITH sn, collect(DISTINCT vn) AS viewNodes, collect(DISTINCT qn) AS queryNodes
     RETURN sn, viewNodes, head(queryNodes) AS qn
     ORDER BY sn.name ASC
     ```
   - Flattens the result into parent/child `LibraryItem`s so new Set/View pairs appear automatically.
3. If no SetNodes exist it falls back to `MATCH (vn:ViewNode)`; the Models panel is never empty.

---

## 2. View Selection → Query Resolution

1. Selecting a menu row calls `LandingShellComponent.onLibraryItemSelect`, which invokes `ViewNodeStateService.selectViewNodeById`.
2. `frontend/src/app/components/modular-canvas/modular-canvas.component.ts` listens to `selectedViewNode$` and, on change, runs `loadViewNodeData`:
   - Loads the full ViewNode (renderer/layout metadata).
   - Resolves its Cypher via the parent SetNode’s QueryNode and calls `/v0/cypher/unified`.
   - The response is deduplicated into GUID-keyed nodes and relationships. Neo4j internal IDs are never used outside the service.
   - Saved `layout` JSON (if present) is parsed and normalised. `autoLayoutSettings` restore collapse/reflow toggles.

The Cypher used to fetch the query text:
```cypher
MATCH (vn:ViewNode {id: $viewNodeId})<-[:HAS_VIEWNODE]-(sn:SetNode)-[:HAS_QUERYNODE]->(qn:QueryNode)
RETURN qn.cypherQuery AS query
```

---

## 3. Canvas Engine & Shared State

### 3.1 Bootstrapping

1. `ModularCanvasComponent.createEngineWithData()` calls `ComponentFactory.createFromViewNode` to obtain the correct layout engine and renderer (for example, `hierarchical` + `composable-containment-orthogonal`).
2. Incoming `CanvasData` is normalised (every node/edge must have a GUID; legacy `guid` fields are removed; edges are rekeyed to GUIDs).
3. The snapshot is seeded into `CanvasViewStateService.initialize(data, 'engine')` before the engine is created.
4. `ComposableHierarchicalCanvasEngine` is constructed and wired with:
   - `ViewNodeStateService` (collapse visibility, saved state restore).
   - `DynamicLayoutService` (optional auto-layout reflow).
   - `CanvasViewStateService` (shared observable state).

### 3.2 Mutation Flow

```
CanvasViewStateService
   ↑            ↑
engine ──────► publish('position' | 'resize' | 'collapse' | 'camera' | 'replace')
layout ──────► publish('layout')
```

- The engine mutates its local copy then publishes the entire snapshot with a typed mutation (`position`, `collapse`, `resize`, `camera`, etc.).
- `CanvasViewStateService` clones the payload, increments a version, and emits both the snapshot and mutation metadata.
- The engine also subscribes back to the service; when another publisher (layout, persistence) emits, `applyExternalState` replaces the local copy, normalises it, updates the camera, and re-renders.
- `CanvasViewStateService.updateCamera` is called after every pan/zoom/center so the viewport is part of the shared state.

Important engine behaviours:
- Dragging sets `_userLocked = true` and `_lockedPosition = {x,y}` on the node.
- Collapse operations honour `_lockedPosition` when restoring children.
- Camera mutations keep the viewport stable across layout updates.

---

## 4. Auto Layout Modes

### Auto Layout OFF (`ViewNodeStateService.reflowBehavior = 'static'`)

- Double-click collapse only hides/shows children. Positions remain untouched.
- The engine emits a `collapse` mutation but `DynamicLayoutService` exits immediately, so nothing is reflowed.
- Camera does not move; double-click no longer recentres the node.

### Auto Layout ON (`... = 'dynamic'`)

1. Collapse still flows through the engine (child visibility saved, `_lockedPosition` retained).
2. A `collapse` mutation is published with the node GUID and viewport bounds.
3. `DynamicLayoutService` receives the mutation, clones the snapshot, and:
   - Logs the before state (`userLocked`, `positionBefore`).
   - If `_userLocked` is `false`, it reflows siblings/children using the grid/stack helpers.
   - If `_userLocked` is `true`, it restores the original position after the helper runs so the node never jumps.
4. The service publishes a `layout` mutation. The engine consumes it, calls `applyExternalState`, and redraws with the updated positions.

---

## 5. Rendering Pipeline

1. **Nodes** – `HierarchicalNodePrimitive.draw` renders containers, respecting collapse behaviour (`full-size` vs `shrink`). Hit testing mirrors the effective width/height so selection works for shrunken nodes.
2. **Edges** – `ComposableContainmentOrthogonalRenderer` builds orthogonal routes by:
   - Fetching source/target nodes by GUID.
   - Routing via `OrthogonalRoutingService`.
   - Snapping connection points to node borders.
3. **Camera** – Every render uses `cameraSystem.getCamera()`. Pan/zoom/center operations call `CanvasViewStateService.updateCamera`, and `applyExternalState` restores the camera when snapshots arrive from other publishers.

---

## 6. Neo4j Data Requirements

To add a new ViewNode that appears in the canvas:

1. Create/extend a `SetNode` and link `HAS_VIEWNODE` → `ViewNode`, `HAS_QUERYNODE` → `QueryNode`.
2. Ensure the query returns nodes/relationships with reliable `GUID` properties. The importer will auto-generate GUIDs if missing, but native GUIDs are preferred.
3. Populate `renderer`, `layout_engine`, `layout` (optional), and `autoLayoutSettings` (optional) on the ViewNode.
4. The UI will fetch the entry on the next refresh; users can toggle Auto Layout directly from the canvas toolbar.

---

## 7. File Reference

| Concern                              | File                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Models menu population               | `frontend/src/app/landing-shell.component.ts`                             |
| View selection & engine bootstrap    | `frontend/src/app/components/modular-canvas/modular-canvas.component.ts` |
| Canvas engine + shared state         | `frontend/src/app/shared/canvas/composable-hierarchical-canvas-engine.ts`|
| Shared canvas state service          | `frontend/src/app/shared/canvas/state/canvas-view-state.service.ts`      |
| Dynamic layout responder             | `frontend/src/app/core/services/dynamic-layout.service.ts`               |
| Collapse/visibility state            | `frontend/src/app/core/services/view-node-state.service.ts`              |
| Neo4j data access                    | `frontend/src/app/core/services/neo4j-data.service.ts`                   |
| Node rendering primitive             | `frontend/src/app/shared/composable/primitives/hierarchical-node-primitive.ts` |
| Containment + orthogonal renderer    | `frontend/src/app/shared/composable/renderers/composable-containment-orthogonal-renderer.ts` |
| Grid/auto layout helpers             | `frontend/src/app/core/services/grid-layout.service.ts`                  |

This is the authoritative description of the current layout/rendering path. Any future Codex session should treat it as the starting point when extending the canvas.
