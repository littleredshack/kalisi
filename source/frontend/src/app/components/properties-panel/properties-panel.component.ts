import { Component, Input, OnChanges, SimpleChanges, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Accordion, AccordionPanel, AccordionHeader, AccordionContent } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { ColorPickerModule } from 'primeng/colorpicker';
import { CanvasControlService } from '../../core/services/canvas-control.service';
import { ThemeService } from '../../core/services/theme.service';
import { NodeSelectionSnapshot, StyleApplicationScope, NodeShape, NodeStyleOverrides } from '../../shared/canvas/types';

interface EditableNodeStyle {
  fill: string;
  stroke: string;
  icon: string;
  labelVisible: boolean;
  shape: NodeShape;
  cornerRadius: number;
}

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    Accordion,
    AccordionPanel,
    AccordionHeader,
    AccordionContent,
    ButtonModule,
    ColorPickerModule
  ],
  template: `    <div class="properties-panel" [style.--panel-opacity]="panelOpacity">
      <div class="accordion-container">
        <p-accordion class="panel-accordion" [(value)]="openPanels" [multiple]="true">
          <p-accordion-panel value="canvas-settings" *ngIf="hasActiveCanvas">
            <p-accordion-header>
              <span class="accordion-header">
                <i class="pi pi-sliders-h"></i>
                <span>Canvas Settings</span>
              </span>
            </p-accordion-header>
            <p-accordion-content>
              <div class="section section--canvas">
                <div class="section-summary">
                  <div class="summary-primary">
                    <span class="summary-title">{{ getCurrentViewName() }}</span>
                    <span class="summary-meta" *ngIf="autoLayoutLabel">{{ autoLayoutLabel }}</span>
                  </div>
                  <div class="summary-camera" *ngIf="cameraInfo">
                    {{ cameraInfo.x }}, {{ cameraInfo.y }} · {{ cameraInfo.zoom }}x
                  </div>
                </div>

                <div class="button-row">
                  <button pButton type="button" label="Reset" icon="pi pi-refresh" class="p-button-sm"
                          (click)="resetCanvas()"></button>
                  <button pButton type="button" label="Save Layout" icon="pi pi-save" class="p-button-sm p-button-success"
                          (click)="saveLayout()"></button>
                  <button pButton type="button" label="Undo" icon="pi pi-undo" class="p-button-sm"
                          [disabled]="!canUndo" (click)="undo()"></button>
                  <button pButton type="button" label="Redo" icon="pi pi-redo" class="p-button-sm"
                          [disabled]="!canRedo" (click)="redo()"></button>
                  <button pButton type="button"
                          [label]="isAutoLayoutEnabled ? 'Auto Layout On' : 'Auto Layout Off'"
                          icon="pi pi-sitemap"
                          class="p-button-sm"
                          [ngClass]="isAutoLayoutEnabled ? 'p-button-warning' : 'p-button-secondary'"
                          (click)="toggleAutoLayout()"></button>
                </div>

                <div class="form-grid form-grid--canvas">
                  <div class="form-row" *ngIf="collapseLevelOptions?.length">
                    <label>Collapse to level</label>
                    <select (change)="collapseToLevel($any($event.target).value)">
                      <option value="">Select level</option>
                      <option *ngFor="let option of collapseLevelOptions" [value]="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>

                  <div class="form-row" *ngIf="layoutOptions">
                    <label>Layout engine</label>
                    <select [ngModel]="layoutOptions!.activeId" (ngModelChange)="changeLayoutEngine($event)">
                      <option *ngFor="let option of layoutOptions!.options" [value]="option.id">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>

                  <div class="form-row" *ngIf="lensOptions">
                    <label>Graph lens</label>
                    <select [ngModel]="lensOptions!.activeId" (ngModelChange)="changeGraphLens($event)">
                      <option *ngFor="let lens of lensOptions!.options" [value]="lens.id">
                        {{ lens.label }}
                      </option>
                    </select>
                  </div>
                </div>

                <div class="preset-block" *ngIf="hasPresetControls()">
                  <div class="preset-header">
                    <span class="preset-title">View preset</span>
                    <button type="button" class="link-button" (click)="resetPresetOverrides()" *ngIf="hasPresetOverrides">
                      Reset overrides
                    </button>
                  </div>
                  <div class="form-row">
                    <select [ngModel]="activePresetId" (ngModelChange)="onPresetSelect($event)">
                      <option *ngFor="let option of presetOptions" [value]="option.id">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                  <p class="preset-description" *ngIf="presetDescription">{{ presetDescription }}</p>
                  <div class="palette-grid" *ngIf="activePresetId; else presetPlaceholder">
                    <div class="palette-row" *ngFor="let palette of paletteKeys">
                      <span class="palette-label">{{ palette.label }}</span>
                      <div class="style-control color-control">
                        <p-colorPicker
                          [(ngModel)]="paletteDraft[palette.key]"
                          format="hex"
                          [appendTo]="'body'"
                          [disabled]="!activePresetId"
                          (ngModelChange)="onPresetColorChange(palette.key, $event)"
                          class="color-swatch-button"
                        ></p-colorPicker>
                        <span class="color-preview" [style.background]="paletteDraft[palette.key]"></span>
                        <input
                          type="text"
                          class="hex-input"
                          [(ngModel)]="paletteDraft[palette.key]"
                          (ngModelChange)="onPresetColorInputChange(palette.key, $event)"
                          [disabled]="!activePresetId"
                          placeholder="#0f172a"
                          maxlength="7"
                          pattern="^#[0-9A-Fa-f]{6}$">
                      </div>
                    </div>
                  </div>
                  <ng-template #presetPlaceholder>
                    <div class="preset-empty">
                      <i class="pi pi-info-circle"></i>
                      <span>Select a preset to adjust colours.</span>
                    </div>
                  </ng-template>
                </div>

                <div class="containment-card" *ngIf="isCanvasView()">
                  <label class="toggle-switch">
                    <input type="checkbox" [(ngModel)]="containmentEnabled" />
                    <span class="slider"></span>
                    <span class="toggle-label">Enable containment nesting</span>
                  </label>
                  <div class="containment-meta">
                    <span>Edges: <strong>CONTAINS</strong></span>
                    <span class="status" *ngIf="containmentEnabled"><i class="pi pi-check-circle"></i> Active</span>
                  </div>
                </div>
              </div>
            </p-accordion-content>
          </p-accordion-panel>

          <p-accordion-panel value="node-settings" *ngIf="nodeSelection">
            <p-accordion-header>
              <span class="accordion-header">
                <i class="pi pi-palette"></i>
                <span>Node / Relationship Settings</span>
              </span>
            </p-accordion-header>
            <p-accordion-content>
              <div class="section section--node" *ngIf="nodeStyle; else nodeStyleEmpty">
                <div class="section-summary">
                  <div class="summary-primary">
                    <span class="summary-title">{{ nodeSelection!.label || 'Selected node' }}</span>
                    <span class="summary-meta summary-meta--badge">{{ nodeSelection!.type }}</span>
                  </div>
                  <div class="scope-group">
                    <label>Apply to</label>
                    <select [ngModel]="currentScope" (ngModelChange)="onScopeChange($event)">
                      <option *ngFor="let option of scopeOptions" [value]="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>
                </div>

                <div class="style-grid">
                  <div class="style-row">
                    <span class="style-label">Fill</span>
                    <div class="style-control color-control">
                      <p-colorPicker
                        [(ngModel)]="nodeStyle.fill"
                        format="hex"
                        [appendTo]="'body'"
                        (ngModelChange)="onFillChange($event)"
                        class="color-swatch-button"
                      ></p-colorPicker>
                      <span class="color-preview" [style.background]="nodeStyle.fill"></span>
                      <input
                        type="text"
                        class="hex-input"
                        [(ngModel)]="nodeStyle.fill"
                        (ngModelChange)="onFillInputChange($event)"
                        placeholder="#1f2937"
                        maxlength="7"
                        pattern="^#[0-9A-Fa-f]{6}$">
                    </div>
                    <button type="button" class="ghost-button" (click)="resetFill()">Reset</button>
                  </div>

                  <div class="style-row">
                    <span class="style-label">Border</span>
                    <div class="style-control color-control">
                      <p-colorPicker
                        [(ngModel)]="nodeStyle.stroke"
                        format="hex"
                        [appendTo]="'body'"
                        (ngModelChange)="onStrokeChange($event)"
                        class="color-swatch-button"
                      ></p-colorPicker>
                      <span class="color-preview" [style.background]="nodeStyle.stroke"></span>
                      <input
                        type="text"
                        class="hex-input"
                        [(ngModel)]="nodeStyle.stroke"
                        (ngModelChange)="onStrokeInputChange($event)"
                        placeholder="#4b5563"
                        maxlength="7"
                        pattern="^#[0-9A-Fa-f]{6}$">
                    </div>
                    <button type="button" class="ghost-button" (click)="resetStroke()">Reset</button>
                  </div>

                  <div class="style-row">
                    <span class="style-label">Label</span>
                    <div class="style-control">
                      <label class="toggle">
                        <input type="checkbox" [checked]="nodeStyle.labelVisible" (change)="onLabelToggle($event.target.checked)">
                        <span>Visible</span>
                      </label>
                    </div>
                    <button type="button" class="ghost-button" (click)="resetLabelVisibility()">Reset</button>
                  </div>

                  <div class="style-row">
                    <span class="style-label">Icon</span>
                    <div class="style-control">
                      <input type="text" [(ngModel)]="nodeStyle.icon" (blur)="onIconChange(nodeStyle.icon)" placeholder="Emoji or glyph" />
                    </div>
                    <button type="button" class="ghost-button" (click)="resetIcon()">Reset</button>
                  </div>

                  <div class="style-row">
                    <span class="style-label">Shape</span>
                    <div class="style-control">
                      <select [ngModel]="nodeStyle.shape" (ngModelChange)="onShapeChange($event)">
                        <option *ngFor="let shape of shapeOptions" [value]="shape.value">{{ shape.label }}</option>
                      </select>
                    </div>
                    <button type="button" class="ghost-button" (click)="resetShape()">Reset</button>
                  </div>

                  <div class="style-row" *ngIf="nodeStyle.shape === 'rounded'">
                    <span class="style-label">Radius</span>
                    <div class="style-control range-control">
                      <input type="range" min="0" max="100" [value]="nodeStyle.cornerRadius" (input)="onCornerRadiusChange($any($event.target).value)" />
                      <span class="range-value">{{ nodeStyle.cornerRadius }}</span>
                    </div>
                    <button type="button" class="ghost-button" (click)="resetCornerRadius()">Reset</button>
                  </div>
                </div>
              </div>
              <ng-template #nodeStyleEmpty>
                <div class="section empty">
                  <i class="pi pi-info-circle"></i>
                  <p>Select a node on the canvas to adjust styling.</p>
                </div>
              </ng-template>
            </p-accordion-content>
          </p-accordion-panel>
        </p-accordion>
      </div>
      <div class="panel-footer">
        <label>
          <span>Panel opacity</span>
          <span>{{ (panelOpacity * 100) | number:'1.0-0' }}%</span>
        </label>
        <input type="range"
               min="0"
               max="1"
               step="0.05"
               [ngModel]="panelOpacity"
               (ngModelChange)="onPanelOpacityChange($event)">
      </div>
    </div>
`,
  styles: [`
    .properties-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: 0.75rem;
    }

    .accordion-container {
      flex: 1;
      display: flex;
    }

    .panel-accordion {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    :host {
      display: block;
      --panel-opacity: var(--properties-panel-opacity, 0.85);
    }

    :host ::ng-deep .panel-accordion .p-accordion {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .p-accordion-content {
      background: transparent !important;
      border: none !important;
      padding: 0 !important;
    }

    :host ::ng-deep .p-accordion-tab {
      background: transparent;
      border: none;
    }

    :host ::ng-deep .p-accordion-header-link {
      display: block;
      padding: 0;
      background: transparent;
      border: none;
    }

    .accordion-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.4rem 0.55rem;
      border-radius: 6px;
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.6));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.35));
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.85));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.35));
      border-radius: 8px;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .form-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .form-grid--canvas {
      gap: 0.6rem;
    }

    .form-row {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .form-row > label {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .form-row select,
    .form-row input[type="text"] {
      padding: 0.5rem 0.65rem;
      border-radius: 6px;
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.55));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.35));
      color: var(--text-primary);
      font-size: 0.9rem;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .section-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .summary-primary {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .summary-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .summary-meta {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .summary-meta--badge {
      display: inline-flex;
      align-items: center;
      padding: 0.15rem 0.6rem;
      border-radius: 999px;
      background: rgba(110, 168, 254, 0.18);
      border: 1px solid rgba(110, 168, 254, 0.35);
      text-transform: capitalize;
    }

    .summary-camera {
      font-family: 'IBM Plex Mono', 'Fira Code', monospace;
      font-size: 0.78rem;
      color: var(--text-secondary);
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.45));
      padding: 0.4rem 0.6rem;
      border-radius: 6px;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .button-row button {
      min-width: 110px;
    }

    .preset-block {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(110, 168, 254, 0.12);
    }

    .preset-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .preset-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-primary);
    }

    .link-button {
      background: none;
      border: none;
      color: rgba(110, 168, 254, 0.9);
      cursor: pointer;
      font-size: 0.78rem;
      text-decoration: underline;
      padding: 0;
    }

    .link-button:hover {
      color: #6ea8fe;
    }

    .containment-card {
      margin-top: 1rem;
      padding: 0.75rem;
      border-radius: 8px;
      transition: background 0.2s ease, border-color 0.2s ease;
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.55));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.3));
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .containment-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    .containment-meta .status {
      color: #22c55e;
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
    }

    .scope-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      min-width: 180px;
    }

    .scope-group select {
      padding: 0.45rem 0.6rem;
      border-radius: 6px;
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.55));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.35));
      color: var(--text-primary);
      font-size: 0.9rem;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .empty {
      align-items: center;
      text-align: center;
      gap: 0.75rem;
      opacity: 0.8;
    }

    .style-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .palette-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .palette-row {
      display: grid;
      grid-template-columns: minmax(90px, 120px) 1fr;
      gap: 0.75rem;
      align-items: center;
    }

    .palette-label {
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .preset-description {
      margin: 0.25rem 0 0;
      font-size: 0.9rem;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .preset-empty {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      border-radius: 6px;
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.55));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.3));
      color: var(--text-secondary);
      font-size: 0.9rem;
    }

    .style-row {
      display: grid;
      grid-template-columns: minmax(80px, 100px) 1fr auto;
      gap: 0.6rem;
      align-items: center;
    }

    .style-label {
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-weight: 500;
    }

    .style-control {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .color-control p-colorpicker {
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid rgba(110, 168, 254, 0.4);
    }

    .color-swatch-button {
      padding: 0;
    }

    .color-swatch-button :deep(.p-colorpicker-preview) {
      width: 36px;
      height: 36px;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.4);
    }

    .hex-input {
      flex: 1;
      min-width: 120px;
      padding: 0.45rem 0.55rem;
      border-radius: 6px;
      border: 1px solid rgba(110, 168, 254, 0.25);
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.55));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.35));
      color: var(--text-primary);
      font-family: 'IBM Plex Mono', 'Fira Code', monospace;
      font-size: 0.85rem;
    }

    .hex-input:focus {
      outline: none;
      border-color: rgba(110, 168, 254, 0.6);
      box-shadow: 0 0 0 2px rgba(110, 168, 254, 0.15);
    }

    .color-preview {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid rgba(148, 163, 184, 0.4);
    }

    .range-control {
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .range-value {
      font-variant-numeric: tabular-nums;
      color: var(--text-secondary);
    }

    .ghost-button {
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: transparent;
      color: var(--text-secondary);
      padding: 0.35rem 0.6rem;
      border-radius: 6px;
      cursor: pointer;
    }

    .toggle {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .toggle-switch {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .toggle-switch input {
      accent-color: #6ea8fe;
      width: 18px;
      height: 18px;
    }

    .slider {
      display: inline-block;
      width: 40px;
      height: 20px;
      background: rgba(148, 163, 184, 0.6);
      border-radius: 999px;
      position: relative;
      transition: background 0.2s ease;
    }

    .slider::after {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      top: 2px;
      left: 2px;
      transition: transform 0.2s ease;
    }

    .toggle-switch input:checked + .slider {
      background: #6ea8fe;
    }

    .toggle-switch input:checked + .slider::after {
      transform: translateX(20px);
    }

    .hint {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      font-size: 0.9rem;
      color: var(--text-secondary);
    }

    .info-grid {
      display: grid;
      gap: 0.6rem;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }

    .info-item {
      padding: 0.65rem;
      border-radius: 6px;
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.55));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.3));
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .info-item .label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .info-item .value {
      color: var(--text-primary);
      font-weight: 500;
    }

    .status-ok {
      color: #22c55e;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .panel-footer {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      margin-top: auto;
      background: rgba(15, 23, 42, calc(var(--panel-opacity) * 0.6));
      border: 1px solid rgba(110, 168, 254, calc(var(--panel-opacity) * 0.3));
      border-radius: 8px;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .panel-footer label {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .panel-footer span {
      font-family: 'IBM Plex Mono', 'Fira Code', monospace;
      color: var(--text-primary);
    }

    .panel-footer input[type="range"] {
      width: 100%;
      accent-color: #6ea8fe;
    }

    .panel-footer input[type="range"]::-webkit-slider-thumb {
      width: 14px;
      height: 14px;
    }

    .panel-footer input[type="range"]::-moz-range-thumb {
      width: 14px;
      height: 14px;
    }

    .panel-footer input[type="range"]::-ms-thumb {
      width: 14px;
      height: 14px;
    }

    .panel-footer input[type="range"]::-webkit-slider-runnable-track {
      height: 4px;
      border-radius: 2px;
    }

    .panel-footer input[type="range"]::-moz-range-track {
      height: 4px;
      border-radius: 2px;
    }

    .panel-footer input[type="range"]::-ms-track {
      height: 4px;
      border-radius: 2px;
    }

  `]
})
export class PropertiesPanelComponent implements OnChanges {
  @Input() selectedLibraryItem: string | null = null;
  @Input() selectedViewNodeDetails: any = null;
  @Input() nodeSelection: NodeSelectionSnapshot | null = null;
  @Input() hasActiveCanvas = false;
  @Input() cameraInfo: { x: number; y: number; zoom: number } | null = null;
  @Input() autoLayoutLabel = 'Auto Layout: OFF';
  @Input() isAutoLayoutEnabled = false;
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Input() collapseLevelOptions: Array<{ label: string; value: number }> | null = null;
  @Input() layoutOptions: { options: Array<{ id: string; label: string }>; activeId: string | null } | null = null;
  @Input() lensOptions: { options: Array<{ id: string; label: string }>; activeId: string | null } | null = null;
  @Input() presetOptions: Array<{ id: string; label: string; description?: string }> = [];
  @Input() activePresetId: string | null = null;
  @Input() activePresetLabel: string | null = null;
  @Input() presetDescription: string | null = null;
  @Input() presetPalette: Record<string, string> | null = null;
  @Input() hasPresetOverrides = false;

  openPanels: string[] = ['canvas-settings'];
  nodeStyle: EditableNodeStyle | null = null;
  currentScope: StyleApplicationScope = 'node';
  containmentEnabled = false;
  panelOpacity = 0.85;
  paletteDraft: Record<string, string> = {};

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

  readonly paletteKeys: Array<{ key: string; label: string; fallback: string }> = [
    { key: 'primary', label: 'Primary', fallback: '#60a5fa' },
    { key: 'secondary', label: 'Secondary', fallback: '#8b5cf6' },
    { key: 'accent', label: 'Accent', fallback: '#34d399' },
    { key: 'muted', label: 'Muted', fallback: '#1f2937' },
    { key: 'positive', label: 'Positive', fallback: '#22c55e' },
    { key: 'warning', label: 'Warning', fallback: '#facc15' },
    { key: 'danger', label: 'Danger', fallback: '#f97316' }
  ];

  constructor(
    private readonly canvasControlService: CanvasControlService,
    private readonly themeService: ThemeService
  ) {
    effect(() => {
      this.panelOpacity = this.themeService.panelOpacity();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('nodeSelection' in changes) {
      this.syncNodeSelection();
    }
    if ('presetPalette' in changes || 'activePresetId' in changes) {
      this.syncPaletteDraft();
    }
  }

  private syncNodeSelection(): void {
    if (this.nodeSelection) {
      this.nodeStyle = this.createEditableStyle(this.nodeSelection);
      if (!this.openPanels.includes('node-settings')) {
        this.openPanels = [...this.openPanels, 'node-settings'];
      }
    } else {
      this.nodeStyle = null;
      this.openPanels = this.openPanels.filter(panel => panel !== 'node-settings');
    }
  }

  private syncPaletteDraft(): void {
    if (!this.activePresetId) {
      this.paletteDraft = {};
      return;
    }

    const source = this.presetPalette ?? {};
    const next: Record<string, string> = {};
    this.paletteKeys.forEach(({ key, fallback }) => {
      const raw = typeof source[key] === 'string' ? source[key] : fallback;
      const normalised = this.normalizeColor(raw) ?? fallback;
      next[key] = normalised;
    });
    this.paletteDraft = next;
  }

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

  private normalizeColor(input: string | { value: string } | null | undefined): string | undefined {
    if (!input) return undefined;
    const raw = typeof input === 'object' ? input.value : input;
    if (!raw) return undefined;
    const value = raw.startsWith('#') ? raw : `#${raw}`;
    return value.length === 7 ? value : undefined;
  }

  private applyOverrides(overrides: Partial<NodeStyleOverrides>): void {
    if (!this.nodeSelection) {
      return;
    }
    this.canvasControlService.applyNodeStyleOverride(overrides, this.currentScope);
  }

  onFillChange(color: string | { value: string }): void {
    const value = this.normalizeColor(color);
    if (value) {
      this.applyOverrides({ fill: value });
    }
  }

  onFillInputChange(value: string): void {
    const normalised = this.normalizeColor(value);
    if (normalised) {
      this.applyOverrides({ fill: normalised });
    }
  }

  resetFill(): void {
    this.applyOverrides({ fill: undefined });
  }

  onStrokeChange(color: string | { value: string }): void {
    const value = this.normalizeColor(color);
    if (value) {
      this.applyOverrides({ stroke: value });
    }
  }

  onStrokeInputChange(value: string): void {
    const normalised = this.normalizeColor(value);
    if (normalised) {
      this.applyOverrides({ stroke: normalised });
    }
  }

  resetStroke(): void {
    this.applyOverrides({ stroke: undefined });
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
  onPanelOpacityChange(value: number | string): void {
    const numeric = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(numeric)) {
      return;
    }
    const clamped = Math.min(1, Math.max(0, numeric));
    this.panelOpacity = clamped;
    this.themeService.setPropertiesPanelOpacity(clamped);
  }


  onScopeChange(scope: StyleApplicationScope): void {
    this.currentScope = scope;

    if (scope === 'type') {
      const overrides = this.extractSelectionOverrides();
      if (overrides) {
        this.canvasControlService.applyNodeStyleOverride(overrides, scope);
      }
    }
  }

  resetCanvas(): void {
    this.canvasControlService.resetCanvas();
  }

  async saveLayout(): Promise<void> {
    await this.canvasControlService.saveLayout();
  }

  toggleAutoLayout(): void {
    this.canvasControlService.toggleAutoLayout();
  }

  undo(): void {
    this.canvasControlService.undo();
  }

  redo(): void {
    this.canvasControlService.redo();
  }

  onPresetSelect(presetId: string): void {
    if (!presetId || presetId === this.activePresetId) {
      return;
    }
    this.canvasControlService.changePreset(presetId);
  }

  onPresetColorChange(key: string, color: string | { value: string }): void {
    if (!this.activePresetId) {
      return;
    }

    const normalised = this.normalizeColor(color);
    if (!normalised) {
      return;
    }

    if (this.paletteDraft[key] === normalised) {
      return;
    }

    this.paletteDraft = { ...this.paletteDraft, [key]: normalised };
    this.canvasControlService.updatePresetPalette({ [key]: normalised });
  }

  resetPresetOverrides(): void {
    this.canvasControlService.resetPresetOverrides();
  }

  hasPresetControls(): boolean {
    return this.presetOptions && this.presetOptions.length > 0;
  }

  onPresetColorInputChange(key: string, value: string): void {
    if (!this.activePresetId) {
      return;
    }
    const normalised = this.normalizeColor(value);
    if (!normalised || this.paletteDraft[key] === normalised) {
      return;
    }
    this.paletteDraft = { ...this.paletteDraft, [key]: normalised };
    this.canvasControlService.updatePresetPalette({ [key]: normalised });
  }

  private extractSelectionOverrides(): Partial<NodeStyleOverrides> | null {
    const overrides = this.nodeSelection?.overrides;
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


  getCurrentViewName(): string {
    const details = this.selectedViewNodeDetails;
    if (details) {
      const candidates = [details.name, details.label, details.title];
      const resolved = candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      if (resolved) {
        return resolved.trim();
      }
    }
    if (this.selectedLibraryItem === 'processes') {
      return 'Processes';
    }
    if (this.selectedLibraryItem === 'systems') {
      return 'Systems';
    }
    return 'Selected View';
  }

  collapseToLevel(value: string): void {
    if (!value) return;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      this.canvasControlService.collapseToLevel(numeric);
    }
  }

  changeLayoutEngine(engineId: string): void {
    if (engineId) {
      this.canvasControlService.changeLayoutEngine(engineId);
    }
  }

  changeGraphLens(lensId: string): void {
    if (lensId) {
      this.canvasControlService.changeGraphLens(lensId);
    }
  }

  isCanvasView(): boolean {
    const details = this.selectedViewNodeDetails;

    if (details) {
      const renderer: string | undefined =
        details.renderer ?? details.layoutEngine ?? details.layout_engine;
      if (typeof renderer === 'string' && renderer.trim().length > 0) {
        return true;
      }

      const viewType = (details.viewType ?? details.type ?? details.kind) as string | undefined;
      if (viewType) {
        const normalized = viewType.toLowerCase();
        if (['modular-canvas', 'processes', 'systems', 'canvas', 'graph'].some(token => normalized.includes(token))) {
          return true;
        }
      }
    }

    if (typeof this.selectedLibraryItem === 'string') {
      const normalized = this.selectedLibraryItem.toLowerCase();
      return normalized === 'processes' || normalized === 'systems';
    }

    return false;
  }

  formatDate(value: string): string {
    if (!value) {
      return 'Unknown';
    }
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return 'Unknown';
    }
  }
}
