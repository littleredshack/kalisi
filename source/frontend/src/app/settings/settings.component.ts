import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Accordion, AccordionPanel, AccordionHeader, AccordionContent } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { ProfileComponent } from './components/profile/profile-stub.component';
import { SecurityComponent } from './components/security/security-stub.component';
import { AccountComponent } from './components/account/account-stub.component';
import { AppearanceComponent } from './components/appearance/appearance.component';
import { InterfaceComponent } from './components/interface/interface.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    Accordion,
    AccordionPanel,
    AccordionHeader,
    AccordionContent,
    ButtonModule,
    ProfileComponent,
    SecurityComponent,
    AccountComponent,
    AppearanceComponent,
    InterfaceComponent
  ],
  template: `
    <div class="settings-container" (wheel)="onWheel($event)" (touchmove)="onTouchMove($event)">
      <div class="settings-header">
        <h2><i class="pi pi-cog"></i> Settings</h2>
        <button
          pButton
          type="button"
          icon="pi pi-times"
          class="p-button-text p-button-rounded"
          (click)="navigateToHome.emit()">
        </button>
      </div>

      <div class="settings-content">
        <p-accordion [value]="activeIndexes" [multiple]="true">
          <p-accordion-panel value="0">
            <p-accordion-header>
              <span class="accordion-header">
                <i class="pi pi-palette"></i>
                <span>Appearance</span>
              </span>
            </p-accordion-header>
            <p-accordion-content>
              <app-appearance></app-appearance>
            </p-accordion-content>
          </p-accordion-panel>

          <p-accordion-panel value="1">
            <p-accordion-header>
              <span class="accordion-header">
                <i class="pi pi-desktop"></i>
                <span>Interface</span>
              </span>
            </p-accordion-header>
            <p-accordion-content>
              <app-interface></app-interface>
            </p-accordion-content>
          </p-accordion-panel>

          <p-accordion-panel value="2">
            <p-accordion-header>
              <span class="accordion-header">
                <i class="pi pi-user"></i>
                <span>Profile</span>
              </span>
            </p-accordion-header>
            <p-accordion-content>
              <app-profile></app-profile>
            </p-accordion-content>
          </p-accordion-panel>

          <p-accordion-panel value="3">
            <p-accordion-header>
              <span class="accordion-header">
                <i class="pi pi-lock"></i>
                <span>Security</span>
              </span>
            </p-accordion-header>
            <p-accordion-content>
              <app-security></app-security>
            </p-accordion-content>
          </p-accordion-panel>

          <p-accordion-panel value="4">
            <p-accordion-header>
              <span class="accordion-header">
                <i class="pi pi-id-card"></i>
                <span>Account</span>
              </span>
            </p-accordion-header>
            <p-accordion-content>
              <app-account (accountDeleted)="onAccountDeleted()"></app-account>
            </p-accordion-content>
          </p-accordion-panel>
        </p-accordion>
      </div>
    </div>
  `,
  styles: [`
    .settings-container {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--app-background);
      color: var(--text-color);
      position: relative;
      z-index: 1000;
      isolation: isolate;
    }

    .settings-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--app-border);
    }

    .settings-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .settings-content {
      flex: 1;
      min-height: 0;
      overflow-y: scroll;
      overflow-x: hidden;
      padding: 0.5rem;
    }

    /* Force scrollbar to always be visible */
    .settings-content::-webkit-scrollbar {
      width: 12px;
      -webkit-appearance: none;
    }

    .settings-content::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.4);
      border-radius: 6px;
      border: 1px solid rgba(110, 168, 254, 0.2);
      -webkit-appearance: none;
    }

    .settings-content::-webkit-scrollbar-thumb {
      background: rgba(110, 168, 254, 0.8);
      border-radius: 6px;
      border: 1px solid rgba(110, 168, 254, 1);
      min-height: 20px;
      -webkit-appearance: none;
    }

    .settings-content::-webkit-scrollbar-thumb:hover {
      background: rgba(110, 168, 254, 1);
      border-color: #6ea8fe;
    }

    .settings-content::-webkit-scrollbar-corner {
      background: transparent;
    }

    .accordion-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-weight: 500;
    }

    .accordion-header i {
      font-size: 1.1rem;
      color: #6ea8fe;
    }

    /* Accordion styling */
    :deep(.p-accordion) {
      background: transparent;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    :deep(.p-accordion .p-accordion-header) {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--app-border);
      border-radius: 6px;
      margin-bottom: 0.5rem;
    }

    :deep(.p-accordion .p-accordion-header:not(.p-disabled).p-highlight) {
      background: rgba(110, 168, 254, 0.1);
      border-color: rgba(110, 168, 254, 0.4);
    }

    :deep(.p-accordion .p-accordion-header-link) {
      padding: 1rem;
      background: transparent;
      border: none;
      color: var(--text-color);
      transition: all 0.2s ease;
    }

    :deep(.p-accordion .p-accordion-header:not(.p-disabled).p-highlight .p-accordion-header-link) {
      background: transparent;
      color: var(--text-color);
    }

    :deep(.p-accordion .p-accordion-header-link:focus) {
      box-shadow: none;
    }

    :deep(.p-accordion .p-accordion-content) {
      background: rgba(0, 0, 0, 0.1);
      border: 1px solid var(--app-border);
      border-top: none;
      border-radius: 0 0 6px 6px;
      margin-top: -0.5rem;
      margin-bottom: 0.5rem;
      padding: 0;
    }

    :deep(.p-accordion .p-accordion-header .p-accordion-header-link .p-accordion-toggle-icon) {
      color: #6ea8fe;
    }
  `]
})
export class SettingsComponent implements OnInit {
  @Input() activeTab: string = '';
  @Output() navigateToHome = new EventEmitter<void>();
  @Output() navigateToSettings = new EventEmitter<'profile' | 'security' | 'account' | 'appearance' | 'interface'>();
  @Output() logout = new EventEmitter<void>();
  @Output() accountDeleted = new EventEmitter<void>();

  // Array of active accordion indexes (multiple can be open)
  activeIndexes: string[] = []; // Start with all accordion sections closed

  constructor() {
    // Initialize active indexes based on activeTab
    this.updateActiveIndexes();
  }

  ngOnInit(): void {
    this.updateActiveIndexes();
  }

  private updateActiveIndexes(): void {
    // Keep all accordions closed on startup
    // Users can manually expand sections they need
    this.activeIndexes = [];
  }

  onBackToHome(): void {
    this.navigateToHome.emit();
  }

  onAccountDeleted(): void {
    this.accountDeleted.emit();
  }

  onWheel(event: WheelEvent): void {
    // Stop propagation to prevent canvas from scrolling
    event.stopPropagation();
  }

  onTouchMove(event: TouchEvent): void {
    // Stop propagation for touch devices
    event.stopPropagation();
  }
}