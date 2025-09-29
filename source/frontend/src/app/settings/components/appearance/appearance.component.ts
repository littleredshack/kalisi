import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { ThemeService, ThemePreset } from '../../../core/services/theme.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-appearance',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ColorPickerModule,
    ButtonModule,
    CardModule,
    DividerModule,
    SelectModule,
    TooltipModule
  ],
  template: `
    <div class="appearance-settings">
      <div class="theme-section">
          <div class="preset-selector">
            <label>Theme Preset</label>
            <p-select
              [options]="themeService.presets"
              [(ngModel)]="selectedPreset"
              optionLabel="name"
              [style]="{'width':'100%'}"
              placeholder="Select a theme"
              (onChange)="onPresetChange($event)">
              <ng-template let-preset pTemplate="item">
                <div class="preset-option">
                  <span class="preset-colors-inline">
                    <span class="preset-bg" [style.background]="preset.background"></span>
                    <span class="preset-border" [style.background]="preset.border"></span>
                  </span>
                  <span>{{ preset.name }}</span>
                </div>
              </ng-template>
            </p-select>
          </div>

          <div class="color-group">
            <label>Background Color</label>
            <div class="color-picker-row">
              <p-colorPicker
                [(ngModel)]="backgroundColor"
                [inline]="false"
                [format]="'hex'"
                (onChange)="onBackgroundColorChange($event)"
                [appendTo]="'body'"
                class="color-swatch background-swatch"
                [style]="{'--swatch-border': borderColor}">
              </p-colorPicker>
              <input
                type="text"
                [(ngModel)]="backgroundColor"
                (ngModelChange)="onBackgroundColorChange($event)"
                placeholder="#0b0f14"
                maxlength="7"
                class="hex-input"
                pattern="^#[0-9A-Fa-f]{6}$">
            </div>
          </div>

          <div class="color-group">
            <label>Border Color</label>
            <div class="color-picker-row">
              <p-colorPicker
                [(ngModel)]="borderColor"
                [inline]="false"
                [format]="'hex'"
                (onChange)="onBorderColorChange($event)"
                [appendTo]="'body'"
                class="color-swatch border-swatch"
                [style]="{'--swatch-border': borderColor}">
              </p-colorPicker>
              <input
                type="text"
                [(ngModel)]="borderColor"
                (ngModelChange)="onBorderColorChange($event)"
                placeholder="#30363d"
                maxlength="7"
                class="hex-input"
                pattern="^#[0-9A-Fa-f]{6}$">
            </div>
          </div>
        </div>

        <p-divider></p-divider>

        <div class="actions">
          <button
            pButton
            type="button"
            label="Reset to Default"
            icon="pi pi-refresh"
            class="p-button-secondary"
            (click)="resetToDefault()">
          </button>
        </div>
    </div>
  `,
  styles: [`
    .appearance-settings {
      padding: 0.75rem;
      min-height: 100%;
    }

    .theme-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .preset-selector {
      margin-bottom: 0.5rem;
    }


    .color-group {
      margin-bottom: 0.5rem;
    }

    .color-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: var(--text-color);
    }

    .color-picker-row {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    .color-swatch {
      flex-shrink: 0;
    }

    .hex-input {
      flex: 1;
      padding: 0.5rem;
      background: var(--app-background-light);
      border: 1px solid var(--app-border);
      border-radius: 4px;
      color: var(--text-color);
      font-family: monospace;
      font-size: 0.9rem;
    }

    .hex-input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
    }



    .preset-option {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .preset-colors-inline {
      display: flex;
      gap: 2px;
    }

    .preset-bg,
    .preset-border {
      width: 16px;
      height: 16px;
      border-radius: 2px;
      border: 1px solid rgba(255,255,255,0.2);
    }

    .actions {
      margin-top: 1.5rem;
    }



    :deep(.p-colorpicker-panel) {
      background: var(--app-background);
      border: 1px solid var(--app-border);
    }

    /* Style the color picker swatch/button with dynamic borders */
    .color-swatch :deep(.p-colorpicker-preview) {
      border-radius: 4px !important;
      width: 40px !important;
      height: 40px !important;
      border: 2px solid var(--app-border) !important;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1) !important;
    }

    /* More specific selector for the input element */
    .color-swatch :deep(input.p-colorpicker-preview) {
      border: 2px solid #30363d !important;
      border-radius: 4px !important;
      width: 40px !important;
      height: 40px !important;
    }

    .color-swatch :deep(.p-colorpicker-input) {
      border-radius: 4px !important;
      width: 40px !important;
      height: 40px !important;
      border: 2px solid var(--app-border) !important;
    }

    /* Target the actual button element in PrimeNG ColorPicker */
    .color-swatch :deep(button) {
      border-radius: 4px !important;
      width: 40px !important;
      height: 40px !important;
      border: 2px solid var(--app-border) !important;
    }

    .color-swatch :deep(.p-button) {
      border-radius: 4px !important;
      width: 40px !important;
      height: 40px !important;
    }

    /* Background color swatch uses the current border color */
    .background-swatch :deep(.p-colorpicker-preview),
    .background-swatch :deep(.p-colorpicker-input),
    .background-swatch :deep(button),
    .background-swatch :deep(.p-button) {
      border: 2px solid var(--swatch-border, var(--app-border)) !important;
    }

    /* Border color swatch uses the current border color for dynamic updates */
    .border-swatch :deep(.p-colorpicker-preview),
    .border-swatch :deep(.p-colorpicker-input),
    .border-swatch :deep(button),
    .border-swatch :deep(.p-button) {
      border: 2px solid var(--swatch-border, var(--text-color)) !important;
    }

    @media (max-width: 768px) {
      .color-settings {
        flex-direction: column;
        gap: 1rem;
      }

      .preset-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class AppearanceComponent implements OnInit, OnDestroy {
  backgroundColor = '#0b0f14';
  borderColor = '#30363d';
  selectedPreset: ThemePreset | null = null;

  private destroy$ = new Subject<void>();

  constructor(public themeService: ThemeService) {}

  ngOnInit(): void {
    // Initialize with current theme colors
    const currentTheme = this.themeService.getCurrentTheme();
    this.backgroundColor = currentTheme.background;
    this.borderColor = currentTheme.border;

    // Signals are accessed directly with () not subscribe
    // They're already reactive in the template
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onBackgroundColorChange(event: any): void {
    const color = event.value || event;
    if (this.isValidHexColor(color)) {
      // Use non-immediate update for smooth real-time changes
      this.themeService.setBackgroundColor(color, false);
    }
  }

  onBorderColorChange(event: any): void {
    const color = event.value || event;
    if (this.isValidHexColor(color)) {
      // Use non-immediate update for smooth real-time changes
      this.themeService.setBorderColor(color, false);
    }
  }

  onPresetChange(event: any): void {
    if (event.value) {
      this.applyPreset(event.value);
    }
  }

  applyPreset(preset: ThemePreset): void {
    this.backgroundColor = preset.background;
    this.borderColor = preset.border;
    this.themeService.applyPreset(preset);
  }

  resetToDefault(): void {
    this.selectedPreset = null;
    this.themeService.resetToDefault();
    const currentTheme = this.themeService.getCurrentTheme();
    this.backgroundColor = currentTheme.background;
    this.borderColor = currentTheme.border;
  }

  private isValidHexColor(color: string): boolean {
    return /^#[0-9A-F]{6}$/i.test(color);
  }
}