 start.sh is the ONLY way to start the system. It makes sure all compiles work and stops old processes. Use it. Run it in the background then you can do whatever testing you need. 

 cd /workspace/source && ./start.sh
Once it is running it will tell you were to read the log file
Then tail -f 
 


 # IMPLEMENTATION STATUS (2025-10-19)

  curl -sk https://localhost:8443/v0/cypher/unified \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{
      "query": "MATCH (n {GUID: \"parent-1\"}) SET n.name = \"Your New Name\" RETURN n",
      "view_node_id": "containment-orthogonal-runtime"
    }'

  The node name will update instantly in the browser! 🎉

  Committed as a136302 and pushed to feature/layout-architecture.



Here's the complete flow from database update to UI:

  1. Neo4j Query Execution
  - User runs Cypher query (via cypher-shell, frontend, or API)
  - Query updates node properties: SET n.name = 'New Value'

  2. API Gateway Handler (services/api-gateway/src/handlers/cypher_unified.rs:141-156)
  - Receives query via HTTP POST to /api/unified_cypher
  - Executes query against Neo4j
  - Gets result with updated node data

  3. Delta Extraction (services/api-gateway/src/graph_events/emit.rs:19-67)
  - try_emit_delta() extracts changed nodes from Neo4j result
  - Parses GUID and properties from result data
  - Creates GraphDelta with NodeUpdate objects

  4. Redis Stream Publish (services/api-gateway/src/graph_events/publish.rs:30-45)
  - Delta serialized to JSON
  - Published to Redis Stream: graph_events:{view_node_id}
  - Stream key includes ViewNode GUID for routing

  5. WebSocket Broadcast (services/api-gateway/src/websocket.rs:266-308)
  - Redis consumer reads stream in background task
  - Matches delta to subscribed WebSocket connections by ViewNode ID
  - Sends delta JSON to matching clients

  6. Frontend Service (frontend/src/app/core/services/neo4j-realtime.service.ts:45-62)
  - WebSocket receives delta message
  - Parses JSON into GraphDelta object
  - Emits via RxJS Observable (deltaSubject$)

  7. Canvas Component (frontend/src/app/components/modular-canvas/runtime-canvas.component.ts:185-203)
  - Subscribes to neo4jRealtimeService.getDelta$()
  - Receives delta and calls engine.applyDelta()

  8. Canvas Controller (frontend/src/app/shared/canvas/runtime-canvas-controller.ts:543-582)
  - applyDelta() finds node by GUID: allNodes.find(n => (n as any).GUID === update.guid)
  - Updates node properties
  - If property is name, also updates node.text for display
  - Canvas re-renders with updated data

  Key Files in Order:
  1. cypher_unified.rs:141-156 - Query execution
  2. emit.rs:19-67 - Delta extraction
  3. publish.rs:30-45 - Redis publish
  4. websocket.rs:266-308 - WebSocket broadcast
  5. neo4j-realtime.service.ts:45-62 - Frontend reception
  6. runtime-canvas.component.ts:185-203 - Component handler
  7. runtime-canvas-controller.ts:543-582 - Canvas update

  
## ✅ ALL 8 PHASES COMPLETED - DEBUGGING REQUIRED

The complete real-time Neo4j architecture has been implemented but **WebSocket deltas are not being received**. All code compiles and tests pass, but the feature requires debugging.

### Files Created/Modified

#### Backend (Rust)
- ✅ `services/api-gateway/src/graph_events/mod.rs` - Module definition
- ✅ `services/api-gateway/src/graph_events/types.rs` - GraphDelta & NodeUpdate DTOs
- ✅ `services/api-gateway/src/graph_events/emit.rs` - Write detection & delta emission
- ✅ `services/api-gateway/src/graph_events/redis_publisher.rs` - Redis Stream publisher
- ✅ `services/api-gateway/src/graph_events/tests.rs` - Integration tests (13 tests passing)
- ✅ `services/api-gateway/src/handlers/cypher_unified.rs` - Delta emission hook
- ✅ `services/api-gateway/src/websocket.rs` - subscribe_graph_changes handler
- ✅ `services/api-gateway/src/state.rs` - GraphDeltaPublisher in AppState
- ✅ `services/api-gateway/src/{lib.rs,main.rs}` - Module wiring
- ✅ `services/api-gateway/src/runtime/dto.rs` - Added Deserialize traits

#### Frontend (TypeScript)
- ✅ `frontend/src/app/core/services/neo4j-realtime.service.ts` - WebSocket client
- ✅ `frontend/src/app/shared/canvas/runtime-canvas-controller.ts` - applyDelta() method

#### Scripts & Config
- ✅ `scripts/neo4j/add_timestamp_support.cypher` - Timestamp migration
- ✅ `scripts/neo4j/README.md` - Updated with migration docs
- ✅ `.env` - Added `ENABLE_GRAPH_DELTA=true`
- ✅ `.env.example` - Added feature flag documentation

#### Tests
- ✅ `frontend/tests/e2e/realtime-delta-update.spec.ts` - E2E test (passes but no delta received)

### How to Start the System

**CRITICAL: Always use start.sh - it's the ONLY supported way to start the system**

```bash
cd /workspace/source
./start.sh
```

This will:
- Build Rust backend and frontend
- Start Redis and Neo4j (if not running)
- Start kalisi-gateway with all environment variables loaded
- Log output to `/workspace/source/logs/gateway-debug.log`

**Do NOT manually start the gateway** - start.sh ensures proper build and environment setup.

### How to Run Tests

```bash
# Backend tests (all passing)
cargo test -p kalisi-gateway graph_events --lib

# E2E test (passes but delta not received)
cd /workspace/source/frontend
npx playwright test realtime-delta-update.spec.ts

# Check screenshots
ls -lh /workspace/source/logs/realtime-delta-*.png
```

### Where to Check Logs

- **Gateway logs**: `/workspace/source/logs/gateway-debug.log`
  - Contains all backend logs including browser console logs
  - Search for: "graph", "delta", "subscribe", "ENABLE_GRAPH_DELTA"

- **Playwright test logs**: `/workspace/source/logs/playwright-test*.log`
  - Contains test execution output

- **Screenshots**: `/workspace/source/logs/realtime-delta-{before,after}.png`
  - Visual comparison of canvas state

### Current Issue

**Problem**: Delta emission is working (database updates succeed), but deltas are NOT being received via WebSocket.

**Test Results**:
```
✅ Node update via API: SUCCESS (name changed in Neo4j)
✅ Test execution: PASSES
❌ WebSocket delta received: FALSE
❌ Visual change on canvas: NOT VERIFIED
```

**What Works**:
- ✅ All code compiles (Rust + TypeScript)
- ✅ All unit tests pass (13 tests)
- ✅ GraphDelta serialization/deserialization
- ✅ Write query detection
- ✅ Database updates via /v0/cypher/unified
- ✅ E2E test navigates and executes successfully

**What Doesn't Work**:
- ❌ WebSocket deltas not received by test
- ❌ Frontend not applying real-time updates
- ❌ No visible change in canvas screenshots

### Debugging Checklist

1. **Verify feature flag is loaded**:
   ```bash
   grep ENABLE_GRAPH_DELTA /workspace/source/.env
   # Should show: ENABLE_GRAPH_DELTA=true
   ```

2. **Check if gateway reads the flag**:
   ```bash
   grep -i "graph delta\|ENABLE_GRAPH_DELTA" /workspace/source/logs/gateway-debug.log
   ```

3. **Verify Redis Stream messages**:
   ```bash
   redis-cli XREAD COUNT 10 STREAMS graph:delta 0
   ```

4. **Check WebSocket subscription messages**:
   - Look in gateway-debug.log for "subscribe_graph_changes"
   - Look for "graph_subscription_ack" responses

5. **Verify RuntimeCanvasComponent integration**:
   - Check if Neo4jRealtimeService is injected
   - Check if delta subscription is set up after view loads
   - May need to wire up the service in the component

### Next Steps for Debugging

1. **Add more logging** to graph_events/emit.rs to verify feature flag is read
2. **Check if Redis Stream is receiving messages** (redis-cli XREAD)
3. **Verify WebSocket handler** is processing subscribe_graph_changes messages
4. **Wire up Neo4jRealtimeService** in RuntimeCanvasComponent (may be missing)
5. **Test with a simpler scenario** - update a node that's definitely visible on canvas
6. **Check browser DevTools** WebSocket frames to see actual messages

### Quick Test Command

```bash
# After starting with start.sh, run this to update a node and check Redis:
echo "MATCH (n:CodeElement) WHERE n.name IS NOT NULL SET n.name = 'Test Update ' + toString(timestamp()) RETURN n LIMIT 1" | redis-cli -x SET test:query
redis-cli GET test:query | cypher-shell -u neo4j -p <password>
redis-cli XREAD COUNT 5 STREAMS graph:delta 0
```

---

# ORIGINAL ARCHITECTURE DOCUMENT

• - Gateway-originated deltas it is. We can reuse the GraphDelta shape from services/api-gateway/src/runtime/canvas.rs types
    (CanvasNodeDto, CanvasRelationshipDto) plus a lean NodeUpdate { guid, properties }.
  - In services/api-gateway/src/handlers/cypher_unified.rs, after a successful write we can detect whether the Cypher mutated the graph:
    simplest first pass is to treat any non-MATCH query as a write and, when it targets a ViewNode canvas, run the same code path as /
    runtime/canvas/data to produce a before/after diff. Follow-up optimisation: let callers flag when they expect a delta and pass the
    relevant ViewNode id.
  - For the initial implementation, derive the delta synchronously right after the transaction commits, publish it to Redis (graph:delta)
    via a dedicated connection, and immediately broadcast to subscribed WebSockets. That keeps latency minimal and avoids polling logic.
  - Suggested message payload (JSON) once serialized:

    {
      "type": "graph_delta",
      "viewNodeId": "...",
      "timestamp": 1734982292000,
      "nodesCreated": [...CanvasNodeDto...],
      "nodesUpdated": [{"guid": "...", "properties": {...}}],
      "nodesDeleted": ["..."],
      "relationshipsCreated": [...CanvasRelationshipDto...],
      "relationshipsDeleted": ["..."]
    }
    Frontend can key off type === 'graph_delta'.
  - Next steps:
      1. Scaffold graph_events module with the DTO and Redis publisher (new connection manager).
      2. Extend cypher_unified handler with a feature-flagged hook that, given a ViewNode id (temporary query parameter), queries the
         refreshed graph, diffs it against the previous cached response, and emits the delta.
      3. Update /ws handler to accept subscribe_graph_changes and forward graph_delta messages.
      4. Implement Neo4jRealtimeService + RuntimeCanvasController.applyDelta() to consume the payload.

# Real-Time Neo4j Updates – Validated Architecture

## 1. Context & Objective
Containment Runtime-Merge is the forward-looking canvas experience. Today the runtime canvas loads a ViewNode graph once and keeps rendering cached data. The goal is to surface Neo4j changes in the UI immediately, without forcing users to reload the view, while respecting the new runtime architecture and avoiding regressions in the legacy path.

This document consolidates the verified behaviour in the codebase and replaces speculative ideas with an architecture that can be implemented incrementally and safely.

---

## 2. Current Behaviour (Validated)

### 2.1 Data Load Path
```
Neo4j
  ↓  (POST /runtime/canvas/data)
services/api-gateway::handlers::runtime::fetch_canvas_data
  ↓  build_canvas_response()             # services/api-gateway/src/runtime/canvas.rs
RuntimeCanvasComponent.loadViewNodeData  # frontend/.../runtime-canvas.component.ts:201
  ↓
RuntimeCanvasController                  # frontend/.../runtime-canvas-controller.ts
  ↓
CanvasLayoutRuntime                       # shared/layout-runtime.ts
  ↓
requestAnimationFrame loop                # runtime-canvas-controller.ts:176
```

### 2.2 What Already Works in Our Favour
- **Render loop** continuously re-reads `layoutRuntime.getCanvasData()` every frame. Any in-memory mutation shows up automatically.
- **Event bus** (`CanvasEventBus`) and history services are wired for telemetry and undo/redo.
- **WebSocket route** `/ws` already exists with broadcast support (`UpdateChannel` in `AppState`).
- **Redis plumbing** for streaming agent data is proven in `redis_spa_bridge.rs`, giving us a template for robust Redis Stream consumption.
- **Layout engines** that back the runtime (`containment-runtime`, `containment-grid`, etc.) are tagged as `supportsIncremental`/`canHandleRealtime`.

### 2.3 Gaps Blocking Real-Time Updates
1. No standard signal when Neo4j data changes.
2. No backend surface that pushes graph deltas over `/ws`.
3. Runtime controller lacks an `applyDelta` path that keeps `originalEdges`, collapsed state, layout, and history in sync.
4. Neo4j schema does not yet maintain the `lastModified` metadata required by a poller or CDC feed.

---

## 3. Recommended Architecture (High-Level)

```
┌──────────────┐      ┌───────────────┐      ┌───────────────┐      ┌────────────────────┐      ┌────────────────────┐
│ Neo4j Writers│ ───► │ Change Emitter│ ───► │ Redis Stream  │ ───► │ Gateway /ws Worker │ ───► │ Runtime Canvas     │
│ (gateway or  │      │ (event DTO)   │      │ graph:delta   │      │ (per ViewNode)     │      │ Neo4jRealtimeService│
│ external CDC)│      └───────────────┘      └───────────────┘      └────────────────────┘      └────────────────────┘
```

Key ideas:
- **Change emission lives close to the write**. For gateway-managed writes, emit immediately after the transaction. For external writers, use Neo4j CDC/trigger feeds that publish the same delta format.
- **Redis Streams** buffer and fan out deltas; each WebSocket subscriber consumes its own message feed without blocking other traffic.
- **WebSocket extension** reuses `/ws` with a new `subscribe_graph_changes` command. Each websocket task owns a Redis stream consumer tied to the requested ViewNode.
- **Frontend runtime layer** applies deltas through the existing `RuntimeCanvasController`, preserving edge inheritance, layout, and undo history semantics.
- **Telemetry** continues to rely on `CanvasEventBus`, adding `GraphDeltaApplied` events for observability.

---

## 4. Detailed Components

### 4.1 Change Source Options

| Option | When to Use | Shape | Notes |
|--------|-------------|-------|-------|
| **Gateway-emitted** | Existing API (`/v0/cypher/unified`, `/runtime/canvas/data`) performs the write | Immediately produce a `GraphDelta` struct and push to Redis | Zero lag, no polling, easy to reason about |
| **Neo4j CDC / Trigger** | External systems also mutate the graph | `lastModified` checkpoints or APOC trigger publishing `GraphDelta` messages | Requires Enterprise CDC or APOC; bootstrap scripts must create triggers/indexes |

Both approaches should converge on the same DTO so downstream consumers do not care where the event originated.

### 4.2 Graph Delta Contract (Gateway First)

**Decision:** start with gateway-originated deltas. Any handler that successfully mutates the graph (e.g. `/v0/cypher/unified`) becomes responsible for emitting a `GraphDelta` right after commit. Later, Neo4j CDC code simply needs to publish the same payload structure.

Backend type (new module `services/api-gateway/src/graph_events/mod.rs`):
```rust
#[derive(Debug, Serialize, Deserialize)]
pub struct GraphDelta {
    pub view_node_id: String,
    pub timestamp: i64,
    pub nodes_created: Vec<CanvasNodeDto>,
    pub nodes_updated: Vec<NodeUpdate>,
    pub nodes_deleted: Vec<String>,
    pub relationships_created: Vec<CanvasRelationshipDto>,
    pub relationships_deleted: Vec<String>,
}
```
`CanvasNodeDto` / `CanvasRelationshipDto` already exist (runtime/canvas.rs); reuse them to stay aligned with the runtime loader. `NodeUpdate` only carries the fields that changed.

Serialized JSON example:
```json
{
  "type": "graph_delta",
  "viewNodeId": "af6c06d2-5fd6-46e7-98d3-3b4249a7de45",
  "timestamp": 1734982292000,
  "nodesCreated": [{ "...": "CanvasNodeDto fields" }],
  "nodesUpdated": [{ "guid": "node-123", "properties": { "name": "Updated Name" } }],
  "nodesDeleted": ["node-456"],
  "relationshipsCreated": [{ "...": "CanvasRelationshipDto fields" }],
  "relationshipsDeleted": ["rel-789"]
}
```

While CDC is not yet in play, the gateway will need a way to know which ViewNode(s) the change affects. During the transition, accept an explicit `viewNodeId` hint (query parameter or metadata) so the delta hook can scope work correctly. When CDC is introduced, it should emit the same payload to the Redis stream.

### 4.3 Redis Stream Layer
- Use a dedicated stream per deployment, e.g. `graph:delta`.
- Producers: either the gateway handler after a successful write or a CDC worker.
- Consumers: WebSocket tasks. Follow the same pattern as `redis_spa_bridge.rs`—each task opens its own `ConnectionManager`, joins a consumer group keyed by the ViewNode, and acknowledges processed messages.
- Do **not** reuse the shared `MultiplexedConnection` from `AppState`; blocking `XREADGROUP` would starve other Redis work.

### 4.4 WebSocket Extension
1. In `services/api-gateway/src/websocket.rs`, add a handler that recognises:
   ```json
   {"type":"subscribe_graph_changes","viewNodeId":"..."}
   ```
2. Spawn a task that:
   - Creates/joins a Redis consumer group (e.g. `ws:<uuid>`).
   - Filters deltas by `view_node_id`.
   - Streams messages back to the browser as JSON.
3. Ensure shutdown cleans up the consumer group (or expires after inactivity).
4. Continue delivering existing security updates alongside graph deltas.

### 4.5 Frontend Realtime Service
- New file `frontend/src/app/core/services/neo4j-realtime.service.ts`.
- Responsibilities:
  - Manage `/ws` connection, subscription message, exponential backoff, and status observable.
  - Parse backend JSON into a `GraphDelta` interface aligned with runtime DTOs.
  - Expose `delta$` for components.
  - Dispose resources in `disconnect`.

### 4.6 Runtime Canvas Integration
1. Extend `RuntimeCanvasController`:
   - Store `canvasId` for event emission.
   - Implement `applyDelta(delta, {recordHistory?: boolean})` that:
     - Updates `nodes`, `edges`, **and** `originalEdges`.
     - Keeps collapsed state and selection intact.
     - Schedules `layoutRuntime.setCanvasData(updatedData, shouldRunLayout, 'system')`.
     - Runs layout if positions are missing or container bounds change.
     - Emits `GraphDeltaApplied` on the event bus and triggers `onDataChanged` only when recording is desired.
   - Suppress history recording for system-origin updates by coordinating with `CanvasHistoryService.beginRestore/endRestore`.
2. Extend `CanvasEventBus` union with:
   ```ts
   | {
       readonly type: 'GraphDeltaApplied';
       readonly canvasId: string;
       readonly source: CanvasEventSource;
       readonly timestamp: number;
       readonly delta: { nodesCreated: number; nodesUpdated: number; ... };
     }
   ```
3. In `RuntimeCanvasComponent`:
   - Inject `Neo4jRealtimeService`.
   - Subscribe after the engine is created.
   - On destroy, unsubscribe and call `neo4jRealtime.disconnect()`.
   - Avoid duplicating subscriptions when a new ViewNode is selected.

### 4.7 Database Support
- Add `lastModified` (or similar) properties to nodes and relationships.
- Create indexes to support timestamp queries: `CREATE INDEX IF NOT EXISTS FOR (n:CodeElement) ON (n.lastModified);`
- If using APOC triggers, bundle trigger creation in deployment scripts so the dev + prod databases stay consistent.
- Ensure all write paths (imports, scripts, API handlers) update `lastModified`.

---

## 5. Implementation Roadmap

| Phase | Goal | Key Files |
|-------|------|-----------|
| **1. Types & DTOs** | Define `GraphDelta`, `NodeUpdate`, module wiring. | `services/api-gateway/src/graph_events/` |
| **2. Change Emission Hook** | Emit deltas from gateway write paths (initially behind a feature flag). | `handlers/cypher_unified.rs`, any bespoke write handlers |
| **3. Redis Stream Publisher** | Wrap Redis connection & publish helper with dedicated connection per worker. | `graph_events/redis_publisher.rs` |
| **4. WebSocket Subscription** | Extend `/ws` to accept graph subscriptions and stream filtered deltas. | `services/api-gateway/src/websocket.rs` |
| **5. Frontend Service** | Implement `Neo4jRealtimeService` with connection management. | `frontend/src/app/core/services/neo4j-realtime.service.ts` |
| **6. Runtime Delta Integration** | Add `applyDelta` to `RuntimeCanvasController`, event bus update, history suppression. | `frontend/src/app/shared/canvas/runtime-canvas-controller.ts`, `layout-events.ts`, `runtime-canvas.component.ts` |
| **7. Neo4j Timestamp Support** | Backfill timestamps, add indexes, optional APOC triggers. | Cypher migration scripts / infra |
| **8. Testing & Telemetry** | End-to-end test harness: mutate via API, assert WebSocket delta ➜ UI update. Monitor `GraphDeltaApplied` events. | Integration tests, logging |

Each phase should compile independently and default to a disabled state (feature flag like `ENABLE_GRAPH_DELTA_STREAM`) until the full pipeline is in place.

### 5.1 Build & Commit Cadence
For a smooth rollout and easy rollback, treat each phase as a self-contained commit with its own build/test gate:

| Phase | Primary Files | Required Command | Suggested Commit |
|-------|---------------|------------------|------------------|
| 1 | `services/api-gateway/src/graph_events/{mod.rs,types.rs}` | `cargo check -p kalisi-gateway` | `feat(graph-events): add graph delta DTOs` |
| 2 | `services/api-gateway/src/handlers/cypher_unified.rs`, `graph_events/emit.rs` | `cargo test -p kalisi-gateway handlers::cypher_unified` | `feat(graph-events): emit gateway deltas behind flag` |
| 3 | `services/api-gateway/src/graph_events/redis_publisher.rs`, `state.rs` (if wiring) | `cargo check -p kalisi-gateway` | `feat(graph-events): add redis delta publisher` |
| 4 | `services/api-gateway/src/websocket.rs` | `cargo test -p kalisi-gateway websocket` | `feat(websocket): stream graph deltas to subscribers` |
| 5 | `frontend/src/app/core/services/neo4j-realtime.service.ts`, module wiring | `(cd frontend && npm run build)` | `feat(frontend): add Neo4j realtime service` |
| 6 | `frontend/src/app/shared/canvas/runtime-canvas-controller.ts`, `layout-events.ts`, `runtime-canvas.component.ts` | `(cd frontend && npm run build)` | `feat(frontend): apply realtime graph deltas` |
| 7 | Cypher migration scripts, docs | No build; document commands | `chore(neo4j): add lastModified support` |
| 8 | Integration tests (Rust + Angular) | `cargo test -p kalisi-gateway`, `(cd frontend && npm run test)` | `test(realtime): cover websocket delta pipeline` |

Always run the listed command **before** committing. If new warnings appear, fix them in the same phase so the tree stays clean.

### 5.2 Deliverables per Phase
- **Phase 1:** DTO module, unit tests for basic serialization.
- **Phase 2:** Feature-flagged delta emitter in gateway, including placeholder diff logic (can be naïve initial implementation).
- **Phase 3:** Redis publisher with dedicated connection + simple smoke test (mock Redis or feature-flag skip).
- **Phase 4:** WebSocket subscription branch, acknowledging and forwarding delta messages.
- **Phase 5:** Angular service plumbing, connection status observable, reconnection/backoff.
- **Phase 6:** Runtime delta application, event bus emission, history suppression guard.
- **Phase 7:** Migration scripts + deployment notes for timestamps and indexes.
- **Phase 8:** Automated tests (API to WebSocket path, frontend unit tests for delta application).

Document feature flag defaults in `.env.example` during the appropriate phase so local environments stay predictable.

---

## 6. Agent Execution Checklist

1. **Confirm configuration**  
   - Ensure `ENABLE_GRAPH_DELTA=false` in local `.env` until the full pipeline is wired.  
   - Have Redis and Neo4j running locally (use `start.sh` if unsure).
2. **Work phase-by-phase**  
   - Follow Section 5 tables.  
   - After each phase: run the command, ensure no warnings, commit with suggested message.
3. **Gateway delta emission**  
   - For early smoke tests, add a temporary CLI or integration test that calls `/v0/cypher/unified` with a known ViewNode ID and prints the emitted delta.
4. **WebSocket contract**  
   - Use `wscat` or the existing frontend logger to subscribe via `{"type":"subscribe_graph_changes","viewNodeId": "<id>"}` and verify messages arrive.
5. **Frontend integration**  
   - Stub the backend by pushing a handcrafted `graph_delta` message through the WebSocket to confirm `RuntimeCanvasController.applyDelta` behaves before full backend is ready.
6. **Testing discipline**  
   - Before enabling the feature flag, ensure automated tests exist for the complete flow.
7. **Documentation updates**  
   - If assumptions shift (e.g., multiple ViewNodes affected by one query), update this document immediately so future agents stay aligned.

Keep a running checklist in the PR description referencing these steps; it makes reviews easier.

---

## 7. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Polling Neo4j misses external updates or causes load | Prefer direct emission from gateway. If polling is required, restrict to the relevant labels and verify indexes. |
| Redis consumer leaks | Tie consumer group lifetime to WebSocket lifecycle; reuse patterns from `redis_spa_bridge.rs`. |
| Frontend history spam | Use the existing `CanvasHistoryService.beginRestore/endRestore` hooks to suppress automatic history recording for system deltas. |
| Layout drift for new nodes | When delta lacks coordinates, run a partial layout pass and mark the node as system-positioned. |
| Backwards compatibility | Keep existing `/ws` payloads intact; extend with new `type` values rather than replacing current behaviour. |

---

## 8. Open Points to Decide
1. **Authoritative change source**: can we guarantee all writes flow through the gateway, or do we need CDC for external tooling?
2. **Delta granularity**: do we ever require “full refresh” events (e.g. when a batch import reorganises a view) or can we restrict to incremental operations?
3. **Retention**: should Redis keep historical deltas for late subscribers, or can we trim aggressively once acknowledged?

Answering these will help lock in stream configuration and payload shape.

---

## 9. Summary
- The runtime architecture is already primed for real-time updates thanks to the render loop, layout runtime, and WebSocket infrastructure.
- The recommended approach keeps change signalling close to the write pipeline, uses Redis Streams for fan-out, and layers delta application on top of the existing runtime controller.
- Implementation can be staged safely, with feature flags and integration tests at each milestone.
- Once delivered, Containment Runtime-Merge will reflect Neo4j updates instantly, without regressing legacy views. 

This document supersedes earlier drafts and represents the vetted plan aligned with the current codebase.
