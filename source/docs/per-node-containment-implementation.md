# Per-Node Containment Implementation

## Overview
Implemented flexible per-node containment control that allows users to toggle containment on/off for individual nodes in the hierarchy. This propagates down the hierarchy with full override flexibility at any level.

## Changes Made

### 1. Layout Engine Updates
**File:** `frontend/src/app/shared/layouts/engines/containment-runtime-layout.engine.ts`

- Modified `layoutContainer()` method to check per-node containment mode via `NodeConfigManager`
- Per-node settings override global containment mode
- When a node has `renderStyle.nodeMode === 'flat'`, its children are flattened into a grid
- When a node has `renderStyle.nodeMode === 'container'`, its children use hierarchical containment
- Setting `nodeMode === 'inherit'` uses the parent/global setting
- Fully recursive - each node can have different settings

### 2. Service Layer
**File:** `frontend/src/app/core/services/canvas-control.service.ts`

Added three new methods:
- `setNodeContainmentMode(nodeId, mode, applyToDescendants)` - Set per-node containment
- `setNodeLayoutStrategy(nodeId, strategy, applyToDescendants)` - Set per-node layout strategy
- `clearNodeConfig(nodeId)` - Remove node-specific configuration

These methods emit `NodeConfigChanged` events through the event hub.

### 3. UI Controls
**File:** `frontend/src/app/components/layout-panel/layout-panel.component.ts`

Added new "Node Settings" section in the floating Layout Panel that appears when a node is selected:
- **Containment Mode** dropdown: Inherit / Container (nested) / Flat (flatten children)
- **Layout Strategy** dropdown: Inherit / Grid / Force-directed / Tree / Manual
- **Apply to descendants** checkbox
- **Clear Node Config** button to reset to defaults

The controls appear in the floating Layout Panel (toggled with Alt+L) for quick access while working with the graph.

### 4. Type Extensions
**File:** `frontend/src/app/shared/canvas/types.ts`

Extended `NodeSelectionSnapshot` interface to include:
- `text` field for display name
- `layoutConfig` object containing current node configuration

## Architecture

The system uses a **cascading configuration model** similar to CSS:

```
Global Settings
  ↓ (inherit)
Node Config
  ↓ (inherit)
Child Node Config
  ↓ (inherit)
...
```

Each node can:
1. **Inherit** from parent (default)
2. **Override** with its own setting
3. **Cascade** to all descendants (optional)

## Data Flow

```
User selects node and changes containment mode in Layout Panel
  ↓
Layout Panel calls CanvasControlService.setNodeContainmentMode()
  ↓
Service emits NodeConfigChanged event via CanvasEventHubService
  ↓
RuntimeCanvasComponent receives event
  ↓
Component gets NodeConfigManager from CanvasLayoutRuntime
  ↓
NodeConfigManager.setNodeConfig() updates configuration
  ↓
Layout engine runs and checks resolved config for each node
  ↓
Nodes with 'flat' mode flatten their children
Nodes with 'container' mode use hierarchical containment
  ↓
Renderer displays updated layout
```

## Event Structure

### NodeConfigChanged Event
```typescript
{
  type: 'NodeConfigChanged',
  canvasId: string,
  nodeId: string,
  config: {
    renderStyle?: {
      nodeMode?: 'container' | 'flat' | 'inherit'
    },
    layoutStrategy?: 'grid' | 'force' | 'tree' | 'manual' | 'inherit',
    applyToDescendants?: boolean
  },
  source: 'user',
  timestamp: number
}
```

## Integration Complete

All integration steps have been completed:

✅ **Event Subscription** - RuntimeCanvasComponent subscribes to NodeConfigChanged and NodeConfigCleared events
✅ **NodeConfigManager Integration** - Uses the NodeConfigManager from CanvasLayoutRuntime
✅ **Event Handling** - Events trigger config updates and relayout
✅ **Selection Snapshots** - NodeSelectionSnapshot includes layoutConfig field
✅ **UI Controls** - Per-node controls in Layout Panel with live updates

### Event Handlers (Implemented)
```typescript
// RuntimeCanvasComponent handles NodeConfigChanged events
private handleNodeConfigChanged(event: any): void {
  const runtime = (this.engine as any).layoutRuntime as CanvasLayoutRuntime;
  const nodeConfigManager = runtime.getNodeConfigManager();
  nodeConfigManager.setNodeConfig(event.nodeId, event.config);
  this.engine.runLayout();  // Triggers relayout with new config
}

// RuntimeCanvasComponent handles NodeConfigCleared events
private handleNodeConfigCleared(event: any): void {
  const runtime = (this.engine as any).layoutRuntime as CanvasLayoutRuntime;
  const nodeConfigManager = runtime.getNodeConfigManager();
  nodeConfigManager.removeNodeConfig(event.nodeId);
  this.engine.runLayout();  // Triggers relayout
}
```

## Testing Strategy

1. **Basic Toggle**: Select a node, change containment to "Flat", verify children are flattened
2. **Hierarchy Test**:
   - Set root node to "Container"
   - Set child node to "Flat"
   - Set grandchild back to "Container"
   - Verify each level respects its setting
3. **Cascade Test**: Enable "Apply to descendants", verify all children inherit the setting
4. **Persistence**: Save layout, reload, verify node configs are preserved
5. **Mixed Modes**: Create graph with mixture of flat and container nodes at different levels

## Known Limitations

- Event handling needs to be integrated into canvas components
- NodeConfigManager instance needs to be passed to layout engine
- Selection snapshot needs to include current node config for UI display
- Layout config should be persisted with ViewGraph data

## Benefits

- **Full flexibility**: Control containment at any level of hierarchy
- **Cascading inheritance**: Changes propagate down but can be overridden
- **Clean separation**: Layout logic, data model, UI, and state management are decoupled
- **Reusable**: NodeConfigManager can be extended for other per-node settings
