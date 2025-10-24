# Render v1 Specification

## 1. Purpose
- Define the authoritative flow for getting Neo4j data onto the canvas renderer with no intermediate overlay systems.
- Document responsibilities, data contracts, and lifecycle events for the runtime rendering stack.
- Provide a coding reference for extending or re-implementing render-related features without regressing the direct data pathway.

## 2. Scope
- Covers runtime startup inside `LandingShellComponent`, layout + rendering inside `RuntimeCanvasComponent` / `RuntimeCanvasController`, and real-time delta handling.
- Applies to both containment (hierarchical) and flat runtime modes; other legacy engines, view types, or external panels are out of scope.

## 3. High-Level Flow
```
LandingShellComponent
    └─ ViewNodeStateService (select ViewNode)
          └─ Neo4jDataService.fetchGraphDataSet
                └─ RuntimeCanvasComponent.createEngineWithData
                      └─ RuntimeCanvasController
                            ├─ CanvasLayoutRuntime (ViewGraph)
                            └─ Renderer (e.g. RuntimeContainmentRenderer)
```
- Data moves exactly once from Neo4j → `GraphDataSet` → `CanvasLayoutRuntime.viewGraph` → renderer draw calls.
- All mutations after `GraphDataSet` happen on the `viewGraph` object inside `CanvasLayoutRuntime`.

## 4. Startup Sequence
1. **App boot**: `LandingShellComponent` subscribes to `ViewNodeStateService.getLibraryItems()` and auto-selects the first runtime ViewNode (frontend/src/app/landing-shell.component.ts#L1054).
2. **Selection**: `ViewNodeStateService.selectViewNodeById(id)` emits the chosen ViewNode via `selectedViewNode` (frontend/src/app/core/services/view-node-state.service.ts#L140).
3. **Component init**: `RuntimeCanvasComponent.ngOnInit` subscribes to `selectedViewNode` and invokes `loadViewNodeData(viewNode.id)` when it changes (frontend/src/app/components/modular-canvas/runtime-canvas.component.ts#L167).
4. **Data fetch**:
   - Resolve ViewNode metadata (renderer/layout selections).
   - Call `Neo4jDataService.fetchGraphDataSet(viewNode)` to execute the Cypher query through `/runtime/canvas/data` (frontend/src/app/core/services/neo4j-data.service.ts#L200).
   - Keep any saved `CanvasData` snapshot for layout restoration.
5. **Engine creation**: `createEngineWithData()` instantiates `RuntimeCanvasController`, selecting the containment or flat renderer and seeding it with either the saved snapshot or an empty canvas (frontend/src/app/components/modular-canvas/runtime-canvas.component.ts#L655).
6. **Graph load**: `RuntimeCanvasController.loadGraphDataSet()` hands the immutable dataset to `CanvasLayoutRuntime` which:
   - Copies raw data directly for flat mode, or
   - Runs `processRawDataToGraph` + `layoutGraphToHierarchical` to build hierarchical nodes/edges.
7. **Render loop**: `RuntimeCanvasController` starts its animation loop; the renderer draws the `viewGraph` contents without recomputing layout.

## 5. Data Contracts

### 5.1 Database Response (Authoritative Source)
- Endpoint: `/runtime/canvas/data`
- Interface: `RuntimeGraphResponse` (frontend/src/app/core/services/neo4j-data.service.ts: runtime response mapping)
```jsonc
{
  "query_id": "917aaad0-6cb0-4d1f-8155-61f907b5c8bf",
  "cypher": "MATCH ...",
  "parameters": { "limit": 500 },
  "nodes": [
    {
      "guid": "node-guid-1",
      "labels": ["Service"],
      "parent_guid": "node-guid-root",
      "position": { "x": 120, "y": 360, "z": null },
      "display": {
        "width": 200,
        "height": 120,
        "color": "#1f2937",
        "icon": "pi-database",
        "border_color": "#4b5563",
        "badges": [{ "text": "prod", "color": "#22c55e" }],
        "label_visible": true
      },
      "tags": { "environment": ["prod", "blue"] },
      "properties": {
        "name": "Payments",
        "type": "Service",
        "owner": "SRE"
      }
    }
  ],
  "edges": [
    {
      "guid": "edge-guid-42",
      "source_guid": "node-guid-1",
      "target_guid": "node-guid-2",
      "type": "CALLS",
      "display": {
        "color": "#6ea8fe",
        "width": 2,
        "label": "CALLS",
        "label_visible": false,
        "dash": [6, 2]
      },
      "properties": {
        "latency_ms_p95": 240,
        "throughput_rps": 120
      }
    }
  ],
  "metadata": { "elapsed_ms": 23, "rows_returned": 128 },
  "telemetry_cursor": null,
  "raw_rows": [
    { "root": { /* neo4j node */ }, "rel": { /* neo4j rel */ } }
  ]
}
```
- **Cardinal rules** (do not change upstream):
  - Identifiers are always `guid`.
  - Edges use `source_guid` / `target_guid`.
  - Payload key is `edges`, not `relationships`.
  - `display`, `position`, `tags`, and `properties` objects are optional but when present must preserve casing above.

**Actual runtime payload (Containment - Runtime Merge)**
```json
{
  "query_id": "8d9aa58bd2f268a4726841075a15063924149db432bd190b1a115a10640940b4",
  "cypher": "MATCH (n:Node) OPTIONAL MATCH (n)-[r]-(m:Node) RETURN n, r, m",
  "nodes": [
    { "guid": "b2c3d4e5-f6a1-4b2c-9d0e-1f2a3b4c5d6e", "labels": ["Imported","Node"], "properties": { "GUID": "b2c3d4e5-f6a1-4b2c-9d0e-1f2a3b4c5d6e", "name": "Node 1-1", "type": "node" } },
    { "guid": "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d", "labels": ["Imported","Node"], "properties": { "GUID": "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d", "name": "Node 1", "type": "container", "trace_id": "trace_1761022025603_qd4585gm5", "lastModified": 1761022025605 } },
    { "guid": "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f", "labels": ["Imported","Node"], "properties": { "GUID": "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f", "name": "Node 1-1-1", "type": "component" } },
    { "guid": "d4e5f6a1-b2c3-4d4e-1f2a-3b4c5d6e7f8a", "labels": ["Imported","Node"], "properties": { "GUID": "d4e5f6a1-b2c3-4d4e-1f2a-3b4c5d6e7f8a", "name": "Node 2", "type": "container" } },
    { "guid": "e5f6a1b2-c3d4-4e5f-2a3b-4c5d6e7f8a9b", "labels": ["Imported","Node"], "properties": { "GUID": "e5f6a1b2-c3d4-4e5f-2a3b-4c5d6e7f8a9b", "name": "Node 2-1", "type": "node" } },
    { "guid": "a7b8c9d0-e1f2-4a7b-4c5d-6e7f8a9b0c1d", "labels": ["Imported","Node"], "properties": { "GUID": "a7b8c9d0-e1f2-4a7b-4c5d-6e7f8a9b0c1d", "name": "Node 2-2", "type": "node" } },
    { "guid": "f6a1b2c3-d4e5-4f6a-3b4c-5d6e7f8a9b0c", "labels": ["Imported","Node"], "properties": { "GUID": "f6a1b2c3-d4e5-4f6a-3b4c-5d6e7f8a9b0c", "name": "Node 2-1-1", "type": "component" } }
  ],
  "edges": [
    { "guid": "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a", "source_guid": "", "target_guid": "", "type": "CONTAINS", "properties": { "fromGUID": "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d", "toGUID": "b2c3d4e5-f6a1-4b2c-9d0e-1f2a3b4c5d6e", "GUID": "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a" } },
    { "guid": "5f6a7b8c-9d0e-41f2-a3b4-c5d6e7f8a9b0", "source_guid": "", "target_guid": "", "type": "CONTAINS", "properties": { "fromGUID": "b2c3d4e5-f6a1-4b2c-9d0e-1f2a3b4c5d6e", "toGUID": "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f", "GUID": "5f6a7b8c-9d0e-41f2-a3b4-c5d6e7f8a9b0" } },
    { "guid": "3e4f5a6b-7c8d-49e0-bf1a-2b3c4d5e6f7a", "source_guid": "", "target_guid": "", "type": "CONTAINS", "properties": { "fromGUID": "e5f6a1b2-c3d4-4e5f-2a3b-4c5d6e7f8a9b", "toGUID": "f6a1b2c3-d4e5-4f6a-3b4c-5d6e7f8a9b0c", "GUID": "3e4f5a6b-7c8d-49e0-bf1a-2b3c4d5e6f7a" } },
    { "guid": "8c9d0e1f-2a3b-4c5d-b6e7-f89a0b1c2d3e", "source_guid": "", "target_guid": "", "type": "CONTAINS", "properties": { "fromGUID": "d4e5f6a1-b2c3-4d4e-1f2a-3b4c5d6e7f8a", "toGUID": "a7b8c9d0-e1f2-4a7b-4c5d-6e7f8a9b0c1d", "GUID": "8c9d0e1f-2a3b-4c5d-b6e7-f89a0b1c2d3e" } },
    { "guid": "2a3b4c5d-6e7f-4890-a123-456789abcdef", "source_guid": "", "target_guid": "", "type": "CONTAINS", "properties": { "fromGUID": "d4e5f6a1-b2c3-4d4e-1f2a-3b4c5d6e7f8a", "toGUID": "e5f6a1b2-c3d4-4e5f-2a3b-4c5d6e7f8a9b", "GUID": "2a3b4c5d-6e7f-4890-a123-456789abcdef" } },
    { "guid": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f", "source_guid": "", "target_guid": "", "type": "LINK", "properties": { "fromGUID": "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f", "toGUID": "f6a1b2c3-d4e5-4f6a-3b4c-5d6e7f8a9b0c", "label": "Link 11", "GUID": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f", "type": "LINK" } }
  ],
  "metadata": { "elapsed_ms": 2, "rows_returned": 12 }
}
```
- Key nuance: upstream currently leaves `source_guid` / `target_guid` blank and relies on `properties.fromGUID` / `properties.toGUID`.

### 5.2 GraphDataSet (Immutable Front-End Snapshot)
- `Neo4jDataService.fetchGraphDataSet` surfaces the payload as-is (trimmed):
```ts
interface GraphDataSet {
  readonly id: `${string}::${string}`;       // `${viewNodeId ?? 'anonymous'}::${query_id}`
  readonly viewNodeId?: string;
  readonly queryId: string;
  readonly cypher: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly nodes: ReadonlyArray<{
    readonly guid: string;
    readonly labels?: ReadonlyArray<string>;
    readonly parent_guid?: string | null;
    readonly position?: { x: number; y: number; z?: number | null };
    readonly display?: {
      width?: number;
      height?: number;
      color?: string;
      icon?: string;
      border_color?: string;
      badges?: Array<{ text: string; color?: string }>;
      label_visible?: boolean;
    };
    readonly tags?: Readonly<Record<string, string[]>>;
    readonly properties: Readonly<Record<string, unknown>>;
  }>;
  readonly edges: ReadonlyArray<{
    readonly guid: string;
    readonly source_guid: string;
    readonly target_guid: string;
    readonly type: string;
    readonly display?: {
      color?: string;
      width?: number;
      label?: string;
      label_visible?: boolean;
      dash?: number[];
    };
    readonly properties: Readonly<Record<string, unknown>>;
  }>;
  readonly metadata: { elapsed_ms: number; rows_returned: number };
  readonly rawRows?: ReadonlyArray<Record<string, unknown>>;
}
```
- Stored untouched; never modify `GraphDataSet` after creation.

- Example dataset entry:
```ts
{
  id: "87a9ac07-5da9-42ab-80f2-0563837b592d::8d9aa58bd2f268a4726841075a15063924149db432bd190b1a115a10640940b4",
  viewNodeId: "87a9ac07-5da9-42ab-80f2-0563837b592d",
  queryId: "8d9aa58bd2f268a4726841075a15063924149db432bd190b1a115a10640940b4",
  cypher: "MATCH (n:Node) OPTIONAL MATCH (n)-[r]-(m:Node) RETURN n, r, m",
  parameters: {},
  nodes: [
    { guid: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d", labels: ["Imported","Node"], properties: { GUID: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d", name: "Node 1", type: "container", trace_id: "trace_1761022025603_qd4585gm5", lastModified: 1761022025605 } },
    /* other nodes identical to payload */
  ],
  edges: [
    { guid: "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a", source_guid: "", target_guid: "", type: "CONTAINS", properties: { fromGUID: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d", toGUID: "b2c3d4e5-f6a1-4b2c-9d0e-1f2a3b4c5d6e", GUID: "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a" } },
    /* remaining edges unchanged */
  ],
  metadata: { elapsed_ms: 2, rows_returned: 12 }
}
```

### 5.3 RawDataInput (Layout Runtime Contract)
- Generated exclusively by `graphDataSetToRawDataInput` (frontend/src/app/shared/graph/graph-data-set.ts).
```ts
type RawDataInput = {
  entities: Array<{
    id: string;                            // === guid
    name: string;                          // properties.name | guid
    type: string;                          // primary label | properties.type | 'node'
    properties: Record<string, unknown>;   // includes parent_guid, position, display, tags
  }>;
  relationships: Array<{
    id: string;                            // === edge guid
    source: string;                        // source_guid
    target: string;                        // target_guid
    type: string;
    properties: Record<string, unknown>;   // includes display overrides, metadata
  }>;
};
```
- Passed into `CanvasLayoutRuntime.setGraphDataSet` / `setRawData`; consumers must not assemble this by hand.

- Example `RawDataInput` emitted for the same dataset:
```ts
{
  entities: [
    {
      id: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d",
      name: "Node 1",
      type: "container",
      properties: {
        GUID: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d",
        name: "Node 1",
        type: "container",
        trace_id: "trace_1761022025603_qd4585gm5",
        lastModified: 1761022025605
      }
    },
    /* other entities */
  ],
  relationships: [
    {
      id: "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a",
      source: "",
      target: "",
      type: "CONTAINS",
      properties: {
        fromGUID: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d",
        toGUID: "b2c3d4e5-f6a1-4b2c-9d0e-1f2a3b4c5d6e",
        GUID: "7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a"
      }
    },
    /* other relationships */
  ]
}
```
- `processRawDataToGraph` therefore reads `rel.properties.fromGUID` / `rel.properties.toGUID` when `source` / `target` are empty.

### 5.4 CanvasData / ViewGraph (Renderer State)
- Managed by `CanvasLayoutRuntime` and read by renderers (`frontend/src/app/shared/canvas/types.ts`).
```ts
interface CanvasData {
  nodes: HierarchicalNode[];
  edges: Edge[];                // render-ready edges (includes inherited)
  originalEdges: Edge[];        // edge list before inheritance adjustments
  camera?: Camera;
  metadata?: Record<string, unknown>;
}

interface HierarchicalNode {
  id: string;                   // GUID (duplicated in GUID for legacy paths)
  GUID?: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  style: { fill: string; stroke: string; icon?: string };
  children: HierarchicalNode[];
  selected?: boolean;
  visible?: boolean;
  collapsed?: boolean;
  dragging?: boolean;
  metadata?: Record<string, any>;
  inheritedEdges?: Edge[];
  layoutConfig?: NodeLayoutConfig;
}

interface Edge {
  id: string;                   // guid or derived `inherited-*`
  from: string;                 // GUID of source
  to: string;                   // GUID of target
  fromGUID?: string;
  toGUID?: string;
  label: string;
  style: { stroke: string; strokeWidth: number; strokeDashArray?: number[] | null };
  waypoints?: Point[];
  metadata?: Record<string, any>;
}
```
- `originalEdges` plus `computeEdgesWithInheritance` guarantee visible connectors regardless of collapse state.

- Example `CanvasData` excerpt after runtime layout (positions abbreviated):
```ts
{
  nodes: [
    {
      id: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d",
      GUID: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d",
      type: "container",
      x: 612,
      y: 348,
      width: 200,
      height: 120,
      text: "Node 1",
      style: { fill: "#1f2937", stroke: "#4b5563" },
      children: [
        {
          id: "b2c3d4e5-f6a1-4b2c-9d0e-1f2a3b4c5d6e",
          GUID: "b2c3d4e5-f6a1-4b2c-9d0e-1f2a3b4c5d6e",
          type: "node",
          x: 36,
          y: 54,
          width: 160,
          height: 80,
          text: "Node 1-1",
          children: [
            {
              id: "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f",
              GUID: "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f",
              type: "component",
              x: 34,
              y: 50,
              width: 120,
              height: 80,
              text: "Node 1-1-1",
              children: []
            }
          ]
        }
      ],
      metadata: {
        rawEntity: {
          GUID: "a1b2c3d4-e5f6-4a1b-8c9d-0e1f2a3b4c5d",
          name: "Node 1",
          type: "container",
          trace_id: "trace_1761022025603_qd4585gm5",
          lastModified: 1761022025605
        }
      }
    },
    /* other root nodes */
  ],
  originalEdges: [
    {
      id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
      from: "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f",
      to: "f6a1b2c3-d4e5-4f6a-3b4c-5d6e7f8a9b0c",
      label: "LINK",
      style: { stroke: "#3b82f6", strokeWidth: 2 },
      metadata: { inherited: false }
    }
  ],
  edges: [
    {
      id: "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
      from: "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f",
      to: "f6a1b2c3-d4e5-4f6a-3b4c-5d6e7f8a9b0c",
      fromGUID: "c3d4e5f6-a1b2-4c3d-0e1f-2a3b4c5d6e7f",
      toGUID: "f6a1b2c3-d4e5-4f6a-3b4c-5d6e7f8a9b0c",
      label: "LINK",
      style: { stroke: "#3b82f6", strokeWidth: 2 },
      metadata: { visible: true }
    },
    /* inherited-* edges when nodes collapse */
  ],
  camera: { x: -108, y: -192, zoom: 0.82 },
  metadata: { layoutVersion: 1, displayMode: "runtime-containment" }
}
```

### Naming Rules
- Always use `guid` for nodes/edges and `edges` for connections at every layer (reinforced in `.claude/skills/architecture.md`).
- No aliases (`id`, `relationships`) may be introduced in new code.

## 6. ViewGraph Lifecycle
- Created inside `CanvasLayoutRuntime` during controller construction.
- Updated exclusively by:
  1. `setGraphDataSet` / `setRawData`, which mutate nodes/edges/camera for new datasets.
  2. `runLayout`, which writes layout results directly into `viewGraph`.
  3. `RuntimeCanvasController.applyDelta`, which merges WebSocket updates and recalculates inherited edges.
- Consumers must never clone or fork `viewGraph`; all observers read the same object to avoid desynchronisation.

## 7. Layout Runtime Responsibilities
- Validate raw input (`validateRawData`) before acceptance.
- In flat mode:
  - Copy Neo4j nodes/edges directly, run `applyForceDirectedLayout` to stamp x/y.
- In containment mode:
  - Convert to `LayoutGraph`, apply hierarchy, run active layout engine, and translate back via `layoutGraphToHierarchical`.
- Maintain `GraphStore` snapshots and emit `LayoutResult` for renderers.
- Rebuild the hierarchy when containment mode toggles, leveraging the stored immutable `GraphDataSet`.

## 8. Rendering Responsibilities
- `RuntimeCanvasController`:
  - Owns the canvas, camera, and animation loop.
  - Calls `layoutRuntime.runLayout` when requested (no layout logic inside the renderer).
  - Computes `computeEdgesWithInheritance` so collapsed branches surface dashed edges from visible ancestors (frontend/src/app/shared/canvas/runtime-canvas-controller.ts#L1322).
- Renderer implementations (e.g. `RuntimeContainmentRenderer`):
  - Treat incoming nodes/edges as authoritative.
  - Perform draw-only operations; no layout, data fetching, or mutable side effects on `viewGraph`.
  - Leverage GUIDs for node lookup and cache invalidation.

## 9. Real-Time Updates
- `RuntimeCanvasComponent` opens a WebSocket subscription via `Neo4jRealtimeService` for the current ViewNode id (frontend/src/app/components/modular-canvas/runtime-canvas.component.ts#L963).
- Deltas (`GraphDelta`) describe node/edge creations, updates, and deletions.
- `RuntimeCanvasController.applyDelta` merges changes directly into the existing `viewGraph`, recomputes inherited edges, and triggers layout only when new nodes lack x/y coordinates.
- History tracking and UI panels consume the same mutated `viewGraph` via the controller’s `onDataChanged` callback.

## 10. Constraints & Guarantees
- **Single source of truth**: `CanvasLayoutRuntime.viewGraph` is the only mutable scene object after data leaves Neo4j.
- **Immutable source**: `GraphDataSet` must never be mutated—store it for rebuilds but treat it as read-only.
- **Renderer purity**: Renderers cannot fetch data or apply layouts; they only read and draw.
- **Saved layouts**: Persisted snapshots must include `nodes`, `edges`/`originalEdges`, `camera`, and `viewConfig`. On restore, load the latest `GraphDataSet` first, then overlay the saved snapshot so future toggles/deltas still have source data.
- **Edge inheritance**: Any new feature affecting visibility must respect `computeEdgesWithInheritance`; do not bypass it or edge visibility will desync.
- **Flat vs containment**: Feature code must tolerate both modes; switching modes rebuilds from the immutable dataset, so avoid storing per-mode-only state outside `viewGraph`.

## 11. Non-Goals
- Legacy composable engines, preset managers, or overlay services that existed prior to the runtime rewrite.
- Alternative front-end views (tree table, chat, admin) and their data flows.
- Back-end Cypher query generation—spec assumes `Neo4jDataService` returns valid datasets.

## 12. Implementation Checklist
- [ ] Pull ViewNode metadata through `ViewNodeStateService.selectedViewNode`.
- [ ] Fetch graph data solely via `Neo4jDataService.fetchGraphDataSet`.
- [ ] Convert datasets to `RawDataInput` using `graphDataSetToRawDataInput`.
- [ ] Feed data into `RuntimeCanvasController.loadGraphDataSet` and let layout mutate the shared `viewGraph`.
- [ ] Ensure renderers read GUIDs, never local IDs.
- [ ] Handle WebSocket deltas through `RuntimeCanvasController.applyDelta`.
- [ ] Persist or restore layouts by serialising/deserialising `CanvasData` without breaking the immutable dataset cache.

## 13. Open Questions
- Do we need a lightweight schema validator for `/runtime/canvas/data` responses to fail fast on missing GUIDs?
- Should `RuntimeCanvasController` expose an observable for frame timing metrics to help renderer performance tuning?
- Is there a requirement to support multiple concurrent runtime canvases, and if so how should `Neo4jRealtimeService` multiplex subscriptions?
