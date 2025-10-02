import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { UiStateService } from '../../../core/services/ui-state.service';

@Component({
  selector: 'app-interface',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CheckboxModule,
    ButtonModule,
    CardModule
  ],
  template: `
    <div class="interface-settings">
      <p-card>
        <div class="settings-section">
          <h4>Startup Options</h4>
          <div class="setting-item">
            <p-checkbox
              [ngModel]="showIntroCard()"
              [binary]="true"
              inputId="showIntro"
              (onChange)="onShowIntroChange($event)">
            </p-checkbox>
            <label for="showIntro" class="setting-label">Show introduction card on startup</label>
          </div>

          <div class="setting-item">
            <p-checkbox
              [ngModel]="autoOpenLibraryPanel()"
              [binary]="true"
              inputId="autoLibrary"
              (onChange)="onAutoOpenLibraryChange($event)">
            </p-checkbox>
            <label for="autoLibrary" class="setting-label">Automatically open Library Panel on startup</label>
          </div>
        </div>

        <div class="settings-section">
          <h4>Panel Behavior</h4>
          <div class="setting-item">
            <p-checkbox
              [ngModel]="panelPushMode()"
              [binary]="true"
              inputId="pushMode"
              (onChange)="onPanelPushModeChange($event)">
            </p-checkbox>
            <label for="pushMode" class="setting-label">Push canvas when opening left panels (vs overlay)</label>
          </div>

        </div>

        <div class="button-group">
          <button
            pButton
            type="button"
            label="Reset to Defaults"
            icon="pi pi-refresh"
            class="p-button-secondary"
            (click)="resetToDefaults()">
          </button>
        </div>
      </p-card>
    </div>
  `,
  styles: [`
    .interface-settings {
      padding: 1rem;
      padding-bottom: 3rem; /* Extra padding for scrolling */
      min-height: 100%;
    }

    .settings-section {
      margin-bottom: 2rem;
    }

    .settings-section h4 {
      margin-bottom: 1rem;
      color: var(--primary-color);
      font-weight: 600;
    }

    .setting-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .setting-label {
      cursor: pointer;
      color: var(--text-color);
      user-select: none;
    }

    .button-group {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--app-border);
    }

    :deep(.p-checkbox) {
      width: 20px;
      height: 20px;
    }

    :deep(.p-checkbox .p-checkbox-box) {
      width: 20px;
      height: 20px;
      background: var(--app-background-light);
      border: 1px solid var(--app-border);
    }

    :deep(.p-checkbox .p-checkbox-box.p-highlight) {
      background: var(--primary-color);
      border-color: var(--primary-color);
    }

    :deep(.p-card) {
      background: transparent;
      border: none;
      box-shadow: none;
    }

    :deep(.p-card h3) {
      margin-top: 0;
      margin-bottom: 1.5rem;
      color: var(--text-color);
    }
  `]
})
export class InterfaceComponent {
  // Computed signals that directly reference the service state
  // This ensures both interfaces are always in sync - no duplicate state
  showIntroCard = this.uiState.showIntro;
  autoOpenLibraryPanel = this.uiState.autoOpenLibraryPanel;
  panelPushMode = this.uiState.panelPushMode;

  constructor(private uiState: UiStateService) {}

  onShowIntroChange(event: any) {
    this.uiState.setShowIntro(event.checked);
  }

  onAutoOpenLibraryChange(event: any) {
    this.uiState.setAutoOpenLibraryPanel(event.checked);
  }

  onPanelPushModeChange(event: any) {
    this.uiState.setPanelPushMode(event.checked);
  }

  resetToDefaults() {
    // Reset UiStateService settings directly - no local state
    this.uiState.setShowIntro(true);
    this.uiState.setAutoOpenLibraryPanel(true);
    this.uiState.setPanelPushMode(true);
  }
}