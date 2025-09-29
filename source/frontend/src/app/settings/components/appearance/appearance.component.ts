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
            <div class="color-picker-container">
              <p-colorPicker
                [(ngModel)]="backgroundColor"
                [inline]="false"
                [format]="'hex'"
                (onChange)="onBackgroundColorChange($event)"
                [appendTo]="'body'"
                [style]="{'width': '100%'}"
                placeholder="#0b0f14">
              </p-colorPicker>
              <div class="color-preview" [style.background]="backgroundColor">
                <span>{{ backgroundColor }}</span>
              </div>
            </div>
          </div>

          <div class="color-group">
            <label>Border Color</label>
            <div class="color-picker-container">
              <p-colorPicker
                [(ngModel)]="borderColor"
                [inline]="false"
                [format]="'hex'"
                (onChange)="onBorderColorChange($event)"
                [appendTo]="'body'"
                [style]="{'width': '100%'}"
                placeholder="#30363d">
              </p-colorPicker>
              <div class="color-preview" [style.background]="borderColor">
                <span>{{ borderColor }}</span>
              </div>
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

    .color-picker-container {
      display: flex;
      gap: 1rem;
      align-items: stretch;
    }

    .color-picker-container :deep(.p-colorpicker) {
      flex: 1;
    }

    .color-picker-container :deep(.p-inputtext) {
      width: 100%;
      background: var(--app-background-light);
      border: 1px solid var(--app-border);
    }

    .color-preview {
      width: 100px;
      border-radius: 4px;
      border: 1px solid var(--app-border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: monospace;
      font-size: 0.8rem;
      text-shadow: 0 0 4px rgba(0,0,0,0.8);
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

    :deep(.p-colorpicker-preview) {
      border: 1px solid var(--app-border);
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