# Runtime Containment Engine & Renderer

## Goals
- Deliver a standalone runtime pipeline that renders containment-first views directly from raw query output.
- Match the current Containment Orthogonal experience (geometry, colours, drill/collapse, containment snapping, orthogonal edges) without depending on stored layout snapshots.
- Establish extensible foundations for additional runtime layouts (lane, radial, force, hybrid) that share ingestion, layout primitives, and renderer infrastructure.

## Pipeline Overview
```
Runtime Query → Canonical Graph Normalizer → Runtime Layout Engine → Presentation Snapshot → Runtime Renderer
```

### 1. Canonical Graph Normalizer
- Input: `RawDataInput` (entities + relationships) from runtime query endpoint.
- Responsibilities:
  - Preserve GUIDs, names, roles, hierarchy, badges, icons, styling metadata.
  - Identify hierarchy via `CONTAINS`, `HAS_CHILD`, `PARENT_OF`, explicit `parent_guid` fields.
  - Preserve non-containment relationships for edge routing (link, flow, depends_on).
  - Emit canonical `RuntimeNode` / `RuntimeEdge` with `role`, `display`, `metrics`, `tags`.
- Output: `RuntimeGraphSnapshot` (nodes by GUID, parent map, adjacency lists).

### 2. Runtime Layout Engine (`ContainmentRuntimeLayoutEngine`)
- Interface: implements `LayoutEngine` (`layout`, `processRawData`).
- Phases:
  1. **Structure build:** convert `RuntimeGraphSnapshot` into hierarchical `LayoutGraph`.
  2. **Pre-layout constraints:** compute default sizes, padding, baseline aspect ratios.
  3. **Solver:** adaptive containment packing:
     - Weighted grid (row first) using child type heuristics.
     - Optional “focus” weighting for active nodes.
     - Deterministic repeatability.
  4. **Post-process:** stack collapsed child counts, compute inherited edges, annotate metadata (`displayMode`, `targetWidth/Height`, `role`).
  5. **Edge routing:** compute orthogonal waypoints with obstacle avoidance (coarse grid).
- Exposes layout metadata for renderer (bounds, container interior, collapse hints).

### 3. Runtime Renderer (`RuntimeContainmentRenderer`)
- Layered rendering:
  - Background fill + status textures per container role.
  - Node chrome (icon, title, type, badges, metrics).
  - Selection halos, focus overlays, drag affordances.
  - Inherited edge overlays (semi-transparent).
- Orthogonal edge drawing with label placement along longest straight segment.
- Containment indicators:
  - Node out-of-bounds warnings.
  - Docking highlight when near parent edge.
- Integrates with `ViewNodeStateService` for collapse behaviour & reflow.

### 4. Interaction + State Hooks
- Drag containment enforcement uses runtime metadata (inner bounds, padding).
- Double-click drill / collapse triggers layout engine updates via runtime graph snapshot (no saved layout dependency).
- History snapshots store runtime outputs (nodes + camera + metadata).
- Preset/lens integration references canonical metadata (`role`, `tags`, `status`).

## Parity Checklist
| Feature | Legacy Containment-Orthogonal | Runtime Target |
| --- | --- | --- |
| Hierarchy visibility | Saved layout geometry | Runtime solver geometry |
| Containment snap | Canvas interaction handler | Enforced via runtime metadata |
| Collapse / drill | Canvas engine + renderer | Same API, runtime data |
| Edge routing | Cached orthogonal waypoints | Runtime router recomputes waypoints |
| Styles & badges | Saved layout styles | Normalizer preserves display metadata |
| Camera framing | Saved layout camera | Runtime solver computes bounds |
| Undo/redo | History snapshots of canvas data | History stores runtime snapshots |
| GraphDiff | Layout vs raw compare | Raw canonical vs runtime graph |

## Implementation Plan
1. **Normalizer:** `runtime-graph-normalizer.ts` to convert raw entities/relationships.
2. **Layout engine:** `containment-runtime-layout.engine.ts` (+ register with orchestrator).
3. **Renderer:** `runtime-containment-renderer.ts` (orthogonal node/edge pipeline).
4. **Module registry:** add `containment-runtime` module pointing to new engine/renderer pair.
5. **Canvas integration:** ModularCanvas routes ViewNodes with `layout_engine === 'containment-runtime'` directly to runtime pipeline (no saved layout fallback).
6. **Testing:** compare runtime output vs legacy view using `[GraphDiff]`, manual containment/drag drill tests.

## Future Extensions
- Lane/Swimlane runtime engine (business process flows).
- Force-directed runtime engine (exploratory graphs).
- Real-time diff overlays (compare saved vs live).
- Streaming incremental updates with partial reflow.

