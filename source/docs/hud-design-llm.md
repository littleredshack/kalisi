# HUD Editing Panels - LLM Implementation Guide

**Document Type:** Technical Implementation Specification
**Status:** Ready for Implementation
**Last Updated:** 2025-10-20
**Target:** LLM Agents & Developers

---

## SYSTEM OVERVIEW

### Purpose
Replace traditional sidebar Properties Panel with floating, game-like HUD editing panels for node property manipulation.

### Key Characteristics
- Separate draggable Blender-style panels (NOT accordion, NOT tabs)
- Military aesthetic (dark + cyan glow, monospace fonts)
- Fixed screen-space positioning (`position: fixed`)
- Real-time node editing (changes apply immediately)
- Reuses existing `CanvasControlService.applyNodeStyleOverride()` infrastructure

### Architecture Pattern
```
User Action → HUD Panel Component → CanvasControlService
  → CanvasEventHubService → RuntimeCanvasController → Canvas Render
```

---

## EXISTING CODE TO UNDERSTAND

### 1. Properties Panel Component (REFERENCE - DO NOT MODIFY)

**Location:** `/workspace/source/frontend/src/app/components/properties-panel/properties-panel.component.ts`

**Key Patterns to Reuse:**

```typescript
// Color normalization (lines 935-941)
private normalizeColor(input: string | { value: string }): string | undefined {
  if (!input) return undefined;
  const raw = typeof input === 'object' ? input.value : input;
  if (!raw) return undefined;
  const value = raw.startsWith('#') ? raw : `#${raw}`;
  return value.length === 7 ? value : undefined;
}

// Apply overrides pattern (lines 943-949)
private applyOverrides(overrides: Partial<NodeStyleOverrides>): void {
  if (!this.nodeSelection) return;
  this.updatePendingOverrides(overrides);
  this.canvasControlService.applyNodeStyleOverride(overrides, this.currentScope);
}

// Fill color change (lines 951-956)
onFillChange(color: string | { value: string }): void {
  const value = this.normalizeColor(color);
  if (value) {
    this.applyOverrides({ fill: value });
  }
}

// Shape options (lines 855-860)
readonly shapeOptions: Array<{ value: NodeShape; label: string }> = [
  { value: 'rounded', label: 'Rounded Rectangle' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'triangle', label: 'Triangle' }
];

// Scope options (lines 850-853)
readonly scopeOptions: Array<{ value: StyleApplicationScope; label: string }> = [
  { value: 'node', label: 'This node only' },
  { value: 'type', label: 'All nodes of this type' }
];
```

### 2. CanvasControlService (INTEGRATION POINT)

**Location:** `/workspace/source/frontend/src/app/core/services/canvas-control.service.ts`

**Key Methods:**

```typescript
// Observable for node selection (line 99)
readonly selection$ = this.selectionSubject.asObservable();

// Apply style override (lines 292-316)
applyNodeStyleOverride(
  overrides: Partial<NodeStyleOverrides>,
  scope: StyleApplicationScope
): void {
  const selection = this.selectionSubject.value;
  if (!selection || selection.kind !== 'node') return;

  const canvasId = this.getActiveCanvasId();
  if (canvasId) {
    this.canvasEventHubService.emitEvent(canvasId, {
      type: 'StyleOverrideRequested',
      canvasId,
      nodeId: selection.id,
      overrides,
      scope,
      source: 'user',
      timestamp: Date.now()
    });
  } else if (this.activeCanvas?.applyNodeStyleOverride) {
    this.activeCanvas.applyNodeStyleOverride(selection.id, overrides, scope);
  }
  this.refreshSelectionSnapshot();
}

// Set selection snapshot (lines 288-290)
setSelectionSnapshot(selection: CanvasSelectionSnapshot | null): void {
  this.selectionSubject.next(selection);
}
```

### 3. Node Types

**Location:** `/workspace/source/frontend/src/app/shared/canvas/types.ts`

```typescript
export interface NodeSelectionSnapshot {
  kind: 'node';
  id: string;
  label: string;
  type: string;
  style: NodeStyleSnapshot;
  overrides?: Partial<NodeStyleOverrides>;
  // ... other fields
}

export interface NodeStyleOverrides {
  fill?: string;
  stroke?: string;
  icon?: string;
  labelVisible?: boolean;
  shape?: NodeShape;
  cornerRadius?: number;
  badges?: Array<{ text: string; color: string }>;
  // ... other fields
}

export type NodeShape = 'rounded' | 'rectangle' | 'circle' | 'triangle';
export type StyleApplicationScope = 'node' | 'type';
```

---

## PANEL TYPES & FEATURES

### Style Panel (MVP - IMPLEMENT FIRST) 🎯

**Purpose:** Visual appearance editing

**Features:**
- Fill color (color picker + hex input)
- Stroke color (color picker + hex input)
- Shape selector (dropdown: rounded, rectangle, circle, triangle)
- Corner radius (slider 0-100, only if shape=rounded)
- Label visibility (checkbox toggle)
- Icon/emoji (text input)
- Apply scope (dropdown: "This node only" | "All nodes of type X")
- Reset buttons (per property)

**Data Source:** `CanvasControlService.selection$` → `NodeSelectionSnapshot`

**Data Flow:**
```
User edits fill color in StylePanel
  ↓
onFillChange(color) called
  ↓
normalizeColor(color) → '#ff0000'
  ↓
applyOverrides({ fill: '#ff0000' })
  ↓
canvasControl.applyNodeStyleOverride({ fill: '#ff0000' }, currentScope)
  ↓
CanvasEventHubService emits 'StyleOverrideRequested'
  ↓
RuntimeCanvasController updates node
  ↓
Canvas re-renders IMMEDIATELY
```

### Content Panel (Phase 2)
- Label text (textarea)
- Font controls
- Icon/emoji picker
- Badge management

### Actions Panel (Phase 2)
- Delete node
- Duplicate node
- Lock position
- Copy/paste style
- Reset all styles

### Media Panel (Phase 3)
- Background image
- Image fit/position
- Attachments

### Canvas Control Panel (Phase 4 - Optional)
- Layout engine
- Graph lens
- View presets
- Camera controls
- Undo/redo

**Decision:** Keep canvas controls in sidebar for now, focus on node editing panels

---

## IMPLEMENTATION PLAN - STAGE 1 (MVP)

### Goal
Single working Style Panel with military aesthetic, fully wired to existing property system.

### Prerequisites Checklist
- [ ] Read `UiStateService` to check localStorage patterns
- [ ] Confirm `hud.*` localStorage namespace doesn't conflict
- [ ] Verify PrimeNG ColorPicker is available
- [ ] Measure baseline canvas FPS (~60fps expected)

### File Structure to Create

```
frontend/src/app/
├── core/services/
│   ├── hud-panel.service.ts           ← CREATE
│   └── hud-settings.service.ts        ← CREATE
├── components/hud/
│   ├── base/
│   │   ├── hud-panel-base.component.ts    ← CREATE (abstract)
│   │   ├── hud-panel-base.component.scss  ← CREATE
│   │   └── hud-panel-base.component.html  ← CREATE
│   └── panels/style-panel/
│       ├── style-panel.component.ts       ← CREATE
│       ├── style-panel.component.html     ← CREATE (inline template OK)
│       └── style-panel.component.scss     ← CREATE (inline styles OK)
└── shared/models/
    └── hud.models.ts                      ← CREATE
```

### Task Breakdown

#### 1. Create Type Definitions

**File:** `frontend/src/app/shared/models/hud.models.ts`

```typescript
export interface PanelState {
  id: string;
  visible: boolean;
  position: { x: number; y: number };
  opacity: number;
  zIndex: number;
}

export interface PanelMetadata {
  id: string;
  title: string;
  icon: string;
  defaultPosition: { x: number; y: number };
  defaultVisible: boolean;
}

export interface HudSettings {
  version: number;
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

#### 2. Create HudPanelService

**File:** `frontend/src/app/core/services/hud-panel.service.ts`

**Purpose:** Central registry for panel state management

**Key Features:**
- Signal-based reactive state
- Panel visibility management
- Z-index ordering
- Panel registration/deregistration

**Template:**
```typescript
import { Injectable, signal, computed } from '@angular/core';
import { PanelState, PanelMetadata } from '../../shared/models/hud.models';

@Injectable({ providedIn: 'root' })
export class HudPanelService {
  private _panels = signal<Map<string, PanelState>>(new Map());
  private _nextZIndex = 100;

  readonly visiblePanels = computed(() =>
    Array.from(this._panels().values()).filter(p => p.visible)
  );

  readonly activePanelId = signal<string | null>(null);

  constructor(private hudSettings: HudSettingsService) {
    // Load saved state on init
    this.loadState();
  }

  registerPanel(id: string, metadata: PanelMetadata): void {
    const existing = this._panels().get(id);
    if (existing) return;

    // Load from settings or use defaults
    const saved = this.hudSettings.getPanelSettings(id);
    const state: PanelState = {
      id,
      visible: saved?.visible ?? metadata.defaultVisible,
      position: saved?.position ?? metadata.defaultPosition,
      opacity: saved?.opacity ?? 0.9,
      zIndex: saved?.zIndex ?? this._nextZIndex++
    };

    this._panels.update(panels => {
      panels.set(id, state);
      return new Map(panels);
    });
  }

  unregisterPanel(id: string): void {
    this._panels.update(panels => {
      panels.delete(id);
      return new Map(panels);
    });
  }

  showPanel(id: string): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, visible: true });
        this.hudSettings.savePanelVisibility(id, true);
      }
      return new Map(panels);
    });
  }

  hidePanel(id: string): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, visible: false });
        this.hudSettings.savePanelVisibility(id, false);
      }
      return new Map(panels);
    });
  }

  togglePanel(id: string): void {
    const panel = this._panels().get(id);
    if (panel?.visible) {
      this.hidePanel(id);
    } else {
      this.showPanel(id);
    }
  }

  bringToFront(id: string): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        const newZIndex = this._nextZIndex++;
        panels.set(id, { ...panel, zIndex: newZIndex });
        this.activePanelId.set(id);
        this.hudSettings.savePanelZIndex(id, newZIndex);
      }
      return new Map(panels);
    });
  }

  updatePosition(id: string, position: { x: number; y: number }): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, position });
        this.hudSettings.savePanelPosition(id, position);
      }
      return new Map(panels);
    });
  }

  updateOpacity(id: string, opacity: number): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, opacity });
        this.hudSettings.savePanelOpacity(id, opacity);
      }
      return new Map(panels);
    });
  }

  getPanelState(id: string): PanelState | undefined {
    return this._panels().get(id);
  }

  isPanelVisible(id: string): boolean {
    return this._panels().get(id)?.visible ?? false;
  }

  private loadState(): void {
    const settings = this.hudSettings.loadSettings();
    // Initialize panels map from settings if needed
  }
}
```

#### 3. Create HudSettingsService

**File:** `frontend/src/app/core/services/hud-settings.service.ts`

**Purpose:** localStorage persistence for HUD state

**Key Features:**
- Namespace: `hud.*` (avoid conflicts)
- Schema versioning
- Quota exceeded handling
- Per-panel settings

**Template:**
```typescript
import { Injectable } from '@angular/core';
import { HudSettings } from '../../shared/models/hud.models';

@Injectable({ providedIn: 'root' })
export class HudSettingsService {
  private readonly STORAGE_PREFIX = 'hud';
  private readonly SETTINGS_KEY = `${this.STORAGE_PREFIX}.settings`;
  private readonly SCHEMA_VERSION = 1;

  private settings: HudSettings = this.getDefaults();

  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings(): HudSettings {
    try {
      const stored = localStorage.getItem(this.SETTINGS_KEY);
      if (!stored) return this.getDefaults();

      const parsed = JSON.parse(stored) as HudSettings;
      return this.migrateIfNeeded(parsed);
    } catch (error) {
      console.error('Failed to load HUD settings:', error);
      return this.getDefaults();
    }
  }

  saveSettings(settings: HudSettings): void {
    try {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
      this.settings = settings;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, using session storage');
        // Fallback: use sessionStorage or in-memory
      } else {
        console.error('Failed to save HUD settings:', error);
      }
    }
  }

  getPanelSettings(panelId: string) {
    return this.settings.panels[panelId];
  }

  savePanelVisibility(panelId: string, visible: boolean): void {
    if (!this.settings.panels[panelId]) {
      this.settings.panels[panelId] = {
        position: { x: 100, y: 100 },
        opacity: 0.9,
        visible,
        zIndex: 100
      };
    } else {
      this.settings.panels[panelId].visible = visible;
    }
    this.saveSettings(this.settings);
  }

  savePanelPosition(panelId: string, position: { x: number; y: number }): void {
    if (!this.settings.panels[panelId]) {
      this.settings.panels[panelId] = {
        position,
        opacity: 0.9,
        visible: true,
        zIndex: 100
      };
    } else {
      this.settings.panels[panelId].position = position;
    }
    this.saveSettings(this.settings);
  }

  savePanelOpacity(panelId: string, opacity: number): void {
    if (!this.settings.panels[panelId]) {
      this.settings.panels[panelId] = {
        position: { x: 100, y: 100 },
        opacity,
        visible: true,
        zIndex: 100
      };
    } else {
      this.settings.panels[panelId].opacity = opacity;
    }
    this.saveSettings(this.settings);
  }

  savePanelZIndex(panelId: string, zIndex: number): void {
    if (!this.settings.panels[panelId]) {
      this.settings.panels[panelId] = {
        position: { x: 100, y: 100 },
        opacity: 0.9,
        visible: true,
        zIndex
      };
    } else {
      this.settings.panels[panelId].zIndex = zIndex;
    }
    this.saveSettings(this.settings);
  }

  private getDefaults(): HudSettings {
    return {
      version: this.SCHEMA_VERSION,
      panels: {},
      theme: {
        glowColor: 'cyan',
        glowIntensity: 1
      }
    };
  }

  private migrateIfNeeded(settings: HudSettings): HudSettings {
    if (settings.version === this.SCHEMA_VERSION) {
      return settings;
    }
    // Add migration logic here when schema changes
    return settings;
  }
}
```

#### 4. Create HudPanelBaseComponent (Abstract)

**File:** `frontend/src/app/components/hud/base/hud-panel-base.component.ts`

**Purpose:** Reusable base for all HUD panels

**Key Features:**
- Drag & drop with viewport boundary clamping
- Opacity control in footer
- Military styling (applied via SCSS)
- Z-index management (click to bring to front)
- Close button

**Template:**
```typescript
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  OnDestroy,
  signal,
  ChangeDetectionStrategy,
  Input
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HudPanelService } from '../../../core/services/hud-panel.service';

@Component({
  selector: 'app-hud-panel-base',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="hud-panel"
         [style.opacity]="panelOpacity()"
         [style.left.px]="position().x"
         [style.top.px]="position().y"
         [style.z-index]="zIndex()"
         (mousedown)="onPanelClick()">
      <!-- Header -->
      <div class="hud-panel-header"
           (mousedown)="startDrag($event)"
           [class.dragging]="isDragging()">
        <div class="header-icon">
          <i class="pi" [ngClass]="icon"></i>
        </div>
        <span class="panel-title">{{ title }}</span>
        <button class="close-btn" (click)="onClose($event)">×</button>
      </div>

      <!-- Content Area -->
      <div class="hud-panel-content">
        <ng-content></ng-content>
      </div>

      <!-- Footer with Opacity Control -->
      <div class="hud-panel-footer">
        <label>
          <span>Opacity</span>
          <span>{{ (panelOpacity() * 100) | number:'1.0-0' }}%</span>
        </label>
        <input type="range"
               [ngModel]="panelOpacity() * 100"
               (ngModelChange)="setOpacity($event / 100)"
               min="0"
               max="100"
               step="5">
      </div>
    </div>
  `,
  styleUrls: ['./hud-panel-base.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export abstract class HudPanelBaseComponent implements OnInit, OnDestroy {
  @Input() panelId!: string;
  @Input() title: string = 'Panel';
  @Input() icon: string = 'pi-palette';

  protected readonly position = signal({ x: 100, y: 100 });
  protected readonly panelOpacity = signal(0.9);
  protected readonly zIndex = signal(100);
  protected readonly isDragging = signal(false);

  private dragOffset = { x: 0, y: 0 };
  private saveDebounceTimer: any;

  constructor(
    protected elementRef: ElementRef,
    protected hudPanel: HudPanelService
  ) {}

  ngOnInit(): void {
    // Load saved state
    const state = this.hudPanel.getPanelState(this.panelId);
    if (state) {
      this.position.set(state.position);
      this.panelOpacity.set(state.opacity);
      this.zIndex.set(state.zIndex);
    }
  }

  ngOnDestroy(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.hudPanel.unregisterPanel(this.panelId);
  }

  startDrag(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const rect = this.elementRef.nativeElement.querySelector('.hud-panel').getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    this.isDragging.set(true);
  }

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

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isDragging()) {
      this.isDragging.set(false);
      // Save final position
      this.hudPanel.updatePosition(this.panelId, this.position());
    }
  }

  private clampToViewport(x: number, y: number): { x: number; y: number } {
    const panel = this.elementRef.nativeElement.querySelector('.hud-panel');
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

  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.hudPanel.updatePosition(this.panelId, this.position());
    }, 500);
  }

  setOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    this.panelOpacity.set(clamped);
    this.hudPanel.updateOpacity(this.panelId, clamped);
  }

  onPanelClick(): void {
    // Bring to front on any click
    this.hudPanel.bringToFront(this.panelId);
    const state = this.hudPanel.getPanelState(this.panelId);
    if (state) {
      this.zIndex.set(state.zIndex);
    }
  }

  onClose(event: MouseEvent): void {
    event.stopPropagation();
    this.hudPanel.hidePanel(this.panelId);
  }
}
```

**File:** `frontend/src/app/components/hud/base/hud-panel-base.component.scss`

```scss
.hud-panel {
  position: fixed;
  z-index: 100;
  pointer-events: auto;
  min-width: 280px;
  max-width: 400px;

  // Military HUD styling
  background: rgba(10, 15, 20, var(--panel-opacity, 0.9));
  border: 1px solid rgba(0, 255, 255, 0.6);
  box-shadow:
    0 0 20px rgba(0, 255, 255, 0.3),
    inset 0 0 20px rgba(0, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 8px;

  // Smooth transitions
  transition: opacity 0.3s ease, transform 0.3s ease;
  will-change: transform, opacity;

  &.dragging {
    transition: none;
    cursor: grabbing;
  }

  // Corner bracket accents
  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid rgba(0, 255, 255, 0.8);
  }

  &::before {
    top: -1px;
    left: -1px;
    border-right: none;
    border-bottom: none;
  }

  &::after {
    bottom: -1px;
    right: -1px;
    border-left: none;
    border-top: none;
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

  &.dragging {
    cursor: grabbing;
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
```

#### 5. Create StylePanelComponent

**File:** `frontend/src/app/components/hud/panels/style-panel/style-panel.component.ts`

**Purpose:** Node style editing panel (MVP)

**Key Features:**
- Subscribe to `CanvasControlService.selection$`
- Display node info (label, type)
- Edit fill, stroke, shape, radius, label, icon
- Scope selector (node vs type)
- Call `applyNodeStyleOverride()` on changes

**Template:**
```typescript
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  effect,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerModule } from 'primeng/colorpicker';
import { toSignal } from '@angular/core/rxjs-interop';

import { HudPanelBaseComponent } from '../../base/hud-panel-base.component';
import { CanvasControlService } from '../../../../core/services/canvas-control.service';
import { HudPanelService } from '../../../../core/services/hud-panel.service';
import {
  NodeSelectionSnapshot,
  NodeStyleOverrides,
  StyleApplicationScope,
  NodeShape
} from '../../../../shared/canvas/types';

@Component({
  selector: 'app-style-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerModule],
  template: `
    <div class="style-section" *ngIf="nodeSelection(); else noSelection">
      <!-- Node Info Header -->
      <div class="node-info">
        <span class="node-label">{{ nodeSelection()!.label }}</span>
        <span class="node-type">{{ nodeSelection()!.type }}</span>
      </div>

      <!-- Scope Selector -->
      <div class="form-row">
        <label>APPLY TO</label>
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
            [ngModel]="fillColor()"
            (ngModelChange)="onFillChange($event)"
            format="hex"
            [appendTo]="'body'">
          </p-colorPicker>
          <input type="text"
                 class="hex-input"
                 [ngModel]="fillColor()"
                 (ngModelChange)="onFillInputChange($event)"
                 pattern="^#[0-9A-Fa-f]{6}$"
                 placeholder="#1f2937">
        </div>
        <button class="reset-btn" (click)="resetFill()" title="Reset to default">
          <i class="pi pi-refresh"></i>
        </button>
      </div>

      <!-- Stroke Color -->
      <div class="style-row">
        <span class="style-label">Stroke</span>
        <div class="color-control">
          <p-colorPicker
            [ngModel]="strokeColor()"
            (ngModelChange)="onStrokeChange($event)"
            format="hex"
            [appendTo]="'body'">
          </p-colorPicker>
          <input type="text"
                 class="hex-input"
                 [ngModel]="strokeColor()"
                 (ngModelChange)="onStrokeInputChange($event)"
                 pattern="^#[0-9A-Fa-f]{6}$"
                 placeholder="#4b5563">
        </div>
        <button class="reset-btn" (click)="resetStroke()" title="Reset to default">
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
        <button class="reset-btn" (click)="resetShape()" title="Reset to default">
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
        <button class="reset-btn" (click)="resetCornerRadius()" title="Reset to default">
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
        <button class="reset-btn" (click)="resetLabelVisibility()" title="Reset to default">
          <i class="pi pi-refresh"></i>
        </button>
      </div>

      <!-- Icon -->
      <div class="style-row">
        <span class="style-label">Icon</span>
        <input type="text"
               class="icon-input"
               [ngModel]="icon()"
               (blur)="onIconChange($any($event.target).value)"
               placeholder="Emoji or glyph">
        <button class="reset-btn" (click)="resetIcon()" title="Reset to default">
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
  `,
  styles: [`
    .style-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    // Node info header
    .node-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      background: rgba(0, 255, 255, 0.05);
      border: 1px solid rgba(0, 255, 255, 0.2);
      border-radius: 6px;
    }

    .node-label {
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
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

    // Form rows
    .form-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .form-row label {
      font-size: 0.75rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.7);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .form-row select {
      padding: 0.5rem;
      background: rgba(0, 255, 255, 0.05);
      border: 1px solid rgba(0, 255, 255, 0.3);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.95);
      font-size: 0.9rem;
    }

    .form-row select:focus {
      outline: none;
      border-color: rgba(0, 255, 255, 0.6);
      box-shadow: 0 0 0 2px rgba(0, 255, 255, 0.15);
    }

    // Style rows (label + control + reset)
    .style-row {
      display: grid;
      grid-template-columns: 70px 1fr auto;
      gap: 0.75rem;
      align-items: center;
    }

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
    }

    .reset-btn:hover {
      background: rgba(0, 255, 255, 0.1);
      border-color: rgba(0, 255, 255, 0.6);
      color: rgba(0, 255, 255, 0.9);
    }

    // Color control
    .color-control {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .hex-input {
      flex: 1;
      padding: 0.5rem;
      background: rgba(0, 255, 255, 0.05);
      border: 1px solid rgba(0, 255, 255, 0.3);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.95);
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.85rem;
    }

    .hex-input:focus {
      outline: none;
      border-color: rgba(0, 255, 255, 0.6);
      box-shadow: 0 0 0 2px rgba(0, 255, 255, 0.15);
    }

    // Range control
    .range-control {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .range-control input[type="range"] {
      flex: 1;
      accent-color: rgba(0, 255, 255, 0.9);
    }

    .range-value {
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.9rem;
      color: rgba(0, 255, 255, 0.9);
      min-width: 3ch;
      text-align: right;
    }

    // Toggle
    .toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .toggle input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: rgba(0, 255, 255, 0.9);
      cursor: pointer;
    }

    .toggle span {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.8);
    }

    // Icon input
    .icon-input {
      padding: 0.5rem;
      background: rgba(0, 255, 255, 0.05);
      border: 1px solid rgba(0, 255, 255, 0.3);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.95);
      font-size: 0.9rem;
    }

    .icon-input:focus {
      outline: none;
      border-color: rgba(0, 255, 255, 0.6);
      box-shadow: 0 0 0 2px rgba(0, 255, 255, 0.15);
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
    }

    .empty-state i {
      font-size: 2rem;
      color: rgba(0, 255, 255, 0.5);
    }

    .empty-state p {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    // Select styling
    select {
      padding: 0.5rem;
      background: rgba(0, 255, 255, 0.05);
      border: 1px solid rgba(0, 255, 255, 0.3);
      border-radius: 6px;
      color: rgba(255, 255, 255, 0.95);
      font-size: 0.9rem;
    }

    select:focus {
      outline: none;
      border-color: rgba(0, 255, 255, 0.6);
      box-shadow: 0 0 0 2px rgba(0, 255, 255, 0.15);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StylePanelComponent extends HudPanelBaseComponent implements OnInit, OnDestroy {
  // Signals for reactive state
  protected readonly nodeSelection = toSignal(this.canvasControl.selection$);
  protected readonly fillColor = signal<string>('#1f2937');
  protected readonly strokeColor = signal<string>('#4b5563');
  protected readonly shape = signal<NodeShape>('rounded');
  protected readonly cornerRadius = signal<number>(12);
  protected readonly labelVisible = signal<boolean>(true);
  protected readonly icon = signal<string>('');
  protected readonly currentScope = signal<StyleApplicationScope>('node');

  constructor(
    elementRef: ElementRef,
    hudPanel: HudPanelService,
    private readonly canvasControl: CanvasControlService
  ) {
    super(elementRef, hudPanel);
    this.panelId = 'style-panel';
    this.title = 'Style';
    this.icon = 'pi-palette';
  }

  override ngOnInit(): void {
    super.ngOnInit();

    // Register panel
    this.hudPanel.registerPanel(this.panelId, {
      id: this.panelId,
      title: this.title,
      icon: this.icon,
      defaultPosition: { x: 20, y: 100 },
      defaultVisible: false
    });

    // React to selection changes
    effect(() => {
      const selection = this.nodeSelection();
      if (selection) {
        this.syncFromSelection(selection);
        // Auto-show panel when node selected
        if (!this.hudPanel.isPanelVisible(this.panelId)) {
          this.hudPanel.showPanel(this.panelId);
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

  // Fill color handlers
  onFillChange(color: string | { value: string }): void {
    const normalized = this.normalizeColor(color);
    if (normalized) {
      this.fillColor.set(normalized);
      this.applyOverrides({ fill: normalized });
    }
  }

  onFillInputChange(value: string): void {
    const normalized = this.normalizeColor(value);
    if (normalized) {
      this.fillColor.set(normalized);
      this.applyOverrides({ fill: normalized });
    }
  }

  resetFill(): void {
    this.applyOverrides({ fill: undefined });
  }

  // Stroke color handlers
  onStrokeChange(color: string | { value: string }): void {
    const normalized = this.normalizeColor(color);
    if (normalized) {
      this.strokeColor.set(normalized);
      this.applyOverrides({ stroke: normalized });
    }
  }

  onStrokeInputChange(value: string): void {
    const normalized = this.normalizeColor(value);
    if (normalized) {
      this.strokeColor.set(normalized);
      this.applyOverrides({ stroke: normalized });
    }
  }

  resetStroke(): void {
    this.applyOverrides({ stroke: undefined });
  }

  // Shape handlers
  onShapeChange(shape: NodeShape): void {
    this.shape.set(shape);
    this.applyOverrides({ shape });
  }

  resetShape(): void {
    this.applyOverrides({ shape: undefined });
  }

  // Corner radius handlers
  onCornerRadiusChange(value: string): void {
    const numeric = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    this.cornerRadius.set(numeric);
    this.applyOverrides({ cornerRadius: numeric });
  }

  resetCornerRadius(): void {
    this.applyOverrides({ cornerRadius: undefined });
  }

  // Label visibility handlers
  onLabelToggle(visible: boolean): void {
    this.labelVisible.set(visible);
    this.applyOverrides({ labelVisible: visible });
  }

  resetLabelVisibility(): void {
    this.applyOverrides({ labelVisible: undefined });
  }

  // Icon handlers
  onIconChange(icon: string): void {
    const trimmed = icon?.trim() ?? '';
    this.icon.set(trimmed);
    this.applyOverrides({ icon: trimmed.length > 0 ? trimmed : undefined });
  }

  resetIcon(): void {
    this.applyOverrides({ icon: undefined });
  }

  // Scope change
  onScopeChange(scope: StyleApplicationScope): void {
    this.currentScope.set(scope);
  }

  // Apply overrides to canvas
  private applyOverrides(overrides: Partial<NodeStyleOverrides>): void {
    // Reuse existing CanvasControlService infrastructure
    this.canvasControl.applyNodeStyleOverride(overrides, this.currentScope());
  }

  // Color normalization (from Properties Panel)
  private normalizeColor(input: string | { value: string }): string | undefined {
    if (!input) return undefined;
    const raw = typeof input === 'object' ? input.value : input;
    if (!raw) return undefined;
    const value = raw.startsWith('#') ? raw : `#${raw}`;
    return value.length === 7 ? value : undefined;
  }
}
```

#### 6. Integration with RuntimeCanvasComponent

**File to Modify:** `frontend/src/app/runtime/runtime-canvas.component.html` (or .ts if inline template)

**Add HUD panels as siblings to canvas:**

```html
<div class="runtime-canvas-wrapper">
  <canvas #canvasElement></canvas>

  <!-- HUD Panels -->
  <app-style-panel *ngIf="hudPanelService.isPanelVisible('style-panel')">
  </app-style-panel>

  <!-- Add more panels here in future stages -->
</div>
```

**In RuntimeCanvasComponent TypeScript:**

```typescript
import { HudPanelService } from '../core/services/hud-panel.service';

export class RuntimeCanvasComponent {
  constructor(
    // ... existing dependencies
    public readonly hudPanelService: HudPanelService  // Add this
  ) {}

  ngOnInit(): void {
    // Existing init code...

    // Wire selection changes to CanvasControlService
    this.controller.setOnSelectionChanged((snapshot) => {
      this.canvasControl.setSelectionSnapshot(snapshot);
    });
  }
}
```

#### 7. Add Keyboard Shortcuts

**File to Modify:** `frontend/src/app/landing-shell.component.ts` (or wherever global shortcuts are handled)

```typescript
import { HostListener } from '@angular/core';
import { HudPanelService } from './core/services/hud-panel.service';

export class LandingShellComponent {
  constructor(private hudPanel: HudPanelService) {}

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.altKey) {
      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault();
          this.hudPanel.togglePanel('style-panel');
          break;
        case 'h':
          event.preventDefault();
          // Hide all panels
          this.hudPanel.visiblePanels().forEach(panel => {
            this.hudPanel.hidePanel(panel.id);
          });
          break;
      }
    }
  }
}
```

---

## TESTING CHECKLIST - STAGE 1

### Compilation
- [ ] No TypeScript errors
- [ ] No Angular template errors
- [ ] All imports resolve correctly
- [ ] PrimeNG ColorPicker imports successfully

### Basic Functionality
- [ ] Panel appears when node selected on canvas
- [ ] Panel shows correct node label and type
- [ ] Fill color picker opens and works
- [ ] Fill hex input accepts valid colors
- [ ] Stroke color picker opens and works
- [ ] Stroke hex input accepts valid colors
- [ ] Shape dropdown changes node shape
- [ ] Corner radius slider appears only for rounded shape
- [ ] Corner radius slider changes radius (0-100)
- [ ] Label visibility checkbox toggles label
- [ ] Icon input changes node icon
- [ ] Scope dropdown switches between "node" and "type"

### Real-time Updates
- [ ] Fill color changes apply IMMEDIATELY to canvas
- [ ] Stroke color changes apply IMMEDIATELY
- [ ] Shape changes apply IMMEDIATELY
- [ ] Corner radius changes apply IMMEDIATELY (during drag)
- [ ] Label visibility changes apply IMMEDIATELY
- [ ] Icon changes apply IMMEDIATELY (on blur)
- [ ] Scope "type" applies to all nodes of same type

### Reset Functionality
- [ ] Reset fill button clears fill override
- [ ] Reset stroke button clears stroke override
- [ ] Reset shape button clears shape override
- [ ] Reset radius button clears radius override
- [ ] Reset label button clears label visibility override
- [ ] Reset icon button clears icon override

### Panel Behavior
- [ ] Panel is draggable by header
- [ ] Panel cannot be dragged off-screen (boundary clamping)
- [ ] Panel position persists after page reload
- [ ] Opacity slider changes panel transparency
- [ ] Opacity value persists after page reload
- [ ] Close button hides panel
- [ ] Panel reopens when another node selected
- [ ] Clicking panel brings it to front (z-index)

### Keyboard Shortcuts
- [ ] `Alt + S` toggles Style Panel visibility
- [ ] `Alt + H` hides all HUD panels

### Edge Cases
- [ ] No errors when no node selected (shows empty state)
- [ ] Panel works with different node types
- [ ] Panel works when switching between nodes
- [ ] Invalid hex colors are ignored (no errors)
- [ ] localStorage quota exceeded handled gracefully
- [ ] No console errors or warnings

### Performance
- [ ] Canvas maintains ~60fps with panel open
- [ ] No frame drops during drag
- [ ] No frame drops during color changes
- [ ] Opacity transitions are smooth
- [ ] Memory usage within budget (<5MB increase)

### Visual/Styling
- [ ] Military theme (dark + cyan glow) renders correctly
- [ ] Corner bracket accents visible
- [ ] Glow effects not overwhelming
- [ ] Fonts readable (monospace for hex inputs)
- [ ] Custom scrollbar styled correctly
- [ ] All hover states work
- [ ] Focus indicators visible

---

## COMMON ISSUES & SOLUTIONS

### Issue: Panel doesn't appear when node selected

**Check:**
- Is `RuntimeCanvasController.setOnSelectionChanged()` wired up?
- Is `CanvasControlService.setSelectionSnapshot()` being called?
- Is `selection$` observable emitting values?
- Is HudPanelService properly injected?

**Solution:**
```typescript
// In RuntimeCanvasComponent.ngOnInit()
this.controller.setOnSelectionChanged((snapshot) => {
  console.log('Selection changed:', snapshot); // Debug log
  this.canvasControl.setSelectionSnapshot(snapshot);
});
```

### Issue: Color changes don't apply to canvas

**Check:**
- Is `applyNodeStyleOverride()` being called?
- Is `CanvasEventHubService` emitting events?
- Is `RuntimeCanvasController` handling 'StyleOverrideRequested' events?

**Solution:**
```typescript
// Add debug logging
private applyOverrides(overrides: Partial<NodeStyleOverrides>): void {
  console.log('Applying overrides:', overrides, 'scope:', this.currentScope());
  this.canvasControl.applyNodeStyleOverride(overrides, this.currentScope());
}
```

### Issue: Panel position doesn't persist

**Check:**
- Is `HudSettingsService` saving to localStorage?
- Is localStorage available (not in private browsing)?
- Is the `hud.*` namespace correct?

**Solution:**
```typescript
// Check localStorage manually
console.log('HUD settings:', localStorage.getItem('hud.settings'));
```

### Issue: Drag is jumpy or panel moves incorrectly

**Check:**
- Is `dragOffset` calculated correctly?
- Is `clampToViewport()` working?
- Are transitions disabled during drag?

**Solution:**
```typescript
// Ensure transitions are disabled
.hud-panel.dragging {
  transition: none !important;
}
```

### Issue: PrimeNG ColorPicker not rendering

**Check:**
- Is `ColorPickerModule` imported in standalone component?
- Is PrimeNG CSS loaded globally?
- Is `appendTo="'body'"` set to avoid z-index issues?

**Solution:**
```typescript
// Ensure correct import
imports: [CommonModule, FormsModule, ColorPickerModule]

// In angular.json, ensure PrimeNG theme is loaded
"styles": [
  "node_modules/primeng/resources/themes/lara-dark-blue/theme.css",
  "node_modules/primeng/resources/primeng.min.css",
  // ...
]
```

---

## PERFORMANCE TARGETS

| Metric | Target | How to Measure |
|--------|--------|----------------|
| FPS impact | < 2fps drop | Chrome DevTools Performance tab |
| Memory increase | < 5MB | Chrome DevTools Memory profiler |
| Drag latency | < 16ms | requestAnimationFrame timing |
| localStorage writes | Debounced 500ms | Network tab (localStorage events) |
| Initial render | < 100ms | Performance.mark/measure |

---

## NEXT STEPS AFTER STAGE 1

Once Stage 1 is complete and tested:

1. **Stage 2:** Polish styling (animations, hover effects, theme variants)
2. **Stage 3:** Add Content Panel (label editing, icons, badges)
3. **Stage 4:** Add Actions Panel (delete, duplicate, copy/paste style)
4. **Stage 5:** Media Panel (background images)
5. **Stage 6:** Replace Properties RHS Panel entirely

---

## CRITICAL PATTERNS TO FOLLOW

### Pattern 1: Signal-Based Reactivity
```typescript
// Always use signals for reactive state
protected readonly fillColor = signal<string>('#1f2937');

// Use computed for derived state
readonly visiblePanels = computed(() =>
  Array.from(this._panels().values()).filter(p => p.visible)
);

// Use toSignal for observables
protected readonly nodeSelection = toSignal(this.canvasControl.selection$);

// Use effect for side effects
effect(() => {
  const selection = this.nodeSelection();
  if (selection) {
    this.syncFromSelection(selection);
  }
});
```

### Pattern 2: Normalize → Apply → Persist
```typescript
// Always normalize user input
const normalized = this.normalizeColor(color);
if (!normalized) return; // Early exit if invalid

// Apply to canvas
this.applyOverrides({ fill: normalized });

// Persist happens automatically in applyOverrides via CanvasControlService
```

### Pattern 3: Debounced Saves
```typescript
// Debounce expensive operations (drag, localStorage writes)
private debouncedSave(): void {
  if (this.saveDebounceTimer) {
    clearTimeout(this.saveDebounceTimer);
  }
  this.saveDebounceTimer = setTimeout(() => {
    this.hudPanel.updatePosition(this.panelId, this.position());
  }, 500);
}
```

### Pattern 4: Boundary Clamping
```typescript
// Always clamp panel position to viewport
private clampToViewport(x: number, y: number): { x: number; y: number } {
  const panel = this.elementRef.nativeElement.querySelector('.hud-panel');
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
```

---

## COMMIT MESSAGE

```
feat: add HUD Style Panel for node property editing

- Create HudPanelService for panel orchestration (signal-based)
- Create HudSettingsService for localStorage persistence (hud.* namespace)
- Create HudPanelBaseComponent abstract base with drag & boundary clamping
- Create StylePanelComponent for node visual editing (MVP)
- Wire to existing CanvasControlService.applyNodeStyleOverride()
- Add military aesthetic styling (dark + cyan glow)
- Add keyboard shortcuts (Alt+S toggle, Alt+H hide all)
- Real-time node updates (fill, stroke, shape, radius, label, icon)
- Scope selector (node vs type)
- Per-property reset buttons

Reuses existing property editing infrastructure from PropertiesPanel.
Panel position and opacity persist in localStorage.
Panel cannot be dragged off-screen (viewport boundary clamping).

Stage 1 MVP complete. Next: Stage 2 (animations & polish).
```

---

**END OF LLM IMPLEMENTATION GUIDE**
