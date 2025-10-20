import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerModule } from 'primeng/colorpicker';
import { TooltipModule } from 'primeng/tooltip';
import { CanvasControlService } from '../../core/services/canvas-control.service';
import { NodeSelectionSnapshot, StyleApplicationScope, NodeShape, NodeStyleOverrides } from '../../shared/canvas/types';
import { Observable } from 'rxjs';

interface EditableNodeStyle {
  fill: string;
  stroke: string;
  icon: string;
  labelVisible: boolean;
  shape: NodeShape;
  cornerRadius: number;
}

@Component({
  selector: 'app-node-style-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ColorPickerModule,
    TooltipModule
  ],
  templateUrl: './node-style-panel.component.html',
  styleUrls: ['./node-style-panel.component.scss']
})
export class NodeStylePanelComponent implements OnInit, OnDestroy, OnChanges {
  @Input() isOpen = false;

  // Panel state
  isVisible = false;
  panelWidth = 380;
  panelHeight = 600;
  panelX = 100;
  panelY = 100;

  dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  resizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeHandle = '';

  private readonly STORAGE_KEY = 'node-style-panel-state';

  // Node styling
  readonly selection$: Observable<NodeSelectionSnapshot | null>;
  nodeStyle: EditableNodeStyle | null = null;
  currentScope: StyleApplicationScope = 'node';
  private pendingNodeOverrides: Partial<NodeStyleOverrides> = {};

  readonly scopeOptions: Array<{ value: StyleApplicationScope; label: string }> = [
    { value: 'node', label: 'This node only' },
    { value: 'type', label: 'All nodes of this type' }
  ];

  readonly shapeOptions: Array<{ value: NodeShape; label: string }> = [
    { value: 'rounded', label: 'Rounded Rectangle' },
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'circle', label: 'Circle' },
    { value: 'triangle', label: 'Triangle' }
  ];

  constructor(private canvasControlService: CanvasControlService) {
    this.selection$ = this.canvasControlService.selection$;
  }

  ngOnInit(): void {
    this.loadPanelState();

    // Add global mouse event listeners
    document.addEventListener('mousemove', this.onGlobalMouseMove);
    document.addEventListener('mouseup', this.onGlobalMouseUp);
    document.addEventListener('keydown', this.onGlobalKeyDown);

    // Subscribe to selection changes
    this.selection$.subscribe(selection => {
      if (selection && selection.kind === 'node') {
        this.nodeStyle = this.createEditableStyle(selection);
        this.pendingNodeOverrides = this.extractSelectionOverrides(selection) ?? {};
        // Don't auto-open - wait for keyboard shortcut
      } else {
        // Close the panel when no node is selected
        this.nodeStyle = null;
        this.pendingNodeOverrides = {};
        if (this.isVisible) {
          this.isVisible = false;
          this.isOpen = false;
        }
      }
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.onGlobalMouseMove);
    document.removeEventListener('mouseup', this.onGlobalMouseUp);
    document.removeEventListener('keydown', this.onGlobalKeyDown);
  }

  private onGlobalKeyDown = (event: KeyboardEvent): void => {
    // Option-S (Alt-S) to toggle the panel when a node is selected
    if ((event.altKey || event.metaKey) && event.code === 'KeyS') {
      // Only work when there's a node selection
      if (this.nodeStyle) {
        event.preventDefault();
        this.isVisible = !this.isVisible;
        this.isOpen = this.isVisible;
      }
    }
  };

  ngOnChanges(changes: SimpleChanges): void {
    if ('isOpen' in changes) {
      if (this.isOpen && !this.isVisible) {
        this.isVisible = true;
      } else if (!this.isOpen && this.isVisible) {
        this.isVisible = false;
      }
    }
  }

  closePanel(): void {
    this.isVisible = false;
    this.isOpen = false;
  }

  // Drag functionality
  onHeaderDragStart(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.control-btn')) {
      return;
    }

    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragOffsetX = event.clientX - this.panelX;
    this.dragOffsetY = event.clientY - this.panelY;
    event.preventDefault();
  }

  // Resize functionality
  onResizeStart(event: MouseEvent, handle: string): void {
    this.resizing = true;
    this.resizeHandle = handle;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;
    this.resizeStartWidth = this.panelWidth;
    this.resizeStartHeight = this.panelHeight;
    event.preventDefault();
  }

  private onGlobalMouseMove = (event: MouseEvent): void => {
    if (this.dragging) {
      this.panelX = event.clientX - this.dragOffsetX;
      this.panelY = event.clientY - this.dragOffsetY;

      const maxX = window.innerWidth - 100;
      const maxY = window.innerHeight - 60;
      this.panelX = Math.max(0, Math.min(maxX, this.panelX));
      this.panelY = Math.max(0, Math.min(maxY, this.panelY));
    } else if (this.resizing) {
      const deltaX = event.clientX - this.resizeStartX;
      const deltaY = event.clientY - this.resizeStartY;

      switch (this.resizeHandle) {
        case 'right':
          this.panelWidth = Math.max(320, Math.min(600, this.resizeStartWidth + deltaX));
          break;
        case 'bottom':
          this.panelHeight = Math.max(400, Math.min(900, this.resizeStartHeight + deltaY));
          break;
        case 'bottom-right':
          this.panelWidth = Math.max(320, Math.min(600, this.resizeStartWidth + deltaX));
          this.panelHeight = Math.max(400, Math.min(900, this.resizeStartHeight + deltaY));
          break;
      }
    }
  };

  private onGlobalMouseUp = (): void => {
    if (this.resizing || this.dragging) {
      this.savePanelState();
    }
    this.resizing = false;
    this.dragging = false;
    this.resizeHandle = '';
  };

  private loadPanelState(): void {
    const savedState = localStorage.getItem(this.STORAGE_KEY);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.width >= 320 && state.width <= 600) {
          this.panelWidth = state.width;
        }
        if (state.height >= 400 && state.height <= 900) {
          this.panelHeight = state.height;
        }
        if (state.x !== undefined && state.y !== undefined) {
          this.panelX = Math.max(0, Math.min(window.innerWidth - 100, state.x));
          this.panelY = Math.max(0, Math.min(window.innerHeight - 60, state.y));
        }
      } catch (e) {
        console.warn('Failed to parse saved node style panel state', e);
      }
    }
  }

  private savePanelState(): void {
    const state = {
      x: this.panelX,
      y: this.panelY,
      width: this.panelWidth,
      height: this.panelHeight
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  }

  // Node styling methods
  private createEditableStyle(selection: NodeSelectionSnapshot): EditableNodeStyle {
    const base = selection.style;
    const overrides = (selection.overrides ?? {}) as NodeStyleOverrides;
    return {
      fill: overrides.fill ?? base.fill,
      stroke: overrides.stroke ?? base.stroke,
      icon: overrides.icon ?? base.icon ?? '',
      labelVisible: overrides.labelVisible ?? base.labelVisible,
      shape: overrides.shape ?? base.shape,
      cornerRadius: overrides.cornerRadius ?? base.cornerRadius
    };
  }

  private extractSelectionOverrides(selection: NodeSelectionSnapshot): Partial<NodeStyleOverrides> | null {
    const overrides = selection?.overrides;
    if (!overrides) {
      return null;
    }

    const result: Partial<NodeStyleOverrides> = {};
    if (overrides.fill !== undefined) result.fill = overrides.fill;
    if (overrides.stroke !== undefined) result.stroke = overrides.stroke;
    if (overrides.icon !== undefined) result.icon = overrides.icon;
    if (overrides.labelVisible !== undefined) result.labelVisible = overrides.labelVisible;
    if (overrides.shape !== undefined) result.shape = overrides.shape;
    if (overrides.cornerRadius !== undefined) result.cornerRadius = overrides.cornerRadius;
    if (overrides.badges) {
      result.badges = overrides.badges.map(badge => ({ ...badge }));
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private normalizeColor(input: string | { value: string } | null | undefined): string | undefined {
    if (!input) return undefined;
    const raw = typeof input === 'object' ? input.value : input;
    if (!raw) return undefined;
    const value = raw.startsWith('#') ? raw : `#${raw}`;
    return value.length === 7 ? value : undefined;
  }

  private applyOverrides(overrides: Partial<NodeStyleOverrides>): void {
    this.updatePendingOverrides(overrides);
    this.canvasControlService.applyNodeStyleOverride(overrides, this.currentScope);
  }

  private updatePendingOverrides(patch: Partial<NodeStyleOverrides>): void {
    this.pendingNodeOverrides = { ...this.pendingNodeOverrides };
    Object.entries(patch).forEach(([key, value]) => {
      (this.pendingNodeOverrides as Record<string, unknown>)[key] = value;
    });
  }

  onFillChange(color: string | { value: string }): void {
    const value = this.normalizeColor(color);
    if (value && this.nodeStyle) {
      this.nodeStyle.fill = value;
      this.applyOverrides({ fill: value });
    }
  }

  onFillInputChange(value: string): void {
    const normalised = this.normalizeColor(value);
    if (normalised && this.nodeStyle) {
      this.nodeStyle.fill = normalised;
      this.applyOverrides({ fill: normalised });
    }
  }

  resetFill(): void {
    this.applyOverrides({ fill: undefined });
  }

  onStrokeChange(color: string | { value: string }): void {
    const value = this.normalizeColor(color);
    if (value && this.nodeStyle) {
      this.nodeStyle.stroke = value;
      this.applyOverrides({ stroke: value });
    }
  }

  onStrokeInputChange(value: string): void {
    const normalised = this.normalizeColor(value);
    if (normalised && this.nodeStyle) {
      this.nodeStyle.stroke = normalised;
      this.applyOverrides({ stroke: normalised });
    }
  }

  resetStroke(): void {
    this.applyOverrides({ stroke: undefined });
  }

  onLabelToggle(visible: boolean): void {
    if (this.nodeStyle) {
      this.nodeStyle.labelVisible = visible;
    }
    this.applyOverrides({ labelVisible: visible });
  }

  resetLabelVisibility(): void {
    this.applyOverrides({ labelVisible: undefined });
  }

  onIconChange(icon: string): void {
    const trimmed = icon?.trim() ?? '';
    if (this.nodeStyle) {
      this.nodeStyle.icon = trimmed;
    }
    this.applyOverrides({ icon: trimmed.length > 0 ? trimmed : undefined });
  }

  resetIcon(): void {
    this.applyOverrides({ icon: undefined });
  }

  onShapeChange(shape: NodeShape): void {
    if (this.nodeStyle) {
      this.nodeStyle.shape = shape;
    }
    this.applyOverrides({ shape });
  }

  resetShape(): void {
    this.applyOverrides({ shape: undefined });
  }

  onCornerRadiusChange(value: string): void {
    const numeric = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    if (this.nodeStyle) {
      this.nodeStyle.cornerRadius = numeric;
    }
    this.applyOverrides({ cornerRadius: numeric });
  }

  resetCornerRadius(): void {
    this.applyOverrides({ cornerRadius: undefined });
  }

  onScopeChange(scope: StyleApplicationScope): void {
    this.currentScope = scope;

    if (scope === 'type') {
      const overrides = this.normalizePendingOverrides();
      if (overrides) {
        this.canvasControlService.applyNodeStyleOverride(overrides, scope);
      }
    }
  }

  private normalizePendingOverrides(): Partial<NodeStyleOverrides> | null {
    const entries = Object.entries(this.pendingNodeOverrides ?? {});
    if (entries.length === 0) {
      return null;
    }
    const result: Partial<NodeStyleOverrides> = {};
    entries.forEach(([key, value]) => {
      (result as Record<string, unknown>)[key] = value;
    });
    return Object.keys(result).length > 0 ? result : null;
  }
}
