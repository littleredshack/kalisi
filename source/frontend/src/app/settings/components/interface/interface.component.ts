import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { RadioButtonModule } from 'primeng/radiobutton';
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
    RadioButtonModule,
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
              [(ngModel)]="showIntroCard"
              [binary]="true"
              inputId="showIntro"
              (onChange)="onShowIntroChange()">
            </p-checkbox>
            <label for="showIntro" class="setting-label">Show introduction card on startup</label>
          </div>

          <div class="setting-item">
            <p-checkbox
              [(ngModel)]="autoOpenLibraryPanel"
              [binary]="true"
              inputId="autoLibrary"
              (onChange)="onAutoOpenLibraryChange()">
            </p-checkbox>
            <label for="autoLibrary" class="setting-label">Automatically open Library Panel on startup</label>
          </div>
        </div>

        <div class="settings-section">
          <h4>Panel Behavior</h4>
          <div class="setting-item">
            <p-checkbox
              [(ngModel)]="panelPushMode"
              [binary]="true"
              inputId="pushMode"
              (onChange)="onPanelPushModeChange()">
            </p-checkbox>
            <label for="pushMode" class="setting-label">Push canvas when opening left panels (vs overlay)</label>
          </div>

        </div>


        <div class="settings-section">
          <h4>Default View</h4>
          <div class="radio-group">
            <div class="setting-item">
              <p-radioButton
                [(ngModel)]="defaultView"
                value="graph"
                inputId="viewGraph"
                (onChange)="saveSettings()">
              </p-radioButton>
              <label for="viewGraph" class="setting-label">Graph View</label>
            </div>
            <div class="setting-item">
              <p-radioButton
                [(ngModel)]="defaultView"
                value="data"
                inputId="viewData"
                (onChange)="saveSettings()">
              </p-radioButton>
              <label for="viewData" class="setting-label">Data View</label>
            </div>
            <div class="setting-item">
              <p-radioButton
                [(ngModel)]="defaultView"
                value="description"
                inputId="viewDesc"
                (onChange)="saveSettings()">
              </p-radioButton>
              <label for="viewDesc" class="setting-label">Description View</label>
            </div>
            <div class="setting-item">
              <p-radioButton
                [(ngModel)]="defaultView"
                value="business"
                inputId="viewBusiness"
                (onChange)="saveSettings()">
              </p-radioButton>
              <label for="viewBusiness" class="setting-label">Business View</label>
            </div>
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

    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
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

    :deep(.p-radiobutton) {
      width: 20px;
      height: 20px;
    }

    :deep(.p-radiobutton .p-radiobutton-box) {
      width: 20px;
      height: 20px;
      background: var(--app-background-light);
      border: 1px solid var(--app-border);
    }

    :deep(.p-radiobutton .p-radiobutton-box.p-highlight) {
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
  // UI Settings - these will be synced with UiStateService
  showIntroCard = true;
  autoOpenLibraryPanel = true;
  panelPushMode = true;
  defaultView = 'graph';

  constructor(private uiState: UiStateService) {
    this.loadSettings();
  }

  loadSettings() {
    // Load startup settings from UiStateService
    this.showIntroCard = this.uiState.showIntro();
    this.autoOpenLibraryPanel = this.uiState.autoOpenLibraryPanel();
    this.panelPushMode = this.uiState.panelPushMode();

    // Load other settings from localStorage (fallback for non-startup settings)
    const stored = localStorage.getItem('interface_settings');
    if (stored) {
      try {
        const settings = JSON.parse(stored);
        // Only load non-UiStateService settings
        this.defaultView = settings.defaultView ?? 'graph';
      } catch (e) {
        console.warn('Failed to load interface settings:', e);
      }
    }
  }

  saveSettings() {
    // Save non-startup settings to localStorage
    const settings = {
      defaultView: this.defaultView
    };
    localStorage.setItem('interface_settings', JSON.stringify(settings));
  }

  onShowIntroChange() {
    this.uiState.setShowIntro(this.showIntroCard);
  }

  onAutoOpenLibraryChange() {
    this.uiState.setAutoOpenLibraryPanel(this.autoOpenLibraryPanel);
  }

  onPanelPushModeChange() {
    this.uiState.setPanelPushMode(this.panelPushMode);
  }

  resetToDefaults() {
    // Reset UiStateService settings
    this.showIntroCard = true;
    this.autoOpenLibraryPanel = true;
    this.panelPushMode = true;
    this.uiState.setShowIntro(this.showIntroCard);
    this.uiState.setAutoOpenLibraryPanel(this.autoOpenLibraryPanel);
    this.uiState.setPanelPushMode(this.panelPushMode);

    // Reset other settings
    this.defaultView = 'graph';
    this.saveSettings();
  }
}