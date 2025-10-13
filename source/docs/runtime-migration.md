# Layout Runtime Consolidation Plan

## Objectives
- Drive every canvas workflow through `CanvasLayoutRuntime` and the shared `CanvasEventBus`.
- Eliminate remaining stateful adapters and duplicated stores that mutate hierarchical nodes directly.
- Surface layout results exclusively via `PresentationFrame` deltas so renderers stay read‑only.

## Migration Sequencing
1. **Service Audit (completed)**  
   Retire legacy tab canvases, bespoke `CanvasService`, and the ad-hoc layout helpers in `core/services`.

2. **Canvas Engine Simplification (in-flight)**  
   - Fold residual reflow helpers (`DynamicLayoutService`) into a runtime module that subscribes to the event bus instead of cloning state via `CanvasViewStateService`.  
   - Cull remaining direct node mutations in `ComposableHierarchicalCanvasEngine` that bypass runtime snapshots.

3. **Runtime-Centric Commands**  
   - Extend `LayoutOrchestrator` so all layout triggers go through a command queue (see `docs/runtime-scheduler.md`).  
   - Persist authoritative camera + selection state in the runtime store to remove mirrored copies.

4. **Renderer Integration**  
   - Expose presentation-frame deltas as the sole input to renderers.  
   - Register renderer capabilities (Canvas2D/WebGL/WASM) through `RendererRegistryService` once it consumes presentation frames.

5. **AI & Automation Hooks**  
   - Publicize canvas events via the hub so chat/AI actions dispatch commands identical to UI gestures.  
   - Attach metrics (`durationMs`, node delta counts) to `LayoutApplied` events for telemetry.

## Touchpoints
- `frontend/src/app/shared/canvas/composable-hierarchical-canvas-engine.ts`
- `frontend/src/app/shared/canvas/layout-runtime.ts`
- `frontend/src/app/shared/layouts/core/layout-orchestrator.ts`
- `frontend/src/app/core/services/canvas-event-hub.service.ts`

## Risks & Mitigations
- **Risk:** Regression in collapse/expand auto-layout once reflow is moved into the runtime.  
  **Mitigation:** Create snapshot-based tests that compare layout graph deltas for collapse/expand scenarios.

- **Risk:** Event-loop backpressure when all commands route through the orchestrator.  
  **Mitigation:** Implement priority queue with guardrails (max in-flight per canvas) before enabling aggressive automation.

