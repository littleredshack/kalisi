# Canvas Renderer & Layout Extension Guide

This guide explains how the Kalisi canvas stack is composed and how to add new layout engines or renderers for custom view types. It complements the in-code comments in `src/app/shared/canvas` and `src/app/shared/composable`.

## High-Level Architecture

```text
Neo4j ViewNode → Layout Engine → CanvasData (nodes + edges) → Renderer → HTMLCanvasElement
```

- **Layout engines** (`ILayoutEngine`) convert raw entity/relationship data into positioned `HierarchicalNode` trees with `Edge` metadata (`layout.ts`).
- **Renderers** (`IRenderer`) receive `CanvasData` and paint it using the current camera state (`renderer.ts`).
- **Composable primitives** (`shared/composable/primitives`) provide reusable drawing and hit-testing helpers so custom engines can stay concise.
- **ComposableHierarchicalCanvasEngine** (`shared/canvas/composable-hierarchical-canvas-engine.ts`) orchestrates the selected layout + renderer, manages camera interactions, drag/resize state, and notifies Angular components when data changes.
- **ComponentFactory** (`shared/canvas/component-factory.ts`) instantiates the correct layout/renderer pair based on the ViewNode definition stored in Neo4j.

When a user selects a ViewNode, `ModularCanvasComponent` calls `ComponentFactory.createFromViewNode`, processes Neo4j data with the layout engine, then hands the resulting `CanvasData` to the canvas engine for rendering.

## Implementing a New Layout Engine

1. **Create the engine class**
   - Implement the `ILayoutEngine` interface from `shared/canvas/layout.ts`.
   - Either extend `BaseLayoutEngine` or build the contract directly.
   - Return positioned `HierarchicalNode[]` and optional `Camera` defaults in `applyLayout`.

2. **Use layout primitives or custom maths**
   - `LayoutPrimitives` (`shared/canvas/layout-primitives.ts`) contains helpers for grids, collision detection, resizing parents, etc.
   - The existing `HierarchicalLayoutStrategy` and `FlatGraphLayoutStrategy` in `layout-strategies.ts` are good reference points.

3. **Handle identifiers consistently**
   - Every node must surface its database GUID in `node.GUID`; edges should reference `fromGUID`/`toGUID`. The renderer resolves connections via GUIDs only.

4. **Optional: support viewport-aware sizing**
   - If the engine needs screen bounds, add a `setViewportBounds()` method. `LayoutEngineAdapter` shows how to expose that capability; `ModularCanvasComponent` calls it when available.

5. **Register the engine**
   - Add a case to `LayoutEngineFactory.create()` in `component-factory.ts` that returns your new engine when the matching `layout_engine` string is encountered.
   - Include the type in `LayoutEngineFactory.getAvailableTypes()` so admin UIs can list it.

6. **Authoring ViewNodes**
   - Set the `layout_engine` property on the ViewNode record (e.g. `"layout_engine": "my-custom-layout"`). The ComponentFactory will resolve it automatically.

### Minimal skeleton

```ts
// src/app/shared/layouts/my-custom-layout.ts
import { BaseLayoutEngine, LayoutResult } from '../canvas/layout';

export class MyCustomLayoutEngine extends BaseLayoutEngine {
  getName(): string { return 'my-custom-layout'; }

  applyLayout(entities: any[], relationships: any[]): LayoutResult {
    // Transform raw data into positioned HierarchicalNodes
    const nodes = /* ... */;
    const edges = /* ... */;
    return { nodes, camera: { x: 0, y: 0, zoom: 1 } };
  }
}
```

Update `LayoutEngineFactory` so `layout_engine = "my-custom-layout"` produces this class.

## Implementing a New Renderer

1. **Extend `BaseRenderer`**
   - Located in `shared/canvas/renderer.ts`. You must implement `render`, `getName`, and `getDefaultNodeStyle`.
   - Optionally override `hitTest`, `getNodeBounds`, and `renderSelection` for custom behaviour.

2. **Leverage composable primitives**
   - `HierarchicalNodePrimitive` / `FlatNodePrimitive` draw nodes with consistent styling and camera transforms.
   - `HierarchicalEdgePrimitive` / `FlatEdgePrimitive` attach edges to the correct border points and respect waypoints.
   - `DrawingPrimitives` supply low-level rounded rectangles, text, and line utilities.

3. **Respect camera transforms**
   - Convert world coordinates to screen space with `(world - camera) * camera.zoom` just like the existing renderers do.

4. **Inherited edges & collapse behaviour**
   - If you are rendering hierarchical structures, reuse `HierarchicalNodePrimitive` so collapse modes driven by `ViewNodeStateService` keep working.
   - The containment + orthogonal renderer demonstrates how to listen for collapse mode changes (`setViewNodeStateService`).

5. **Register the renderer**
   - Add a case to `RendererFactory.create()` and `getAvailableTypes()` in `component-factory.ts`.
   - ViewNodes specify renderers via the `renderer` field (e.g. `"renderer": "composable-containment-orthogonal"`).

### Minimal skeleton

```ts
// src/app/shared/composable/renderers/my-custom-renderer.ts
import { BaseRenderer } from '../../canvas/renderer';

export class MyCustomRenderer extends BaseRenderer {
  getName(): string { return 'my-custom-renderer'; }
  getDefaultNodeStyle(type: string) { return { fill: '#1f2937', stroke: '#4b5563' }; }

  render(ctx, nodes, edges, camera): void {
    // Draw nodes first, then edges; use primitives where possible
  }
}
```

Register the renderer type in `RendererFactory` so `renderer = "my-custom-renderer"` can be resolved.

## Wiring Everything Together

1. **ViewNode definition**
   - In Neo4j, each ViewNode should include `layout_engine` and `renderer` properties.
   - `ComponentFactory.createFromViewNode()` uses those values to select your implementations.

2. **Data transformation**
   - `ModularCanvasComponent` calls `convertDataWithLayoutEngine()`; if your engine needs a different data shape, adapt this method or add a dedicated transformer service.

3. **Testing & Iteration tips**
   - Enable verbose logging in your layout/renderer to trace node positions and camera state (`ComposableHierarchicalCanvasEngine` logs selected renderer/layout names already).
   - Use the in-app debug panel to inspect `CanvasData` when developing new layouts.
   - To simulate different screen sizes, trigger `ResizeObserver` by resizing the browser—`ModularCanvasComponent` passes updated dimensions to the engine via `updateCanvasSize()`.

## Reference Files

- `src/app/shared/canvas/layout.ts` – layout interfaces and base class
- `src/app/shared/canvas/renderer.ts` – renderer interface and base class
- `src/app/shared/canvas/component-factory.ts` – factory wiring for layouts/renderers
- `src/app/shared/composable/primitives/*` – reusable node/edge drawing helpers
- `src/app/shared/composable/renderers/*` – existing renderer implementations
- `src/app/shared/layouts/*` – existing layout engines and strategies
- `src/app/components/modular-canvas/modular-canvas.component.ts` – Angular bridge that wires everything together

With these extension points documented, you can add new visualisations by creating a layout engine that shapes your data and a renderer that paints it, then pointing a ViewNode at those types.
