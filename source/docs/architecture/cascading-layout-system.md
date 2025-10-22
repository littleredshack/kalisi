# Cascading Layout & Rendering Architecture

This document describes the production runtime architecture for containment-aware layouts. The objectives are:

1. **Immutable graph dataset** – the Neo4j snapshot is kept intact on the client and never mutated by user actions.
2. **Cascading view profiles** – per-node overrides (style, layout, visibility) cascade through the hierarchy, similar to CSS inheritance.
3. **Layout-engine responsibility** – containment and edge visibility are handled inside the layout engine; renderers only paint the latest layout output.
4. **Observable updates** – any interaction that changes view profiles triggers a re-layout via an observer pattern.
5. **Realtime friendly** – streaming deltas update the dataset while view profiles remain layered on top.

---

## 1. Data Layers

```
┌────────────────────────────┐
│  Graph Dataset (immutable) │   ← canonical CanvasData clone from Neo4j
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│   View Profile Store       │   ← OverlayStore + OverlayResolver
│   - global defaults        │
│   - node/edge overrides    │
│   - cascade / stop rules   │
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│ Layout Runtime             │   ← CanvasLayoutRuntime
│   - clone canonical data   │
│   - apply view profiles    │
│   - run layout engine      │
│   - expose presentation    │
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│ Renderer                    │   ← RuntimeContainmentRenderer / RuntimeFlatRenderer
└────────────────────────────┘
```

### 1.1 Graph Dataset

* Stored as `canonicalModelData` inside `CanvasLayoutRuntime`.
* Recreated from fresh Neo4j data and never mutated by UI code.
* Every `runLayout()` call begins by cloning this canonical snapshot so layout starts from a clean baseline.

### 1.2 View Profile Store

* Implemented by `OverlayStore`/`OverlayResolver`.
* Profiles support: containment mode, layout hints, node style, edge style, visibility.
* Profiles cascade through ancestors; overrides can opt out of inheritance via `stopCascade`.

---

## 2. Layout Pipeline

1. **Reset working data** – `runLayout()` clones `canonicalModelData` and reapplies the last camera position.
2. **Apply view profiles** – `applyOverlayProfiles()` walks the hierarchy, resolves cascading profiles, stamps them into node metadata, and updates style/visibility without mutating node geometry.
3. **Generate layout graph** – the adjusted `CanvasData` is converted to a `LayoutGraph` and handed to the orchestrator.
4. **Containment engine** – `ContainmentRuntimeLayoutEngine`:
   - interprets node metadata (`resolvedProfile`)
   - positions children inside parents when containment is on
   - keeps CONTAINS edges but marks them hidden via `metadata.visible`
   - honours containment/collapse directives from view profiles
5. **Presentation frame** – `buildPresentationFrame()` wraps the layout result and records renderer hints (renderer id, metadata, delta tracking).
6. **Rendering** – runtime renderers read the layout output. They no longer decide containment; they simply skip edges whose metadata marks them invisible.

---

## 3. Interaction Flow

| Interaction             | Action                                                                 | Result                                      |
|-------------------------|-------------------------------------------------------------------------|---------------------------------------------|
| Node style edit         | `OverlayService.applyNodeStyle`                                         | Style cascade applied next layout run       |
| Drag                    | View graph node position updated directly                                | Layout engine reuses new coordinates        |
| Resize                  | Node width/height updated directly                                      | Layout engine honours updated dimensions    |
| Containment toggle      | Root profile updated (`containmentMode`), overlay change triggers re-run| Layout engine recomputes containment layout |
| Collapse / expand       | `OverlayService.applyNodeCollapse`                                      | Layout engine hides descendants / updates layout|

Overlay changes emit through `OverlayService.changes$`. `RuntimeCanvasController` subscribes and calls `scheduleOverlayRefresh()`, which queues a `runLayout()` call. This implements the observer pattern—every profile change results in a deterministic re-layout.

---

## 4. Realtime Updates

1. Neo4j delta arrives and updates the canonical dataset (`canonicalModelData`).
2. Profiles for removed nodes are dropped; new nodes inherit defaults automatically via cascade resolution.
3. `runLayout()` is invoked, so containment/layout honour the latest dataset without losing user overrides.

---

## 5. Renderer Contract

* Renderers only draw the data handed to them—no containment logic.
* Edge visibility is read from `edge.metadata.visible` (set by the layout engine).
* Node metadata includes the resolved profile for HUD panels; renderers do not mutate node geometry.

---

## 6. Implementation Checklist

- [x] Layout engine owns containment edge visibility.
- [x] Overlay resolver supplies cascading style/visibility/collapse information.
- [x] `runLayout()` begins from canonical data each time.
- [x] Interactions update overlay profiles; canonical dataset stays immutable.
- [x] Observer pattern re-runs layout whenever profiles change.
- [x] Renderers remain stateless painters.

### Remaining Work
- [ ] Persist overlay profiles alongside view presets / saved layouts.
- [ ] Apply realtime deltas to datasets while pruning overlay entries for removed nodes.
- [ ] Expand Playwright coverage for collapse/expand behaviour.
