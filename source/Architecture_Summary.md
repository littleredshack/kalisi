# Frontend Architecture Analysis

## Framework & Technology Stack
- **Angular 20.1.0** - Latest version of Angular framework (standalone components pattern)
- **TypeScript 5.8.2** - Type-safe development
- **RxJS 7.8** - Reactive programming for state management
- **PrimeNG 20.0.1** - UI component library
- **PrimeFlex** - CSS utility library
- **SCSS** - Advanced styling with variables and mixins

## Component Architecture

The app follows a modular, feature-based architecture:

### 1. Core Module (`/app/core/`)
- **Services** (40+ services) handling business logic:
  - State management (state-manager.service.ts, ui-state.service.ts)
  - Data services (neo4j-data.service.ts, redis-spa.service.ts)
  - Layout engines (fluid-layout, grid-layout, force-directed-layout)
  - Rendering services (webgl-renderer, multi-view-renderer, isolated-renderer)

### 2. Feature Modules
- **Auth** - Authentication components
- **Chat** - Chat functionality with panels
- **Admin** - Administrative features
- **Settings** - User settings and preferences
- **Views** - Different view implementations

### 3. Shared Components (`/app/components/`)
- Canvas components (modular-canvas, hierarchical-canvas)
- Panel components (activity-bar, properties-panel, debug-panel)
- Graph visualization (graph-view)
- Tab management (tab-bar, tab-canvas)

## State Management

Multi-layered state management approach:

### 1. Angular Signals (ui-state.service.ts:1-161)
- Modern reactive state with `signal()` and `computed()`
- Manages UI state like panels, active views, and user preferences
- Automatic persistence to localStorage

### 2. RxJS Observables (state-manager.service.ts:1-100)
- BehaviorSubjects for tab-specific states
- Observable pattern for state change events
- Independent STATE instances per tab

### 3. Service-based State
- ViewNodeStateService for view-specific state
- TreeStateService for hierarchical data
- ItemsStoreService for data management

## Routing & Navigation

Simple routing structure (app.routes.ts:1-7):
- Single main route to `LandingShellComponent`
- Lazy loading prepared but commented out
- In-memory scroll position restoration

## Styling Approach

### 1. Design System
- CSS custom properties for theming (styles.scss:13-25)
- Futuristic HUD aesthetic with Orbitron & Inter fonts
- Dark theme with blue accent colors

### 2. Component Styling
- SCSS per component (encapsulated styles)
- PrimeNG Aura theme with dark mode
- PrimeFlex utilities for rapid development

### 3. Responsive Design
- Flexbox layouts via PrimeFlex
- Custom grid systems in canvas components

## Key Architectural Patterns

1. **Standalone Components** - Modern Angular approach without NgModules
2. **Service-oriented Architecture** - Heavy use of injectable services
3. **Canvas-based Rendering** - WebGL and 2D canvas for complex visualizations
4. **Plugin Architecture** - Renderer registry for extensible rendering
5. **Real-time Data** - WebSocket integration for live updates
6. **Multi-tab State** - Independent state management per tab

## Data Flow
- Neo4j graph database integration
- Redis for caching/session management
- HTTP client for REST APIs
- WebSocket for real-time features
- GPT chat service for AI integration

This architecture supports a complex, data-intensive application with real-time visualization capabilities, multiple rendering engines, and sophisticated state management.

---

# Composable Rendering Implementation Analysis

## Architecture Overview

The application implements a sophisticated **multi-layered composable rendering system** that supports multiple rendering technologies and approaches:

## 1. Renderer Registry Pattern (renderer-registry.service.ts)

**Factory-based plugin system:**
- **Factory Registration**: Renderers register via `RendererFactory` interface
- **Capability Detection**: Each factory declares WebGL/WASM support
- **Best-fit Selection**: Automatically selects optimal renderer based on:
  - View type compatibility
  - WASM availability
  - WebGL support
  - Fallback to 2D Canvas

**Key interfaces:**
```typescript
RendererFactory {
  supportsViewType(viewType): boolean
  canUseWasm(): boolean
  canUseWebGL(): boolean
  createRenderer(config): Promise<Renderer>
}
```

## 2. Hierarchical Canvas System

**Scene Graph Architecture** (scene-graph.ts:1-150):
- **True parent-child relationships** with transform inheritance
- **Transform matrices** (local & world) cached for performance
- **Node types**: Group, Rectangle, Text
- **Lifecycle hooks**: `onRender()`, `onUpdate()`, `onHitTest()`

**Render Pipeline** (render-system.ts:1-150):
- **Dirty region tracking** for optimized redraws
- **Render culling** - skip off-screen nodes
- **Batch rendering** with render queue
- **Transform inheritance** through matrix multiplication
- **Performance metrics** tracking

## 3. Composable Engine (composable-hierarchical-canvas-engine.ts)

**Pluggable components:**
- **Renderer swapping**: `setRenderer()` allows runtime renderer changes
- **Layout engines**: Interchangeable via `ILayoutEngine` interface
- **Camera system**: Independent camera controls
- **Service injection**: Optional services for dynamic behavior

**Key features:**
- Hierarchical depth control (`collapseToLevel()`)
- Event delegation system
- Data-driven rendering
- State persistence

## 4. WebGL/WASM Integration (webgl-renderer.service.ts)

**Hybrid rendering approach:**
- **WASM module** for high-performance calculations
- **WebGL context** for GPU-accelerated rendering
- **Fallback to Canvas 2D** when WebGL unavailable
- **Per-tab renderer instances** with isolated state

**State management per renderer:**
```typescript
RendererState {
  view: ViewState (pan, zoom)
  selection: SelectionState
  interaction: InteractionState
  entities: EntityMap
  connections: ConnectionArray
  render: RenderConfig
  effects: VisualEffects
}
```

## 5. Multi-View Support

**Three isolation strategies:**

### Multi-View Renderer (multi-view-renderer.service.ts):
- Shared renderer, different data per view
- Registry of view-specific entity data
- Lightweight switching between views

### Isolated Renderer (isolated-renderer.service.ts):
- Complete isolation via iframes
- Each view gets independent JavaScript context
- Zero cross-contamination between renderers

### Per-View Renderer (per-view-renderer.service.ts):
- Service-managed renderer instances
- Shared code, separate state
- Middle ground between sharing and isolation

## 6. Modular Canvas Component

**Component architecture** (modular-canvas.component.ts):
- **Service composition**: Combines multiple services for functionality
- **Canvas controller interface**: Standardized control API
- **Event handling**: Mouse, wheel, keyboard events
- **Dynamic data loading**: Neo4j integration for live data

## Rendering Layers & Composition

The system uses a **layered approach**:

1. **Data Layer**: Neo4j entities → Hierarchical nodes
2. **Layout Layer**: Grid, Force-directed, Dynamic layouts
3. **Transform Layer**: Matrix-based hierarchical transforms
4. **Render Layer**: WebGL/Canvas2D/WASM renderers
5. **Interaction Layer**: Hit testing, selection, dragging
6. **Effects Layer**: Animations, transitions, visual effects

## Key Design Patterns

1. **Factory Pattern**: Renderer creation and selection
2. **Strategy Pattern**: Interchangeable layout/render algorithms
3. **Composite Pattern**: Hierarchical scene graph
4. **Observer Pattern**: State changes and event propagation
5. **Service Locator**: Angular DI for service composition
6. **Adapter Pattern**: Multiple renderer APIs unified interface

## Performance Optimizations

- **Matrix caching**: Avoid recalculating transforms
- **Culling**: Skip rendering off-screen elements
- **Batch rendering**: Minimize draw calls
- **Dirty regions**: Only redraw changed areas
- **WASM acceleration**: Compute-intensive operations
- **WebGL shaders**: GPU-accelerated rendering
- **Lazy loading**: Components loaded on demand

This composable architecture allows for:
- **Technology flexibility** (WebGL, Canvas2D, WASM)
- **Runtime renderer switching**
- **View-specific optimizations**
- **Progressive enhancement** (fallbacks)
- **Extensibility** via plugin system
- **Performance scalability** through isolation