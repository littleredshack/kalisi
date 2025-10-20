import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  Signal,
  effect,
  ChangeDetectionStrategy,
  ElementRef
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
  templateUrl: './style-panel.component.html',
  styleUrls: ['./style-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StylePanelComponent extends HudPanelBaseComponent implements OnInit, OnDestroy {
  // Signals for reactive state
  protected readonly nodeSelection: Signal<NodeSelectionSnapshot | null | undefined>;
  protected readonly fillColor = signal<string>('#1f2937');
  protected readonly strokeColor = signal<string>('#4b5563');
  protected readonly shape = signal<NodeShape>('rounded');
  protected readonly cornerRadius = signal<number>(12);
  protected readonly labelVisible = signal<boolean>(true);
  protected readonly nodeIcon = signal<string>('');
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

    // Initialize nodeSelection signal after canvasControl is available
    this.nodeSelection = toSignal(this.canvasControl.selection$);
  }

  override ngOnInit(): void {
    console.log('[StylePanel] ngOnInit called, panelId:', this.panelId);
    super.ngOnInit();

    console.log('[StylePanel] Registering panel:', this.panelId);
    // Register panel
    this.hudPanel.registerPanel(this.panelId, {
      id: this.panelId,
      title: this.title,
      icon: this.icon,
      defaultPosition: { x: 20, y: 100 },
      defaultVisible: false
    });
    console.log('[StylePanel] Panel registered');

    // React to selection changes
    effect(() => {
      const selection = this.nodeSelection();
      if (selection && selection.kind === 'node') {
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
    this.nodeIcon.set(overrides.icon ?? base.icon ?? '');
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
    this.nodeIcon.set(trimmed);
    this.applyOverrides({ icon: trimmed.length > 0 ? trimmed : undefined });
  }

  resetIcon(): void {
    this.applyOverrides({ icon: undefined });
  }

  // Scope change
  onScopeChange(scope: StyleApplicationScope): void {
    this.currentScope.set(scope);
  }

  // Apply overrides to canvas (reuses existing CanvasControlService infrastructure)
  private applyOverrides(overrides: Partial<NodeStyleOverrides>): void {
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
