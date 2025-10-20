# Military-Style HUD Editing Panels

**Design Document**
**Status:** Ready for Implementation
**Last Updated:** 2025-10-20

---

## Vision

Create an immersive, game-like heads-up display (HUD) system for editing node properties on the canvas. Replace the traditional sidebar Properties Panel with floating, military-styled editing panels that feel like a command center interface.

**Reference Aesthetic:**
https://www.shutterstock.com/image-vector/ui-interface-earth-globe-control-center-1190802196

### Core Characteristics

- **Blender-style separate panels** - Multiple independent draggable panels, each focused on a specific editing domain
- **Dark military theme** with neon glow effects (cyan, green, amber)
- **Fixed screen-space positioning** - panels never pan/zoom with canvas
- **Variable opacity** - from solid to fully transparent to see canvas behind
- **Context-aware** - panels appear and populate when nodes are selected
- **Real-time editing** - changes apply immediately to selected nodes on canvas
- **Keyboard-first interaction** - shortcuts for all panel operations
- **User-positionable** - drag panels to preferred locations with boundary clamping
- **Reuses existing infrastructure** - wires to `CanvasControlService.applyNodeStyleOverride()`

### Target Platform

- **Primary:** Desktop browsers (Chrome, Firefox, Edge, Safari)
- **Input:** Mouse + Keyboard (touch gestures out of scope for MVP)
- **Performance:** 60fps canvas rendering maintained with panels active

### Key Difference from Traditional Properties Panel

**Old (Sidebar):**
- Fixed right-side panel
- Accordion sections (Canvas Settings + Node Settings)
- Always visible, takes up screen real estate
- Traditional form layout

**New (HUD Panels):**
- Floating panels positioned anywhere on screen
- Separate focused panels (Style, Content, Actions, etc.)
- Appears on demand when node selected
- Immersive game-like UI with military aesthetic

---

## Panel Types & Features

### 1. **Style Panel** (MVP - Implement First) 🎯

**Purpose:** Visual appearance editing for selected node(s)

**Features:**
- **Fill color** - Color picker + hex input (reuse PrimeNG ColorPicker)
- **Stroke/border color** - Color picker + hex input
- **Shape** - Dropdown: Rounded Rectangle, Rectangle, Circle, Triangle
- **Corner radius** - Slider (0-100) when shape is "Rounded"
- **Opacity/transparency** - Slider (0-100%) for node alpha
- **Size** - Width/height inputs (optional - may require renderer changes)
- **Shadow/glow effects** - Experimental: blur radius, offset, color (new feature)
- **Apply scope** - Dropdown: "This node only" or "All nodes of type X"
- **Reset button** - Per-property reset to default

**Data Source:** `CanvasControlService.selection$` (NodeSelectionSnapshot)

**Data Flow:**
```
User edits property → applyNodeStyleOverride(overrides, scope)
  → CanvasControlService.applyNodeStyleOverride()
    → RuntimeCanvasController updates node
      → Canvas re-renders immediately
```

**Reuse from Properties Panel:**
- Fill/stroke color logic (lines 951-984)
- Shape dropdown (line 258, shapeOptions)
- Corner radius slider (line 268)
- Label visibility toggle (line 240)
- Icon input (line 250)
- Scope selector (lines 181-186)

---

### 2. **Content Panel** (Phase 2)

**Purpose:** Text and icon editing for selected node(s)

**Features:**
- **Label text** - Textarea for multi-line labels
- **Label visibility** - Toggle on/off
- **Font family** - Dropdown (if renderer supports)
- **Font size** - Slider or number input
- **Text alignment** - Left/Center/Right buttons
- **Icon/emoji selector** - Improved emoji picker (current is text input)
- **Badge system** - Add/remove/edit badges (existing in NodeStyleOverrides)

**Data Source:** `CanvasControlService.selection$`

**Reuse from Properties Panel:**
- Label visibility toggle (line 240)
- Icon input (line 250)
- Badge system (lines 1120-1122)

---

### 3. **Media Panel** (Phase 3)

**Purpose:** Image and attachment management for selected node(s)

**Features:**
- **Background image** - URL input + file picker
- **Thumbnail/avatar** - Upload or paste image URL
- **Attachments list** - Show linked files/documents
- **Image fit/position** - Cover/Contain/Fill, alignment controls
- **Image opacity** - Separate from node opacity
- **Clear image** - Remove button

**Data Source:** `CanvasControlService.selection$` (extended with image properties)

**New Properties Required:**
- `NodeStyleOverrides` needs: `backgroundImage`, `imageFit`, `imagePosition`, `imageOpacity`

---

### 4. **Actions Panel** (Phase 2)

**Purpose:** Node operations and quick actions

**Features:**
- **Delete node** - Remove from canvas (with confirmation)
- **Duplicate node** - Copy node with properties
- **Lock/unlock position** - Prevent dragging
- **Pin to canvas** - Prevent auto-layout movement
- **Group with others** - Multi-select grouping
- **Expand/collapse** - For hierarchical nodes (existing feature)
- **Copy style** - Copy all style properties to clipboard (JSON)
- **Paste style** - Apply copied style to selection
- **Reset all styles** - Clear all overrides back to defaults

**Data Source:** `CanvasControlService.selection$`

**New Methods Required:**
- `CanvasControlService.deleteNode(nodeId)`
- `CanvasControlService.duplicateNode(nodeId)`
- `CanvasControlService.lockNodePosition(nodeId, locked: boolean)`
- `CanvasControlService.copyNodeStyle(nodeId): NodeStyleOverrides`
- `CanvasControlService.pasteNodeStyle(nodeId, style: NodeStyleOverrides)`

---

### 5. **Canvas Control Panel** (Phase 4 - Optional)

**Purpose:** Global canvas settings (alternative to sidebar)

**Features:**
- **Layout engine selector** - Dropdown (already in sidebar)
- **Graph lens selector** - Dropdown (already in sidebar)
- **View preset selector** - Dropdown with palette overrides (already in sidebar)
- **Camera position** - Display x, y, zoom (read-only or with "Go to" button)
- **Reset canvas** - Reset camera to default view
- **Save layout** - Save current positions
- **Undo/redo** - History navigation buttons
- **Auto layout toggle** - Enable/disable

**Data Source:** `CanvasControlService` observables

**Decision Point:** Keep these in sidebar OR move to floating panel?
- **Recommendation:** Keep in sidebar for now, focus on node editing panels first

---

## Architecture

### Core Principles

**Screen Space vs World Space:**

| Element | Space Type | Pan/Zoom Behavior |
|---------|-----------|-------------------|
| **Canvas nodes/edges** | World space | Move with camera |
| **HUD panels** | Screen space | Fixed to viewport |
| **Panel content** | Context-aware | Updates based on selected node |

**Key Point:** HUD panels use `position: fixed` and remain stationary regardless of canvas transformations. They are sibling elements to the canvas, not children.

### Panel Features

- **Opacity control** - Slider in panel footer (0% to 100%)
- **Drag & drop** - Click header to reposition, with viewport boundary clamping
- **Show/hide toggle** - Via keyboard shortcuts or manual close
- **Persistent state** - Position, opacity, and visibility saved to localStorage
- **Z-index management** - Click panel to bring to front
- **Error isolation** - One broken panel doesn't crash the HUD
- **Context visibility** - Panels auto-show when node selected, can be manually closed

---

## Services

### 1. `HudPanelService`

Central registry and orchestration for all HUD panels.

**Responsibilities:**
- Panel registration/deregistration
- Visibility state management (using Angular signals)
- Z-index/stacking order management
- Active panel tracking
- Performance monitoring

**Key Methods:**
```typescript
registerPanel(id: string, metadata: PanelMetadata): void
unregisterPanel(id: string): void
showPanel(id: string): void
hidePanel(id: string): void
togglePanel(id: string): void
bringToFront(id: string): void
getPanelState(id: string): PanelState
isPanelVisible(id: string): Signal<boolean>
```

**State Management Pattern:**
```typescript
export class HudPanelService {
  private _panels = signal<Map<string, PanelState>>(new Map());

  // Computed signals for derived state
  readonly visiblePanels = computed(() =>
    Array.from(this._panels().values()).filter(p => p.visible)
  );

  readonly activePanelId = signal<string | null>(null);

  togglePanel(id: string): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, visible: !panel.visible });
      }
      return new Map(panels);
    });

    // Save to settings service
    this.hudSettings.savePanelVisibility(id, !panel?.visible);
  }
}
```

---

### 2. `HudSettingsService`

Persists user preferences for HUD panels with coordinated localStorage management.

**Responsibilities:**
- Per-panel opacity (0-1)
- Panel positions (x, y in pixels)
- Panel visibility defaults
- Theme settings (glow color, intensity)
- localStorage save/load with namespacing
- Migration/versioning for settings schema

**Storage Schema:**
```typescript
interface HudSettings {
  version: number;  // Schema version for migrations
  panels: {
    [panelId: string]: {
      position: { x: number; y: number };
      opacity: number;
      visible: boolean;
      zIndex: number;
    }
  };
  theme: {
    glowColor: 'cyan' | 'green' | 'amber';
    glowIntensity: number;
  };
}
```

**localStorage Coordination:**
- **Namespace:** All HUD keys prefixed with `hud.*` to avoid conflicts with `UiStateService`
- **Key pattern:** `hud.settings`, `hud.panels.{panelId}`, `hud.theme`
- **Quota handling:** Graceful degradation if localStorage quota exceeded
- **Migration:** Version checks for backward compatibility

**Implementation:**
```typescript
export class HudSettingsService {
  private readonly STORAGE_PREFIX = 'hud';
  private readonly SETTINGS_KEY = `${this.STORAGE_PREFIX}.settings`;

  saveSettings(settings: HudSettings): void {
    try {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, using session storage');
      }
    }
  }

  loadSettings(): HudSettings {
    const stored = localStorage.getItem(this.SETTINGS_KEY);
    if (!stored) return this.getDefaults();

    const parsed = JSON.parse(stored);
    return this.migrateIfNeeded(parsed);
  }
}
```

---

## Components

### 1. `HudPanelBaseComponent` (Abstract Base)

Provides standard HUD panel functionality with error boundaries.

**Features:**
- Panel header with title and controls
- Opacity slider in footer
- Drag & drop positioning with **viewport boundary clamping**
- Close button
- Show/hide animations (fade + slide)
- Military styling (dark + neon glow)
- Error boundary wrapper
- OnPush change detection

**Template Structure:**
```html
<div class="hud-panel"
     [style.opacity]="opacity()"
     [style.left.px]="position().x"
     [style.top.px]="position().y"
     [style.z-index]="zIndex()"
     (mousedown)="bringToFront()">
  <!-- Header -->
  <div class="hud-panel-header"
       (mousedown)="startDrag($event)"
       [class.dragging]="isDragging()">
    <div class="header-icon">
      <i class="pi" [ngClass]="icon"></i>
    </div>
    <span class="panel-title">{{ title }}</span>
    <button class="close-btn" (click)="close()">×</button>
  </div>

  <!-- Content Area -->
  <div class="hud-panel-content">
    <ng-content></ng-content>
  </div>

  <!-- Footer with Opacity Control -->
  <div class="hud-panel-footer">
    <label>
      <span>Opacity</span>
      <span>{{ (opacity() * 100) | number:'1.0-0' }}%</span>
    </label>
    <input type="range"
           [ngModel]="opacity()"
           (ngModelChange)="setOpacity($event)"
           min="0"
           max="100"
           step="5">
  </div>
</div>
```

**Drag with Boundary Clamping:**
```typescript
export abstract class HudPanelBaseComponent implements OnInit, OnDestroy {
  protected readonly position = signal({ x: 0, y: 0 });
  protected readonly isDragging = signal(false);

  private dragOffset = { x: 0, y: 0 };

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging()) return;

    const x = event.clientX - this.dragOffset.x;
    const y = event.clientY - this.dragOffset.y;

    // Clamp to viewport boundaries
    const clamped = this.clampToViewport(x, y);
    this.position.set(clamped);

    // Debounce save to localStorage
    this.debouncedSave();
  }

  private clampToViewport(x: number, y: number): { x: number; y: number } {
    const panel = this.elementRef.nativeElement;
    const rect = panel.getBoundingClientRect();

    const minX = 0;
    const minY = 0;
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  }
}
```

---

### 2. `StylePanelComponent` (MVP Implementation)

Extends `HudPanelBaseComponent` to provide node style editing.

**Component Structure:**
```typescript
@Component({
  selector: 'app-style-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerModule, /* ... */],
  template: `
    <app-hud-panel-base
      title="Style"
      icon="pi-palette"
      [visible]="isVisible()"
      (close)="onClose()">

      <div class="style-section" *ngIf="nodeSelection(); else noSelection">
        <!-- Node Info Header -->
        <div class="node-info">
          <span class="node-label">{{ nodeSelection()!.label }}</span>
          <span class="node-type">{{ nodeSelection()!.type }}</span>
        </div>

        <!-- Scope Selector -->
        <div class="form-row">
          <label>Apply to</label>
          <select [ngModel]="currentScope()" (ngModelChange)="onScopeChange($event)">
            <option value="node">This node only</option>
            <option value="type">All nodes of type {{ nodeSelection()!.type }}</option>
          </select>
        </div>

        <!-- Fill Color -->
        <div class="style-row">
          <span class="style-label">Fill</span>
          <div class="color-control">
            <p-colorPicker
              [(ngModel)]="fillColor()"
              (ngModelChange)="onFillChange($event)"
              format="hex"
              [appendTo]="'body'">
            </p-colorPicker>
            <input type="text"
                   class="hex-input"
                   [(ngModel)]="fillColor()"
                   (ngModelChange)="onFillInputChange($event)"
                   pattern="^#[0-9A-Fa-f]{6}$">
          </div>
          <button class="reset-btn" (click)="resetFill()">
            <i class="pi pi-refresh"></i>
          </button>
        </div>

        <!-- Stroke Color -->
        <div class="style-row">
          <span class="style-label">Stroke</span>
          <div class="color-control">
            <p-colorPicker
              [(ngModel)]="strokeColor()"
              (ngModelChange)="onStrokeChange($event)"
              format="hex"
              [appendTo]="'body'">
            </p-colorPicker>
            <input type="text"
                   class="hex-input"
                   [(ngModel)]="strokeColor()"
                   (ngModelChange)="onStrokeInputChange($event)"
                   pattern="^#[0-9A-Fa-f]{6}$">
          </div>
          <button class="reset-btn" (click)="resetStroke()">
            <i class="pi pi-refresh"></i>
          </button>
        </div>

        <!-- Shape Selector -->
        <div class="style-row">
          <span class="style-label">Shape</span>
          <select [ngModel]="shape()" (ngModelChange)="onShapeChange($event)">
            <option value="rounded">Rounded Rectangle</option>
            <option value="rectangle">Rectangle</option>
            <option value="circle">Circle</option>
            <option value="triangle">Triangle</option>
          </select>
          <button class="reset-btn" (click)="resetShape()">
            <i class="pi pi-refresh"></i>
          </button>
        </div>

        <!-- Corner Radius (conditional) -->
        <div class="style-row" *ngIf="shape() === 'rounded'">
          <span class="style-label">Radius</span>
          <div class="range-control">
            <input type="range"
                   min="0"
                   max="100"
                   [value]="cornerRadius()"
                   (input)="onCornerRadiusChange($any($event.target).value)">
            <span class="range-value">{{ cornerRadius() }}</span>
          </div>
          <button class="reset-btn" (click)="resetCornerRadius()">
            <i class="pi pi-refresh"></i>
          </button>
        </div>

        <!-- Label Visibility -->
        <div class="style-row">
          <span class="style-label">Label</span>
          <label class="toggle">
            <input type="checkbox"
                   [checked]="labelVisible()"
                   (change)="onLabelToggle($any($event.target).checked)">
            <span>Visible</span>
          </label>
          <button class="reset-btn" (click)="resetLabelVisibility()">
            <i class="pi pi-refresh"></i>
          </button>
        </div>

        <!-- Icon -->
        <div class="style-row">
          <span class="style-label">Icon</span>
          <input type="text"
                 [ngModel]="icon()"
                 (blur)="onIconChange($any($event.target).value)"
                 placeholder="Emoji or glyph">
          <button class="reset-btn" (click)="resetIcon()">
            <i class="pi pi-refresh"></i>
          </button>
        </div>
      </div>

      <ng-template #noSelection>
        <div class="empty-state">
          <i class="pi pi-info-circle"></i>
          <p>Select a node on the canvas to edit its style.</p>
        </div>
      </ng-template>
    </app-hud-panel-base>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StylePanelComponent implements OnInit, OnDestroy {
  // Signals for reactive state
  protected readonly nodeSelection = toSignal(this.canvasControl.selection$);
  protected readonly fillColor = signal<string>('#1f2937');
  protected readonly strokeColor = signal<string>('#4b5563');
  protected readonly shape = signal<NodeShape>('rounded');
  protected readonly cornerRadius = signal<number>(12);
  protected readonly labelVisible = signal<boolean>(true);
  protected readonly icon = signal<string>('');
  protected readonly currentScope = signal<StyleApplicationScope>('node');
  protected readonly isVisible = signal<boolean>(false);

  constructor(
    private readonly canvasControl: CanvasControlService,
    private readonly hudPanel: HudPanelService
  ) {}

  ngOnInit(): void {
    // React to selection changes
    effect(() => {
      const selection = this.nodeSelection();
      if (selection) {
        this.syncFromSelection(selection);
        // Auto-show panel when node selected (can be manually closed)
        if (!this.isVisible()) {
          this.hudPanel.showPanel('style-panel');
        }
      }
    });
  }

  private syncFromSelection(selection: NodeSelectionSnapshot): void {
    const base = selection.style;
    const overrides = (selection.overrides ?? {}) as NodeStyleOverrides;

    this.fillColor.set(overrides.fill ?? base.fill);
    this.strokeColor.set(overrides.stroke ?? base.stroke);
    this.shape.set(overrides.shape ?? base.shape);
    this.cornerRadius.set(overrides.cornerRadius ?? base.cornerRadius);
    this.labelVisible.set(overrides.labelVisible ?? base.labelVisible);
    this.icon.set(overrides.icon ?? base.icon ?? '');
  }

  onFillChange(color: string | { value: string }): void {
    const normalized = this.normalizeColor(color);
    if (normalized) {
      this.applyOverrides({ fill: normalized });
    }
  }

  onFillInputChange(value: string): void {
    const normalized = this.normalizeColor(value);
    if (normalized) {
      this.applyOverrides({ fill: normalized });
    }
  }

  resetFill(): void {
    this.applyOverrides({ fill: undefined });
  }

  onStrokeChange(color: string | { value: string }): void {
    const normalized = this.normalizeColor(color);
    if (normalized) {
      this.applyOverrides({ stroke: normalized });
    }
  }

  onStrokeInputChange(value: string): void {
    const normalized = this.normalizeColor(value);
    if (normalized) {
      this.applyOverrides({ stroke: normalized });
    }
  }

  resetStroke(): void {
    this.applyOverrides({ stroke: undefined });
  }

  onShapeChange(shape: NodeShape): void {
    this.applyOverrides({ shape });
  }

  resetShape(): void {
    this.applyOverrides({ shape: undefined });
  }

  onCornerRadiusChange(value: string): void {
    const numeric = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    this.applyOverrides({ cornerRadius: numeric });
  }

  resetCornerRadius(): void {
    this.applyOverrides({ cornerRadius: undefined });
  }

  onLabelToggle(visible: boolean): void {
    this.applyOverrides({ labelVisible: visible });
  }

  resetLabelVisibility(): void {
    this.applyOverrides({ labelVisible: undefined });
  }

  onIconChange(icon: string): void {
    const trimmed = icon?.trim() ?? '';
    this.applyOverrides({ icon: trimmed.length > 0 ? trimmed : undefined });
  }

  resetIcon(): void {
    this.applyOverrides({ icon: undefined });
  }

  onScopeChange(scope: StyleApplicationScope): void {
    this.currentScope.set(scope);
  }

  private applyOverrides(overrides: Partial<NodeStyleOverrides>): void {
    // Reuse existing CanvasControlService infrastructure
    this.canvasControl.applyNodeStyleOverride(overrides, this.currentScope());
  }

  private normalizeColor(input: string | { value: string }): string | undefined {
    if (!input) return undefined;
    const raw = typeof input === 'object' ? input.value : input;
    if (!raw) return undefined;
    const value = raw.startsWith('#') ? raw : `#${raw}`;
    return value.length === 7 ? value : undefined;
  }

  onClose(): void {
    this.hudPanel.hidePanel('style-panel');
  }
}
```

---

## File Structure

```
frontend/src/app/
├── core/
│   └── services/
│       ├── hud-panel.service.ts           (panel orchestration)
│       └── hud-settings.service.ts        (localStorage persistence)
├── components/
│   └── hud/
│       ├── base/
│       │   ├── hud-panel-base.component.ts
│       │   ├── hud-panel-base.component.scss
│       │   └── hud-panel-base.component.html
│       └── panels/
│           ├── style-panel/                (MVP - Phase 1)
│           │   ├── style-panel.component.ts
│           │   ├── style-panel.component.html
│           │   └── style-panel.component.scss
│           ├── content-panel/              (Phase 2)
│           │   ├── content-panel.component.ts
│           │   └── content-panel.component.html
│           ├── actions-panel/              (Phase 2)
│           │   ├── actions-panel.component.ts
│           │   └── actions-panel.component.html
│           ├── media-panel/                (Phase 3)
│           │   ├── media-panel.component.ts
│           │   └── media-panel.component.html
│           └── canvas-control-panel/       (Phase 4 - optional)
│               ├── canvas-control-panel.component.ts
│               └── canvas-control-panel.component.html
└── shared/
    └── models/
        └── hud.models.ts
```

---

## Implementation Plan

### Stage 1: Foundation & Style Panel (MVP)

**Goal:** Single working Style Panel with military aesthetic, wired to existing property system.

**Pre-Implementation Checklist:**
- [x] Read `PropertiesPanelComponent` - understand existing property editing (DONE)
- [x] Read `CanvasControlService` - verify `applyNodeStyleOverride()` (DONE)
- [ ] Read `UiStateService` to check localStorage usage patterns
- [ ] **DEFINE:** localStorage key namespacing strategy (`hud.*` prefix confirmed)

**Tasks:**
1. **Create `HudPanelService`**
   - Panel registration/deregistration
   - Visibility signals (show/hide/toggle)
   - Z-index management (bring to front)
   - Performance tracking hooks

2. **Create `HudSettingsService`**
   - Implement `hud.*` namespace prefix
   - Add schema versioning for migrations
   - Add quota exceeded error handling
   - Default panel positions

3. **Create `HudPanelBaseComponent` abstract base**
   - Drag & drop positioning with **viewport boundary clamping**
   - Opacity slider in footer (0-100%)
   - Basic military styling (dark background, cyan border glow)
   - OnPush change detection
   - Header with title, icon, close button

4. **Create `StylePanelComponent` (extends base)**
   - Wire to `CanvasControlService.selection$`
   - Reuse fill/stroke color logic from Properties Panel
   - Reuse shape dropdown + corner radius slider
   - Reuse label visibility + icon input
   - Add scope selector ("This node" vs "All of type")
   - **All changes call `canvasControl.applyNodeStyleOverride()`**

5. **Integrate into `RuntimeCanvasComponent`**
   - Add HUD host container as sibling to canvas
   - Register `HudPanelService` in providers
   - Add Style Panel to template with `*ngIf="hudPanel.isPanelVisible('style-panel')"`

6. **Add keyboard shortcuts**
   - `Alt + S` - Toggle Style Panel
   - `Alt + H` - Hide all HUD panels

**Reuse Strategy:**
- Copy color picker layout from Properties Panel (lines 192-209)
- Copy scope selector from Properties Panel (lines 181-186)
- Copy normalization logic (lines 935-941, 951-984)
- Copy reset button pattern (lines 210, 233, 244, etc.)

**Performance Budget:**
- FPS impact with 1 panel: < 2fps drop
- Memory increase: < 5MB
- Bundle size increase: < 30KB

**Commit:** `feat: add HUD Style Panel for node property editing`

**Testing:**
- [ ] Compile without errors
- [ ] Panel appears when node selected
- [ ] Panel is draggable and stays within viewport bounds
- [ ] Opacity slider works smoothly
- [ ] Panel position persists after page reload
- [ ] Fill color changes apply immediately to node
- [ ] Stroke color changes apply immediately
- [ ] Shape changes work (all 4 shapes)
- [ ] Corner radius slider appears for rounded shape only
- [ ] Scope selector changes between "node" and "type"
- [ ] Reset buttons restore default values
- [ ] Close button hides panel
- [ ] Panel reopens when another node selected
- [ ] No console errors

---

### Stage 2: Styling & Military Theme

**Goal:** Full military HUD aesthetic matching the design vision.

**Tasks:**
1. **Implement military theme styling**
   - Dark semi-transparent backgrounds with `backdrop-filter: blur()`
   - Neon cyan glow borders (primary color)
   - Monospace fonts for hex inputs (Consolas, Monaco)
   - Corner bracket accents (CSS ::before/::after pseudo-elements)
   - CSS custom properties for theming

2. **Add smooth show/hide animations**
   - Fade in/out (opacity transition 300ms)
   - Slide from edge (transform transition 300ms)
   - Panel appears from last known position OR default position

3. **Enhance opacity controls**
   - Smooth CSS transitions (200ms ease)
   - Visual feedback on slider thumb
   - Percentage label updates in real-time

4. **Polish interactions**
   - Hover effects on buttons
   - Focus states on inputs
   - Active state when dragging
   - Glow intensifies when panel active

**Performance Considerations:**
- Test `backdrop-filter` performance on low-end GPUs
- Provide fallback styling if `backdrop-filter` causes jank
- Add CSS `will-change: transform, opacity` for animated elements

**Commit:** `feat: implement military HUD styling for panels`

**Testing:**
- [ ] Military theme renders correctly (dark + cyan glow)
- [ ] Corner bracket accents visible
- [ ] Glow effects visible but not overwhelming
- [ ] Animations smooth (60fps)
- [ ] Opacity transitions smooth
- [ ] Hover states work on all buttons
- [ ] Focus indicators visible on inputs
- [ ] Test on low-end GPU (integrated graphics)

---

### Stage 3: Content & Actions Panels

**Goal:** Add two more editing panels for complete node editing coverage.

**Tasks:**
1. **Create `ContentPanelComponent`**
   - Label text editing (textarea)
   - Label visibility toggle (reuse from Style Panel)
   - Icon/emoji selector (improved from text input)
   - Font controls (if renderer supports)
   - Badge management UI

2. **Create `ActionsPanelComponent`**
   - Delete node button (with confirmation)
   - Duplicate node button
   - Lock/unlock position toggle
   - Reset all styles button
   - Copy/paste style buttons (JSON to clipboard)

3. **Add keyboard shortcuts for all panels**
   - `Alt + S` - Toggle Style Panel
   - `Alt + C` - Toggle Content Panel
   - `Alt + A` - Toggle Actions Panel
   - `Alt + H` - Hide all panels
   - `Alt + 0` - Reset panel layout

4. **Implement panel layout presets**
   - "Save layout" - Store current panel positions
   - "Reset to default" - Restore default positions

**New Methods Required in CanvasControlService:**
```typescript
deleteNode(nodeId: string): void
duplicateNode(nodeId: string): void
lockNodePosition(nodeId: string, locked: boolean): void
copyNodeStyle(nodeId: string): NodeStyleOverrides
pasteNodeStyle(nodeId: string, style: NodeStyleOverrides): void
resetAllNodeStyles(nodeId: string): void
```

**Commit:** `feat: add Content and Actions HUD panels`

**Testing:**
- [ ] All 3 panels can be active simultaneously
- [ ] Content panel text edits apply to node
- [ ] Actions panel buttons work
- [ ] Delete confirms before removing node
- [ ] Duplicate creates new node with same style
- [ ] Copy/paste style works between nodes
- [ ] Keyboard shortcuts for all panels work
- [ ] Layout save/restore works

---

### Stage 4: Media Panel (Optional)

**Goal:** Add image and attachment management.

**Tasks:**
1. **Extend `NodeStyleOverrides` type**
   - Add `backgroundImage?: string`
   - Add `imageFit?: 'cover' | 'contain' | 'fill'`
   - Add `imagePosition?: string`
   - Add `imageOpacity?: number`

2. **Create `MediaPanelComponent`**
   - URL input for background image
   - File picker integration
   - Image fit controls
   - Clear image button

3. **Update renderer to support background images**
   - Modify node rendering logic in RuntimeCanvasController
   - Support image loading and caching

**Commit:** `feat: add Media Panel for node images`

---

### Stage 5: Canvas Control Panel (Optional)

**Goal:** Move global canvas controls to floating HUD panel.

**Decision Point:** This may not be needed if sidebar works well for global settings.

**Tasks:**
1. Extract canvas settings from sidebar Properties Panel
2. Create floating Canvas Control Panel
3. Decide: Keep in sidebar OR replace with HUD panel

**Commit:** `feat: add Canvas Control HUD panel`

---

### Stage 6: Polish & Replace Properties Panel

**Goal:** Production-ready HUD system that replaces sidebar panel.

**Tasks:**

1. **Performance optimization**
   - Verify `OnPush` change detection on all panels
   - Memoize expensive computations using `computed()` signals
   - Profile with Chrome DevTools Performance tab
   - Ensure no memory leaks when toggling panels

2. **Error handling & resilience**
   - Wrap each panel in error boundary
   - Graceful degradation if data sources fail
   - localStorage quota exceeded fallback

3. **Accessibility**
   - ARIA labels for all controls
   - Keyboard navigation (Tab order)
   - Focus indicators visible
   - Screen reader announcements

4. **Replace Properties RHS Panel**
   - Remove or hide `<app-properties-rhs-panel>` from landing shell
   - Update user to use HUD panels instead
   - Migration guide for users

5. **Documentation**
   - Update this design doc with "as-built"
   - Add JSDoc comments to services
   - User guide for keyboard shortcuts

**Commit:** `feat: replace Properties Panel with HUD system`

---

## Runtime Canvas Integration

### Data Flow

```
User selects node on canvas
  ↓
RuntimeCanvasController.setOnSelectionChanged() fires
  ↓
RuntimeCanvasComponent forwards to CanvasControlService.setSelectionSnapshot()
  ↓
CanvasControlService.selection$ emits new NodeSelectionSnapshot
  ↓
StylePanelComponent receives selection via toSignal()
  ↓
Panel auto-shows (if hidden) and populates fields
  ↓
User edits fill color
  ↓
StylePanelComponent.onFillChange() called
  ↓
CanvasControlService.applyNodeStyleOverride({ fill: '#ff0000' }, 'node')
  ↓
CanvasEventHubService emits 'StyleOverrideRequested' event
  ↓
RuntimeCanvasComponent handles event
  ↓
RuntimeCanvasController updates node style
  ↓
Canvas re-renders with new color IMMEDIATELY
```

### Critical Integration Points

#### 1. HUD Container Placement
Add HUD panels as siblings to canvas in `RuntimeCanvasComponent`:

```html
<!-- RuntimeCanvasComponent template -->
<div class="runtime-canvas-wrapper">
  <canvas #canvasElement></canvas>

  <!-- HUD Panels (screen space - siblings to canvas) -->
  <app-style-panel
    *ngIf="hudPanelService.isPanelVisible('style-panel') | async">
  </app-style-panel>

  <app-content-panel
    *ngIf="hudPanelService.isPanelVisible('content-panel') | async">
  </app-content-panel>

  <app-actions-panel
    *ngIf="hudPanelService.isPanelVisible('actions-panel') | async">
  </app-actions-panel>
</div>
```

#### 2. Node Selection Stream
Wire `RuntimeCanvasController.setOnSelectionChanged` callback to forward selections:

```typescript
// RuntimeCanvasComponent.ngOnInit()
this.controller.setOnSelectionChanged((snapshot) => {
  this.canvasControl.setSelectionSnapshot(snapshot);
});
```

#### 3. Style Override Application
Reuse existing event-based system:

```typescript
// StylePanelComponent applies overrides
this.canvasControl.applyNodeStyleOverride({ fill: '#ff0000' }, 'node');

// ↓ CanvasControlService emits event
this.canvasEventHubService.emitEvent(canvasId, {
  type: 'StyleOverrideRequested',
  nodeId: selection.id,
  overrides: { fill: '#ff0000' },
  scope: 'node',
  source: 'user',
  timestamp: Date.now()
});

// ↓ RuntimeCanvasComponent handles event
// ↓ RuntimeCanvasController applies to node
// ↓ Canvas re-renders
```

#### 4. State Persistence
Ensure `HudSettingsService` coordinates with `UiStateService`:

```typescript
// HudSettingsService
export class HudSettingsService {
  private readonly STORAGE_PREFIX = 'hud';  // Namespace to avoid conflicts

  constructor(private uiState: UiStateService) {
    this.validateStorageNamespace();
  }

  private validateStorageNamespace(): void {
    const existingKeys = Object.keys(localStorage);
    const hudKeys = existingKeys.filter(k => k.startsWith(this.STORAGE_PREFIX));
    const uiKeys = existingKeys.filter(k => !k.startsWith(this.STORAGE_PREFIX));

    const overlap = hudKeys.some(hk => uiKeys.includes(hk));
    if (overlap) {
      console.error('localStorage namespace conflict detected');
    }
  }
}
```

---

## Technical Specifications

### DOM Structure

```html
<div class="runtime-canvas-wrapper">
  <!-- Canvas (world space - pans/zooms) -->
  <canvas #runtimeCanvas></canvas>

  <!-- HUD Panels (screen space - fixed) -->
  <app-style-panel
    class="hud-panel"
    *ngIf="hudPanelService.isPanelVisible('style-panel') | async">
  </app-style-panel>

  <app-content-panel
    class="hud-panel"
    *ngIf="hudPanelService.isPanelVisible('content-panel') | async">
  </app-content-panel>

  <app-actions-panel
    class="hud-panel"
    *ngIf="hudPanelService.isPanelVisible('actions-panel') | async">
  </app-actions-panel>
</div>
```

### CSS Positioning Strategy

```scss
.hud-panel {
  position: fixed;              // Fixed to viewport, not canvas
  z-index: 100;                 // Above canvas (canvas is z-index: 50)
  pointer-events: auto;         // Allow interaction
  min-width: 280px;
  max-width: 400px;

  // Military HUD styling
  background: rgba(10, 15, 20, var(--panel-opacity, 0.9));
  border: 1px solid rgba(0, 255, 255, 0.6);
  box-shadow:
    0 0 20px rgba(0, 255, 255, 0.3),     // Outer glow
    inset 0 0 20px rgba(0, 255, 255, 0.1); // Inner glow
  backdrop-filter: blur(10px);
  border-radius: 8px;

  // Smooth transitions
  transition: opacity 0.3s ease, transform 0.3s ease;

  // GPU acceleration hints
  will-change: transform, opacity;

  &.dragging {
    transition: none;           // Disable transitions during drag
    cursor: grabbing;
  }

  &.active {
    z-index: 200;               // Bring to front
    box-shadow:
      0 0 30px rgba(0, 255, 255, 0.5),
      inset 0 0 30px rgba(0, 255, 255, 0.2);
  }
}

// Panel Header
.hud-panel-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(0, 255, 255, 0.08);
  border-bottom: 1px solid rgba(0, 255, 255, 0.3);
  cursor: move;
  user-select: none;

  .header-icon {
    color: rgba(0, 255, 255, 0.9);
    font-size: 1.1rem;
  }

  .panel-title {
    flex: 1;
    font-weight: 600;
    font-size: 0.95rem;
    color: rgba(0, 255, 255, 0.95);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0.25rem;
    transition: color 0.2s ease;

    &:hover {
      color: rgba(0, 255, 255, 0.9);
    }
  }
}

// Panel Content
.hud-panel-content {
  padding: 1rem;
  overflow-y: auto;
  max-height: 70vh;

  // Custom scrollbar
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 255, 255, 0.05);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 255, 255, 0.3);
    border-radius: 4px;
  }
}

// Panel Footer
.hud-panel-footer {
  padding: 0.75rem 1rem;
  background: rgba(0, 255, 255, 0.05);
  border-top: 1px solid rgba(0, 255, 255, 0.2);

  label {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.5rem;
  }

  input[type="range"] {
    width: 100%;
    accent-color: rgba(0, 255, 255, 0.9);
  }
}

// Corner bracket accents
.hud-panel::before,
.hud-panel::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(0, 255, 255, 0.8);
}

.hud-panel::before {
  top: -1px;
  left: -1px;
  border-right: none;
  border-bottom: none;
}

.hud-panel::after {
  bottom: -1px;
  right: -1px;
  border-left: none;
  border-top: none;
}
```

### Style Panel Specific Styles

```scss
// Node info header
.node-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  margin-bottom: 1rem;
  background: rgba(0, 255, 255, 0.05);
  border: 1px solid rgba(0, 255, 255, 0.2);
  border-radius: 6px;

  .node-label {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .node-type {
    font-size: 0.8rem;
    padding: 0.25rem 0.6rem;
    background: rgba(0, 255, 255, 0.15);
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 4px;
    color: rgba(0, 255, 255, 0.9);
    text-transform: capitalize;
  }
}

// Form rows
.form-row {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;

  label {
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  select {
    padding: 0.5rem;
    background: rgba(0, 255, 255, 0.05);
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.9rem;

    &:focus {
      outline: none;
      border-color: rgba(0, 255, 255, 0.6);
      box-shadow: 0 0 0 2px rgba(0, 255, 255, 0.15);
    }
  }
}

// Style rows (label + control + reset)
.style-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.75rem;

  .style-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
  }

  .reset-btn {
    padding: 0.4rem 0.6rem;
    background: transparent;
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 4px;
    color: rgba(0, 255, 255, 0.7);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(0, 255, 255, 0.1);
      border-color: rgba(0, 255, 255, 0.6);
      color: rgba(0, 255, 255, 0.9);
    }
  }
}

// Color control
.color-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  p-colorpicker {
    ::ng-deep .p-colorpicker-preview {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      border: 1px solid rgba(0, 255, 255, 0.4);
    }
  }

  .hex-input {
    flex: 1;
    padding: 0.5rem;
    background: rgba(0, 255, 255, 0.05);
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.95);
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 0.9rem;

    &:focus {
      outline: none;
      border-color: rgba(0, 255, 255, 0.6);
      box-shadow: 0 0 0 2px rgba(0, 255, 255, 0.15);
    }
  }
}

// Range control
.range-control {
  display: flex;
  align-items: center;
  gap: 0.75rem;

  input[type="range"] {
    flex: 1;
    accent-color: rgba(0, 255, 255, 0.9);
  }

  .range-value {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.9rem;
    color: rgba(0, 255, 255, 0.9);
    min-width: 2ch;
  }
}

// Toggle
.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: rgba(0, 255, 255, 0.9);
  }

  span {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.8);
  }
}

// Empty state
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem 1rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);

  i {
    font-size: 2rem;
    color: rgba(0, 255, 255, 0.5);
  }

  p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }
}
```

### CSS Custom Properties (Theming)

```scss
:root {
  // HUD Colors
  --hud-glow-cyan: rgba(0, 255, 255, 0.6);
  --hud-glow-green: rgba(0, 255, 0, 0.6);
  --hud-glow-amber: rgba(255, 191, 0, 0.6);

  // Active theme (cyan by default)
  --hud-glow-color: var(--hud-glow-cyan);

  // Intensity
  --hud-glow-intensity: 1;

  // Background
  --hud-bg-dark: rgba(10, 15, 20, 0.9);

  // Fonts
  --hud-font-mono: 'Consolas', 'Monaco', 'Courier New', monospace;
  --hud-font-main: system-ui, -apple-system, sans-serif;
}

// Theme variants
.hud-panel[data-theme="green"] {
  --hud-glow-color: var(--hud-glow-green);
}

.hud-panel[data-theme="amber"] {
  --hud-glow-color: var(--hud-glow-amber);
}

.hud-panel {
  border-color: var(--hud-glow-color);
  box-shadow:
    0 0 calc(20px * var(--hud-glow-intensity)) var(--hud-glow-color),
    inset 0 0 calc(20px * var(--hud-glow-intensity)) var(--hud-glow-color);
}
```

---

## Technical Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Panel Style** | Separate Blender-style draggable panels | Max flexibility, focused editing domains |
| **State Management** | Angular signals | Already in use, reactive, performant |
| **Positioning** | CSS `position: fixed` with drag | Independent of canvas, user-controlled |
| **Boundary Clamping** | Viewport edges | Prevents panels from being dragged off-screen |
| **Persistence** | localStorage with `hud.*` namespace | No conflicts, simple, fast |
| **Data Flow** | Reuse existing `CanvasControlService` | No duplication, proven system |
| **Styling** | CSS variables + SCSS | Themeable, military aesthetic |
| **Opacity Control** | CSS `backdrop-filter` + alpha | GPU-accelerated, see-through effect |
| **Component Architecture** | Abstract base class | DRY principle, consistent behavior |
| **Change Detection** | OnPush strategy | Optimized performance |
| **Error Handling** | Error boundary per panel | One broken panel doesn't crash HUD |

---

## Performance Budget

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **FPS impact (all panels)** | < 5fps drop | < 10fps drop |
| **Memory increase** | < 15MB | < 25MB |
| **Bundle size** | < 50KB | < 100KB |
| **Initial render time** | < 100ms | < 200ms |
| **Panel drag latency** | < 16ms | < 32ms |
| **localStorage writes** | Debounced 500ms | N/A |

---

## Benefits

✅ **Immersive** - Game-like UI that feels modern and engaging
✅ **Focused** - Each panel handles one editing domain
✅ **Flexible** - Draggable panels positioned anywhere
✅ **Scalable** - Easy to add new panels without changing core logic
✅ **Maintainable** - Centralized state management, reuses existing system
✅ **Performant** - Signals for reactivity, OnPush detection
✅ **Professional** - Reusable base component, consistent UX
✅ **Testable** - Services are injectable, components isolated
✅ **Incremental** - Each stage is independently testable
✅ **Accessible** - Keyboard shortcuts + ARIA labels
✅ **User-friendly** - Save/restore layouts, customizable opacity

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Multiple panels degrade FPS** | Medium | OnPush detection, monitor performance budget |
| **Drag causes jank** | Low | Disable transitions during drag, `will-change` hints |
| **`backdrop-filter` GPU cost** | Medium | Fallback styling, test on low-end devices |
| **localStorage quota exceeded** | Low | Fallback to sessionStorage, schema versioning |
| **Panel dragged off-screen** | Low | Viewport boundary clamping in drag logic |
| **Error in one panel crashes HUD** | Medium | Error boundary per panel |
| **Conflicts with sidebar panel** | Low | Clear migration path, hide old panel |

---

## Future Enhancements

### Phase 2 Additions

- **Panel snapping** - Snap to edges/corners (magnetic zones)
- **Panel minimization** - Collapse to titlebar only
- **Panel grouping** - Tab sets for related panels
- **Panel resizing** - Drag corners to resize
- **Multi-select editing** - Edit multiple nodes at once
- **Preset style library** - Save/load style presets
- **Undo/redo** - Panel-level history

### Phase 3 Advanced

- **Theme switcher** - Cyan/Green/Amber glow colors
- **Panel templates** - Pre-built layouts for workflows
- **Collaborative editing** - Shared panels across users
- **Voice commands** - Optional experimental feature (Chrome only)
- **Touch gestures** - Mobile support
- **Panel analytics** - Track which panels are most used

---

## Immediate Pre-Implementation Checklist

Before starting Stage 1:

1. **Read existing code:**
   - [x] `PropertiesPanelComponent` - Understand property editing (DONE)
   - [x] `CanvasControlService` - Verify applyNodeStyleOverride() (DONE)
   - [ ] `UiStateService` - Check localStorage patterns

2. **Make critical decisions:**
   - [x] **Panel organization:** Separate Blender-style panels (DONE)
   - [x] **MVP panel:** Style Panel (DONE)
   - [ ] **localStorage namespace:** Confirm `hud.*` prefix doesn't conflict

3. **Verify performance baseline:**
   - [ ] Measure current canvas FPS without HUD (~60fps expected)
   - [ ] Take heap snapshot for memory baseline

4. **Prepare development environment:**
   - [ ] Ensure Angular CLI updated
   - [ ] Verify PrimeNG ColorPicker available

---

**Document Status:** Ready for Implementation
**Next Action:** Complete pre-implementation checklist, then begin Stage 1 (Style Panel MVP)
**MVP Goal:** Single draggable Style Panel with military theme, wired to existing property system, editing nodes in real-time
