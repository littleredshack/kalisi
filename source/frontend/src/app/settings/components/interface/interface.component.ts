import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

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
              (onChange)="saveSettings()">
            </p-checkbox>
            <label for="showIntro" class="setting-label">Show introduction card on startup</label>
          </div>

          <div class="setting-item">
            <p-checkbox
              [(ngModel)]="autoShowActivityBar"
              [binary]="true"
              inputId="autoActivity"
              (onChange)="saveSettings()">
            </p-checkbox>
            <label for="autoActivity" class="setting-label">Automatically show activity bar after intro</label>
          </div>
        </div>

        <div class="settings-section">
          <h4>Panel Behavior</h4>
          <div class="setting-item">
            <p-checkbox
              [(ngModel)]="panelPushMode"
              [binary]="true"
              inputId="pushMode"
              (onChange)="saveSettings()">
            </p-checkbox>
            <label for="pushMode" class="setting-label">Push canvas when opening left panels (vs overlay)</label>
          </div>

          <div class="setting-item">
            <p-checkbox
              [(ngModel)]="autoHideActivityBar"
              [binary]="true"
              inputId="autoHide"
              (onChange)="saveSettings()">
            </p-checkbox>
            <label for="autoHide" class="setting-label">Auto-hide activity bar when not in use</label>
          </div>

          <div class="setting-item">
            <p-checkbox
              [(ngModel)]="rememberPanelStates"
              [binary]="true"
              inputId="rememberPanels"
              (onChange)="saveSettings()">
            </p-checkbox>
            <label for="rememberPanels" class="setting-label">Remember panel open/closed states</label>
          </div>
        </div>

        <div class="settings-section">
          <h4>Animation Settings</h4>
          <div class="setting-item">
            <p-checkbox
              [(ngModel)]="enableBackgroundAnimation"
              [binary]="true"
              inputId="bgAnimation"
              (onChange)="saveSettings()">
            </p-checkbox>
            <label for="bgAnimation" class="setting-label">Enable background canvas animation</label>
          </div>

          <div class="setting-item">
            <p-checkbox
              [(ngModel)]="enablePanelAnimations"
              [binary]="true"
              inputId="panelAnimation"
              (onChange)="saveSettings()">
            </p-checkbox>
            <label for="panelAnimation" class="setting-label">Enable panel transition animations</label>
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
  // UI Settings with defaults
  showIntroCard = true;
  autoShowActivityBar = true;
  panelPushMode = true;
  autoHideActivityBar = false;
  rememberPanelStates = true;
  enableBackgroundAnimation = true;
  enablePanelAnimations = true;
  defaultView = 'graph';

  constructor() {
    this.loadSettings();
  }

  loadSettings() {
    const stored = localStorage.getItem('interface_settings');
    if (stored) {
      try {
        const settings = JSON.parse(stored);
        Object.assign(this, settings);
      } catch (e) {
        console.warn('Failed to load interface settings:', e);
      }
    }
  }

  saveSettings() {
    const settings = {
      showIntroCard: this.showIntroCard,
      autoShowActivityBar: this.autoShowActivityBar,
      panelPushMode: this.panelPushMode,
      autoHideActivityBar: this.autoHideActivityBar,
      rememberPanelStates: this.rememberPanelStates,
      enableBackgroundAnimation: this.enableBackgroundAnimation,
      enablePanelAnimations: this.enablePanelAnimations,
      defaultView: this.defaultView
    };
    localStorage.setItem('interface_settings', JSON.stringify(settings));
  }

  resetToDefaults() {
    this.showIntroCard = true;
    this.autoShowActivityBar = true;
    this.panelPushMode = true;
    this.autoHideActivityBar = false;
    this.rememberPanelStates = true;
    this.enableBackgroundAnimation = true;
    this.enablePanelAnimations = true;
    this.defaultView = 'graph';
    this.saveSettings();
  }
}