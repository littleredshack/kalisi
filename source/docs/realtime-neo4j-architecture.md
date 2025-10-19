# Real-Time Neo4j Updates - Architecture Analysis

**Target System**: RuntimeCanvasComponent → RuntimeCanvasController → ContainmentRuntime-Merge View

---

## Current Architecture

### Data Flow (One-Time Load)
```
Neo4j Database
    ↓ (HTTP POST)
Rust API Gateway (/runtime/canvas/data)
    ↓ (HTTP Response)
Neo4jDataService.executeViewNodeQuery()
    ↓
RuntimeCanvasComponent.loadViewNodeData()
    ↓
RuntimeCanvasController.setData()
    ↓
LayoutRuntime → ContainmentRuntimeLayoutEngine
    ↓
Canvas Renderer
```

### Current Behavior
- Data is loaded **ONCE** when ViewNode is selected
- **NO polling or refresh mechanism**
- User must manually reload to see database changes
- WebSocket infrastructure exists but **NOT used for graph data**

### Existing WebSocket Infrastructure
✅ **Already Implemented:**
- `/ws` endpoint in api-gateway (websocket.rs)
- WebSocketLoggerService for console logging
- RedisSpaService for agent messaging
- LogsPanelComponent uses WebSocket for streaming logs

❌ **Not Implemented:**
- Neo4j change notifications
- Graph data streaming
- Real-time node/edge updates

---

## Best Practice Options for Real-Time Neo4j Updates

### Option 1: **Neo4j Change Data Capture (CDC)** ⭐ RECOMMENDED

**How It Works:**
```
Neo4j Database (with CDC plugin)
    ↓ (Kafka/NATS)
CDC Event Processor (Rust)
    ↓ (WebSocket broadcast)
Frontend Clients (via existing /ws)
```

**Pros:**
- ✅ Native Neo4j support (Enterprise & Community)
- ✅ Event-driven, low latency (<100ms)
- ✅ Captures ALL changes (CREATE, UPDATE, DELETE, relationships)
- ✅ No polling overhead
- ✅ Scalable to thousands of nodes
- ✅ Industry standard pattern

**Cons:**
- ⚠️ Requires Neo4j plugin configuration
- ⚠️ Need message broker (Kafka/NATS/Redis Streams)
- ⚠️ More complex initial setup

**Neo4j CDC Configuration:**
```cypher
// Enable CDC on database
CALL apoc.cdc.enable('graph-changes');

// Configure change stream
CALL apoc.cdc.query('graph-changes', {
  select: 'n, r',
  where: 'n:CodeElement OR n:ViewNode',
  changeMode: 'diff'
}) YIELD txId, changes
```

---

### Option 2: **Polling with Smart Diffing**

**How It Works:**
```
Frontend (setInterval every 2-5 seconds)
    ↓ (HTTP POST with lastModified timestamp)
API Gateway (query only changed nodes)
    ↓
Neo4j (WHERE lastModified > $timestamp)
    ↓
Return delta (changed/added/deleted nodes)
```

**Pros:**
- ✅ Simple to implement (no new infrastructure)
- ✅ Uses existing HTTP endpoints
- ✅ No Neo4j plugins required
- ✅ Good for low-frequency updates

**Cons:**
- ❌ Requires `lastModified` timestamp on ALL nodes
- ❌ Polling overhead (wasted queries when no changes)
- ❌ Higher latency (2-5 second delay)
- ❌ Doesn't scale well (1000 clients = 1000 queries/second)
- ❌ Misses rapid changes between polls

**Implementation:**
```typescript
// Frontend polling
setInterval(async () => {
  const delta = await neo4jService.getDelta(lastTimestamp);
  if (delta.hasChanges) {
    runtimeController.applyDelta(delta);
  }
}, 3000);
```

---

### Option 3: **WebSocket + Transaction Log Tailing**

**How It Works:**
```
Neo4j Transaction Log
    ↓ (Custom Rust reader)
Transaction Log Parser
    ↓ (WebSocket broadcast)
Frontend Clients
```

**Pros:**
- ✅ Near real-time (<50ms)
- ✅ Captures ALL database changes
- ✅ No Neo4j configuration needed

**Cons:**
- ❌ Requires direct filesystem access to Neo4j logs
- ❌ Complex parsing logic
- ❌ Fragile (log format changes break it)
- ❌ Not officially supported by Neo4j

---

### Option 4: **Server-Sent Events (SSE)**

**How It Works:**
```
Neo4j (polling or CDC)
    ↓
API Gateway (SSE endpoint /sse/graph-changes)
    ↓ (text/event-stream)
Frontend (EventSource)
```

**Pros:**
- ✅ Built-in browser support (EventSource API)
- ✅ Simpler than WebSocket
- ✅ Automatic reconnection

**Cons:**
- ❌ One-way only (server → client)
- ❌ Less efficient than WebSocket
- ❌ Still need Neo4j change detection

---

## Recommended Architecture: **Neo4j CDC + WebSocket**

### Why This Is Best

1. **Event-Driven**: Changes push instantly, no polling waste
2. **Scalable**: Handles thousands of concurrent clients
3. **Reliable**: Native Neo4j support, battle-tested
4. **Efficient**: Only transmit changed data
5. **Integrates with Existing Infrastructure**: Uses current WebSocket endpoint

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Neo4j Database                          │
│  (WITH CDC PLUGIN ENABLED)                                   │
└────────────────────┬────────────────────────────────────────┘
                     │ CDC Events
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Message Broker (NATS/Redis)                     │
│  Stream: graph-changes                                       │
│  Events: node_created, node_updated, node_deleted           │
│          relationship_created, relationship_deleted          │
└────────────────────┬────────────────────────────────────────┘
                     │ Subscribe
                     ↓
┌─────────────────────────────────────────────────────────────┐
│           Rust API Gateway (NEW: CDC Processor)              │
│                                                              │
│  1. Subscribe to graph-changes stream                        │
│  2. Filter events (only relevant ViewNode queries)           │
│  3. Transform to frontend format                             │
│  4. Broadcast via WebSocket                                  │
└────────────────────┬────────────────────────────────────────┘
                     │ WebSocket /ws
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Frontend (Angular)                              │
│                                                              │
│  Neo4jRealtimeService                                        │
│      ↓                                                       │
│  RuntimeCanvasComponent                                      │
│      ↓                                                       │
│  RuntimeCanvasController.applyDelta()                        │
│      ↓                                                       │
│  LayoutRuntime (incremental update)                          │
│      ↓                                                       │
│  Renderer (animated transition)                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Infrastructure Setup

#### 1.1 Neo4j CDC Configuration
```bash
# Install Neo4j CDC plugin (if not present)
# Add to neo4j.conf:
apoc.cdc.enabled=true
apoc.cdc.change.identifier.topic=graph-changes
```

#### 1.2 Message Broker (Use existing Redis or add NATS)
```bash
# Option A: Redis Streams (if already using Redis)
# Already available in your stack

# Option B: NATS (lightweight, fast)
docker run -d --name nats -p 4222:4222 nats:latest
```

#### 1.3 Backend: CDC Event Processor (Rust)

**New Module**: `services/api-gateway/src/neo4j_cdc.rs`

```rust
use tokio::sync::broadcast;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GraphChangeEvent {
    NodeCreated { guid: String, labels: Vec<String>, properties: serde_json::Value },
    NodeUpdated { guid: String, properties: serde_json::Value },
    NodeDeleted { guid: String },
    RelationshipCreated { guid: String, from: String, to: String, rel_type: String },
    RelationshipDeleted { guid: String },
}

pub struct Neo4jCdcProcessor {
    redis_client: redis::Client,
    broadcast_tx: broadcast::Sender<GraphChangeEvent>,
}

impl Neo4jCdcProcessor {
    pub async fn start(&self) {
        // Subscribe to Redis stream: graph-changes
        let mut conn = self.redis_client.get_async_connection().await.unwrap();

        loop {
            // Read CDC events from Redis
            let events: Vec<GraphChangeEvent> = redis::cmd("XREAD")
                .arg("BLOCK").arg(0)
                .arg("STREAMS").arg("graph-changes").arg("$")
                .query_async(&mut conn)
                .await.unwrap();

            for event in events {
                // Broadcast to all WebSocket clients
                let _ = self.broadcast_tx.send(event);
            }
        }
    }
}
```

**Update**: `services/api-gateway/src/websocket.rs`

```rust
// Add to handle_socket()
match msg_data.get("type").and_then(|t| t.as_str()) {
    Some("subscribe_graph_changes") => {
        let view_node_id = msg_data.get("viewNodeId")
            .and_then(|v| v.as_str())
            .unwrap_or("all");

        // Subscribe this client to graph changes
        let mut cdc_rx = state.cdc_processor.subscribe();

        tokio::spawn(async move {
            while let Ok(event) = cdc_rx.recv().await {
                // Filter events for this ViewNode
                if should_send_to_client(&event, view_node_id) {
                    let json = serde_json::to_string(&event).unwrap();
                    let _ = socket.send(Message::Text(json.into())).await;
                }
            }
        });
    }
    // ... existing ping, console_log handlers
}
```

### Phase 2: Frontend Integration

#### 2.1 New Service: `Neo4jRealtimeService`

**File**: `frontend/src/app/core/services/neo4j-realtime.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface GraphDelta {
  nodesCreated: HierarchicalNode[];
  nodesUpdated: { guid: string; properties: any }[];
  nodesDeleted: string[];
  relationshipsCreated: Edge[];
  relationshipsDeleted: string[];
}

@Injectable({ providedIn: 'root' })
export class Neo4jRealtimeService {
  private ws: WebSocket | null = null;
  private deltaSubject = new Subject<GraphDelta>();

  public delta$ = this.deltaSubject.asObservable();
  public connected$ = new BehaviorSubject<boolean>(false);

  connect(viewNodeId: string): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}//${host}/ws`);

    this.ws.onopen = () => {
      this.connected$.next(true);

      // Subscribe to graph changes for this ViewNode
      this.ws!.send(JSON.stringify({
        type: 'subscribe_graph_changes',
        viewNodeId: viewNodeId
      }));
    };

    this.ws.onmessage = (event) => {
      const change = JSON.parse(event.data);
      this.processCDCEvent(change);
    };

    this.ws.onclose = () => {
      this.connected$.next(false);
    };
  }

  private processCDCEvent(event: any): void {
    // Accumulate changes into delta
    const delta: GraphDelta = {
      nodesCreated: [],
      nodesUpdated: [],
      nodesDeleted: [],
      relationshipsCreated: [],
      relationshipsDeleted: []
    };

    switch (event.type) {
      case 'NodeCreated':
        delta.nodesCreated.push(this.convertToHierarchicalNode(event));
        break;
      case 'NodeUpdated':
        delta.nodesUpdated.push({ guid: event.guid, properties: event.properties });
        break;
      case 'NodeDeleted':
        delta.nodesDeleted.push(event.guid);
        break;
      case 'RelationshipCreated':
        delta.relationshipsCreated.push(this.convertToEdge(event));
        break;
      case 'RelationshipDeleted':
        delta.relationshipsDeleted.push(event.guid);
        break;
    }

    this.deltaSubject.next(delta);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
```

#### 2.2 Update RuntimeCanvasController

**File**: `frontend/src/app/shared/canvas/runtime-canvas-controller.ts`

```typescript
/**
 * Apply incremental delta to canvas data
 * For real-time Neo4j CDC updates
 */
public applyDelta(delta: GraphDelta): void {
  const data = this.layoutRuntime.getCanvasData();

  // Apply node deletions
  delta.nodesDeleted.forEach(guid => {
    const index = data.nodes.findIndex(n => (n.GUID ?? n.id) === guid);
    if (index !== -1) {
      data.nodes.splice(index, 1);
    }
  });

  // Apply node updates
  delta.nodesUpdated.forEach(update => {
    const node = data.nodes.find(n => (n.GUID ?? n.id) === update.guid);
    if (node) {
      Object.assign(node, update.properties);
    }
  });

  // Apply node creations
  delta.nodesCreated.forEach(newNode => {
    data.nodes.push(newNode);
  });

  // Apply relationship deletions
  delta.relationshipsDeleted.forEach(guid => {
    const index = data.edges.findIndex(e => e.id === guid);
    if (index !== -1) {
      data.edges.splice(index, 1);
    }
  });

  // Apply relationship creations
  delta.relationshipsCreated.forEach(newEdge => {
    data.edges.push(newEdge);
  });

  // Recompute edges with inheritance
  data.edges = this.computeEdgesWithInheritance(data.originalEdges || data.edges);

  // Update layout runtime
  this.layoutRuntime.setCanvasData(data, false);

  // Trigger re-render with animation
  if (this.onDataChangedCallback) {
    this.onDataChangedCallback(data);
  }
}
```

#### 2.3 Update RuntimeCanvasComponent

**File**: `frontend/src/app/components/modular-canvas/runtime-canvas.component.ts`

```typescript
import { Neo4jRealtimeService } from '../../core/services/neo4j-realtime.service';

export class RuntimeCanvasComponent implements OnInit, OnDestroy {
  private realtimeSubscription?: Subscription;

  constructor(
    // ... existing dependencies
    private neo4jRealtime: Neo4jRealtimeService
  ) {}

  private async loadViewNodeData(viewNodeId: string): Promise<void> {
    // ... existing initial load logic

    // NEW: Subscribe to real-time updates
    this.neo4jRealtime.connect(viewNodeId);

    this.realtimeSubscription = this.neo4jRealtime.delta$.subscribe(delta => {
      if (this.engine) {
        this.engine.applyDelta(delta);
      }
    });
  }

  ngOnDestroy(): void {
    // ... existing cleanup
    this.neo4jRealtime.disconnect();
    this.realtimeSubscription?.unsubscribe();
  }
}
```

---

## What Needs to Change

### Backend Changes
1. ✅ WebSocket infrastructure exists - just extend it
2. ⚠️ **NEW**: Neo4j CDC plugin configuration
3. ⚠️ **NEW**: CDC event processor (Rust module)
4. ⚠️ **NEW**: Message broker integration (Redis Streams or NATS)
5. ✅ Existing websocket.rs - add graph_changes subscription handler

### Frontend Changes
1. ⚠️ **NEW**: `Neo4jRealtimeService` (WebSocket client for graph data)
2. ⚠️ **NEW**: `RuntimeCanvasController.applyDelta()` method
3. ⚠️ **MODIFY**: `RuntimeCanvasComponent` - subscribe to delta$
4. ✅ RuntimeCanvasController already has state management
5. ✅ LayoutRuntime already supports incremental updates

### Database Changes
1. ⚠️ **REQUIRED**: Enable Neo4j CDC plugin
2. ⚠️ **REQUIRED**: Add `lastModified` timestamp to all nodes (for fallback polling)
3. ⚠️ **RECOMMENDED**: Index on timestamps for efficient queries

---

## Effort Estimation

| Component | Complexity | Time Estimate |
|-----------|-----------|---------------|
| Neo4j CDC Setup | Low | 2-4 hours |
| Message Broker (Redis Streams) | Low | 2-4 hours |
| Backend CDC Processor | Medium | 1-2 days |
| Frontend Neo4jRealtimeService | Low | 4-6 hours |
| RuntimeCanvasController.applyDelta() | Medium | 1 day |
| Integration & Testing | Medium | 1-2 days |
| **TOTAL** | - | **4-6 days** |

---

## Performance Considerations

### Scalability
- ✅ WebSocket: Handles 10,000+ concurrent connections
- ✅ Neo4j CDC: Minimal overhead (<1% query performance impact)
- ✅ Message Broker: NATS = 11M msg/sec, Redis Streams = 1M msg/sec
- ⚠️ Frontend: Throttle delta application (max 60fps)

### Bandwidth
- Average change event: ~500 bytes
- 100 changes/second = 50 KB/sec per client
- 1000 clients = 50 MB/sec total (easily handled)

### Latency
- Neo4j CDC → Message Broker: <10ms
- Message Broker → WebSocket: <20ms
- WebSocket → Frontend: <20ms
- **Total: <50ms end-to-end**

---

## Alternative: Quick Win with Polling

If CDC setup is too complex initially, implement polling as Phase 1:

```typescript
// Simple polling fallback
private startPolling(viewNodeId: string): void {
  setInterval(async () => {
    const delta = await this.neo4jDataService.getGraphDelta(
      viewNodeId,
      this.lastPollTimestamp
    );

    if (delta.hasChanges) {
      this.engine?.applyDelta(delta);
      this.lastPollTimestamp = Date.now();
    }
  }, 3000); // Poll every 3 seconds
}
```

**Pros**: Implement in 1 day, no infrastructure changes
**Cons**: Higher latency, polling overhead, requires timestamps

---

## Recommendation

**Start with CDC + WebSocket architecture** because:

1. ✅ Your WebSocket infrastructure is already built
2. ✅ Scales to production (thousands of nodes, thousands of users)
3. ✅ Industry best practice
4. ✅ Low latency (<50ms)
5. ✅ Minimal rework needed (extends existing systems)
6. ✅ Future-proof (supports complex queries, filters, subscriptions)

**Fallback**: If Neo4j CDC proves difficult, use polling temporarily while CDC is configured.

---

## Questions to Answer

1. **Is Neo4j Enterprise or Community Edition?** (CDC available in both)
2. **What message broker is preferred?** (Redis Streams = easy, NATS = fast)
3. **What's acceptable update latency?** (<50ms CDC, 2-5s polling)
4. **How many concurrent users expected?** (affects scaling strategy)
5. **Should updates be throttled/batched?** (prevents UI jank on rapid changes)
