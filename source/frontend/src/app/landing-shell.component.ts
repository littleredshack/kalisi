import { Component, OnInit, OnDestroy, ViewChild, ViewChildren, QueryList, computed, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { RadioButtonModule } from 'primeng/radiobutton';
import { GraphViewComponent } from './components/graph-view/graph-view.component';
import { UiStateService } from './core/services/ui-state.service';
import { TreeStateService } from './core/services/tree-state.service';
import { ItemsStoreService } from './core/services/items-store.service';
import { ViewRegistryService } from './core/services/view-registry.service';
import { ViewSpecificStateService } from './core/services/view-specific-state.service';
import { ViewNodeStateService, LibraryItem as ViewLibraryItem } from './core/services/view-node-state.service';
import { ThemeService } from './core/services/theme.service';
import { ActivityBarComponent } from './components/activity-bar/activity-bar.component';
import { RuntimeCanvasComponent } from './components/modular-canvas/runtime-canvas.component';
import { ChatRhsPanelComponent } from './components/chat-rhs-panel/chat-rhs-panel.component';
import { PropertiesRhsPanelComponent } from './components/properties-rhs-panel/properties-rhs-panel.component';
import { NodeStylePanelComponent } from './components/node-style-panel/node-style-panel.component';
import { LayoutPanelComponent } from './components/layout-panel/layout-panel.component';
import { DebugPanelComponent } from './components/debug-panel/debug-panel.component';
import { ViewType } from './core/models/view.models';
import { SettingsComponent } from './settings/settings.component';
import { TreeTableComponent } from './shared/tree-table/tree-table.component';
import { ViewPresetRegistry, ViewPresetDescriptor } from './shared/graph/view-presets';
import { ResolvedViewPreset } from './shared/canvas/presets/preset-manager';

// Library Item Configuration
interface LibraryItem {
  id: string;
  label: string;
  viewType?: ViewType | string;
  summary: string;
  detail: string;
  nested?: boolean;
}

const LIBRARY_ITEMS: LibraryItem[] = [
  {
    id: 'products',
    label: 'Products',
    summary: 'Products View',
    detail: 'Browsing product catalog'
  },
  {
    id: 'test-modular',
    label: 'Test (Modular)',
    viewType: 'modular-canvas',
    summary: 'Modular Canvas',
    detail: 'Testing modular architecture with pluggable renderers'
  }
];

@Component({
  selector: 'app-landing-shell',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ToastModule,
    TooltipModule,
    RadioButtonModule,
    GraphViewComponent,
    ActivityBarComponent,
    RuntimeCanvasComponent,
    ChatRhsPanelComponent,
    PropertiesRhsPanelComponent,
    NodeStylePanelComponent,
    LayoutPanelComponent,
    DebugPanelComponent,
    SettingsComponent,
    TreeTableComponent
  ],
  providers: [MessageService],
  template: `
    <p-toast></p-toast>
    
    <div class="frame" [class.activity-bar-open]="activityBarVisible && !activityBarHidden">
      <!-- animated background canvas -->
      <canvas #bgCanvas class="bg-canvas" (mousemove)="onCanvasMove($event)"></canvas>

      <!-- Activity Bar hover trigger -->
      <div class="activity-trigger"
           *ngIf="activityBarVisible && activityBarHidden"
           (mouseenter)="onHoverTrigger()"
           (mouseleave)="onTriggerLeave()"></div>

      <!-- Activity Bar Component -->
      <app-activity-bar
        [class.visible]="activityBarVisible && !activityBarHidden"
        [isOpen]="!activityBarHidden"
        [libraryPanelOpen]="libraryPanelOpen"
        [settingsPanelOpen]="settingsPanelOpen"
        [propertiesPanelOpen]="propertiesPanelOpen"
        [chatPanelOpen]="chatPanelOpen"
        [debugPanelOpen]="debugPanelOpen"
        [nodeStylePanelOpen]="nodeStylePanelOpen"
        [layoutPanelOpen]="layoutPanelOpen"
        (itemClicked)="onActivityBarItemClick($event)"
        (toggleRequested)="toggleActivityBar()">
      </app-activity-bar>

      <!-- Library Panel -->
      <div class="library-panel" [class.visible]="panelsEnabled && !activityBarHidden && libraryPanelOpen" [class.open]="libraryPanelOpen">
        <div class="panel-header">
          <h3>Models</h3>
          <input type="text" placeholder="Search..." class="search-input" />
        </div>
        <div class="tree-container">
          <div *ngFor="let item of libraryItems" 
               class="tree-item" 
               [class.nested]="item.nested"
               [class.selected]="selectedLibraryItem === item.id"
               [class.expandable]="isExpandableSetNode(item)"
               [class.expanded]="isSetNodeExpanded(item.id)"
               [class.hidden]="isChildOfCollapsedSet(item)">
            
            <!-- Expand/collapse indicator for SetNodes -->
            <i *ngIf="isExpandableSetNode(item)" 
               class="tree-toggle pi"
               [class.pi-chevron-right]="!isSetNodeExpanded(item.id)"
               [class.pi-chevron-down]="isSetNodeExpanded(item.id)"
               (click)="toggleSetNodeExpansion(item.id, $event)"></i>
            
            <!-- Item label -->
            <span class="tree-label" (click)="onLibraryItemSelect(item.id)">
              {{ item.label }}
            </span>
          </div>
        </div>
      </div>

      <!-- Settings Panel -->
      <div class="settings-panel" [class.visible]="panelsEnabled && !activityBarHidden && settingsPanelOpen" [class.open]="settingsPanelOpen">
        <app-settings
          [activeTab]="'appearance'"
          (navigateToHome)="goHome()"
          (logout)="onLogout()">
        </app-settings>
      </div>

      <!-- Chat Panel (Right Side) -->
      <app-chat-rhs-panel 
        [isOpen]="chatPanelOpen"
        (panelToggled)="onChatPanelToggled($event)">
      </app-chat-rhs-panel>

      <!-- Properties Panel (Right Side) -->
      <app-properties-rhs-panel
        [isOpen]="propertiesPanelOpen"
        [selectedLibraryItem]="selectedLibraryItem"
        [selectedViewNodeDetails]="selectedViewNodeDetails"
        (panelToggled)="onPropertiesPanelToggled($event)">
      </app-properties-rhs-panel>

      <!-- Node Style Panel (Floating) -->
      <app-node-style-panel
        [isOpen]="nodeStylePanelOpen"
        (panelToggled)="onNodeStylePanelToggled($event)">
      </app-node-style-panel>

      <!-- Layout Panel (Floating) -->
      <app-layout-panel
        [isOpen]="layoutPanelOpen"
        (panelToggled)="onLayoutPanelToggled($event)">
      </app-layout-panel>

      <!-- Main Workspace Area -->
      <div class="main-workspace"
           [style.left.px]="workspacePushOffset"
           [class.visible]="panelsEnabled && selectedEntityId">
        <div class="workspace-content">
          <div *ngIf="selectedView === 'graph'" class="view-container">
            <app-graph-view [nodes]="graphNodes" [edges]="graphEdges"></app-graph-view>
          </div>
          <div *ngIf="selectedView === 'description'" class="view-container">
            <div class="description-view">
              <h3>{{ selectedEntityLabel }}</h3>
              <p>Description view for {{ selectedEntityLabel }}</p>
            </div>
          </div>
          <div *ngIf="selectedView === 'data'" class="view-container">
            <div class="data-view">
              <h3>{{ selectedEntityLabel }} - Data</h3>
              <pre>{{ selectedEntityData | json }}</pre>
            </div>
          </div>
          <div *ngIf="selectedView === 'business'" class="view-container">
            <div class="business-view">
              <h3>{{ selectedEntityLabel }} - Business</h3>
              <p>Business view for {{ selectedEntityLabel }}</p>
            </div>
          </div>
          <div *ngIf="selectedView === 'modular-canvas'" class="view-container">
            <div class="preset-toolbar" *ngIf="presets.length > 0 && !useRuntimeCanvas">
              <label class="preset-label" for="presetSelect">View preset</label>
              <select id="presetSelect" [ngModel]="activePresetId" (ngModelChange)="onPresetChange($event)">
                <option *ngFor="let preset of presets" [value]="preset.id">{{ preset.label }}</option>
              </select>
            </div>
            <app-runtime-canvas
              #runtimeCanvas
              (engineDataChanged)="updateDebugPanelData()"></app-runtime-canvas>
          </div>
        </div>
      </div>

      <!-- mission glass card -->
      <div class="glass mission"
           [class.hidden]="!missionCardVisible"
           [class.fading]="missionCardFading"
           [class.fading-in]="missionCardFadingIn"
           [style.left.vw]="panelPosition.x"
           [style.top.vh]="panelPosition.y"
           (mousedown)="startDrag($event)">
        <div class="brand drag-handle" style="cursor: move;">
          <img src="assets/kalisi_logo_header_blue.png" alt="Kalisi Logo" class="brand-logo">
          <span class="brand-title">Kalisi</span>
          <i class="pi pi-arrows-alt drag-icon"></i>
        </div>

        <div class="mission-content">
          <p class="mission-tagline">{{ missionContent.tagline }}</p>

          <ng-container *ngFor="let section of missionContent.sections">
            <h3>{{ section.heading }}</h3>
            <p *ngFor="let paragraph of section.paragraphs">{{ paragraph }}</p>
          </ng-container>
        </div>

        <div class="dont-show-again">
          <p-checkbox [ngModel]="dontShowAgain()" [binary]="true" inputId="dontShowAgain" (onChange)="onDontShowAgainChange($event)"></p-checkbox>
          <label for="dontShowAgain">Do not show again</label>
        </div>

        <div class="cta-row">
          <p-button label="Explore" icon="pi pi-play" severity="contrast" styleClass="explore-btn" (click)="enterExploreMode()"></p-button>
        </div>
      </div>

      <!-- Login dialog -->
      <p-dialog header="Welcome Back" [(visible)]="loginVisible" [modal]="true" [dismissableMask]="true"
                [style]="{width:'420px'}" [breakpoints]="{'960px': '95vw'}">
        <form class="login-form" (ngSubmit)="signIn()">
          <div class="field">
            <label for="email">Email</label>
            <input pInputText id="email" [(ngModel)]="email" name="email" placeholder="Email" class="w-full" required/>
          </div>
          
          <div class="field">
            <label for="password">Password</label>
            <p-password [(ngModel)]="password" name="password" placeholder="Password" [toggleMask]="true" [feedback]="false" class="w-full"></p-password>
          </div>
          
          <div class="field-checkbox">
            <p-checkbox [(ngModel)]="remember" name="remember" inputId="remember"></p-checkbox>
            <label for="remember">Remember me</label>
          </div>
          
          <p-button type="submit" label="Enter" icon="pi pi-sign-in" class="w-full"></p-button>
        </form>
      </p-dialog>

      <!-- Debug Panel -->
      <app-debug-panel
        [isOpen]="debugPanelOpen"
        [jsonData]="currentViewJsonData"
        (panelClosed)="onDebugPanelClosed()">
      </app-debug-panel>

      <aside class="tree-table-preview" *ngIf="debugPanelOpen">
        <app-tree-table></app-tree-table>
      </aside>
    </div>
  `,
  styles: [`
    .frame {
      position: relative;
      height: 100dvh;
      width: 100%;
      overflow: hidden;
      background: #0b0f14; /* Fixed canvas background - not affected by theme */
    }
    
    .bg-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      filter: saturate(1.15) brightness(1.0);
    }
    
    .glass {
      position: absolute;
      width: clamp(421px, 48.95vw, 785px);
      background: var(--app-background);
      border: 1px solid rgba(110,168,254,.2);
      box-shadow: 0 10px 40px rgba(0,0,0,.5);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 26px 20px 22px;
      color: #e6edf3;
      user-select: none;
    }
    
    .drag-handle {
      cursor: move;
      position: relative;
    }
    
    .drag-icon {
      margin-left: auto;
      opacity: 0.5;
      font-size: 0.9rem;
    }
    
    .brand {
      display: flex;
      align-items: center;
      gap: .6rem;
      font-family: var(--font-heading);
      font-weight: 600;
      letter-spacing: 0.05em;
      margin-bottom: .8rem;
      font-size: 1.2rem;
    }

    .brand-title {
      color: var(--accent-blue);
      font-size: 1.71rem;
      font-family: var(--font-heading);
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .brand .pi {
      color: var(--accent-blue);
      font-size: 1.33rem;
    }

    .brand-logo {
      height: 1.463rem;
      width: auto;
    }

    .mission-content {
      font-family: var(--font-body);
    }

    .mission-title {
      color: var(--accent-blue);
      margin: 0 0 0.5rem 0;
      font-size: 1.71rem;
      font-family: var(--font-heading);
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .mission-tagline {
      margin: 0 0 1.5rem 0;
      opacity: 0.95;
      line-height: 1.6;
      font-family: var(--font-body);
      font-weight: 400;
      font-size: 0.9975rem;
      font-style: italic;
    }

    .mission-content h3 {
      color: var(--accent-blue);
      margin: 1.2rem 0 0.6rem 0;
      font-size: 1.045rem;
      font-family: var(--font-heading);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .mission-content p {
      margin: 0.8rem 0;
      opacity: 0.92;
      line-height: 1.5;
      font-family: var(--font-body);
      font-weight: 400;
      font-size: 0.9025rem;
    }
    
    .dont-show-again {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      opacity: 0.85;
    }

    .dont-show-again label {
      cursor: pointer;
      font-size: 0.875rem;
      user-select: none;
      font-family: var(--font-body);
    }

    .cta-row {
      display: flex;
      gap: .6rem;
      margin-top: 1rem;
    }
    
    .hint {
      opacity: .7;
      display: block;
      margin-top: 1.2rem;
    }
    
    ::ng-deep .explore-btn {
      background: rgba(110, 168, 254, 0.15) !important;
      border: 1px solid rgba(110, 168, 254, 0.4) !important;
      color: #e6edf3 !important;
    }
    
    ::ng-deep .explore-btn:hover {
      background: rgba(110, 168, 254, 0.25) !important;
      border-color: rgba(110, 168, 254, 0.6) !important;
    }
    
    .tree-table-preview {
      position: absolute;
      right: 1.5rem;
      bottom: 1.5rem;
      width: min(420px, 45vw);
      max-height: 40vh;
      overflow: auto;
      padding: 1rem;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(110, 168, 254, 0.3);
      border-radius: 12px;
      color: #e6edf3;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
      font-size: 0.85rem;
      backdrop-filter: blur(12px);
    }

    .tree-table__preview {
      max-height: 26vh;
      overflow: auto;
      padding: 0.75rem;
      background: rgba(9, 14, 22, 0.85);
      border-radius: 8px;
      border: 1px solid rgba(110, 168, 254, 0.2);
      color: #cbd5f5;
    }

    .tree-table__error {
      color: #f87171;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: .8rem;
    }
    
    .field {
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    
    .field-checkbox {
      display: flex;
      align-items: center;
      gap: .5rem;
    }
    
    label {
      font-weight: 500;
    }
    
    /* Activity Bar Trigger */
    .activity-trigger {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 5px;
      z-index: 99;
    }
    
    /* Activity Bar Component will handle its own styling */
    app-activity-bar {
      opacity: 0;
      transform: translateX(-100%);
      transition: opacity 600ms ease, transform 600ms cubic-bezier(0.23, 1, 0.32, 1);
      pointer-events: none;
    }

    app-activity-bar.visible {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }

    /* Library Panel */
    .library-panel {
      position: fixed;
      left: 60px;
      top: 0;
      bottom: 0;
      width: 340px;
      background: var(--app-background);
      border-right: 1px solid rgba(110, 168, 254, 0.2);
      backdrop-filter: blur(10px);
      transform: translateX(-100%);
      transition: transform 600ms ease, left 400ms cubic-bezier(0.23, 1, 0.32, 1), opacity 600ms ease;
      z-index: 90;
      opacity: 0;
      pointer-events: none;
    }

    .library-panel.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .frame.activity-bar-open .library-panel {
      left: 60px;
    }

    .library-panel.open {
      transform: translateX(0);
    }
    
    .settings-panel {
      position: fixed;
      left: 60px;
      top: 0;
      bottom: 0;
      height: 100vh;
      width: 340px;
      background: var(--app-background);
      border-right: 1px solid rgba(110, 168, 254, 0.2);
      backdrop-filter: blur(10px);
      transform: translateX(-100%);
      transition: transform 600ms ease, left 400ms cubic-bezier(0.23, 1, 0.32, 1), opacity 600ms ease;
      z-index: 999;
      opacity: 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      isolation: isolate;
    }

    .settings-panel.visible {
      opacity: 1;
      pointer-events: auto;
    }

    .frame.activity-bar-open .settings-panel {
      left: 60px;
    }

    .settings-panel.open {
      transform: translateX(0);
    }

    .settings-panel app-settings {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
    
    
    .view-switcher-section h4 {
      margin: 0 0 12px 0;
      font-family: var(--font-heading);
      color: #6ea8fe;
      font-size: 1rem;
      font-weight: 600;
    }
    
    
    .panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(110, 168, 254, 0.2);
    }
    
    .panel-header h3 {
      margin: 0 0 12px 0;
      font-family: var(--font-heading);
      color: #6ea8fe;
      font-size: 1.1rem;
    }
    
    .search-input {
      width: 100%;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 8px 12px;
      color: #e6edf3;
      font-size: 14px;
    }
    
    .search-input:focus {
      outline: none;
      border-color: #6ea8fe;
      box-shadow: 0 0 0 2px rgba(110, 168, 254, 0.25);
    }
    
    .tree-container {
      padding: 16px 20px;
    }
    
    .tree-item {
      padding: 8px 0;
      color: #e6edf3;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .tree-item:hover {
      color: #6ea8fe;
    }
    
    .tree-item.nested {
      margin-left: 20px;
    }
    
    .tree-item.selected .tree-label {
      color: #6ea8fe;
      background: rgba(110, 168, 254, 0.15);
    }
    
    .tree-item.hidden {
      display: none;
    }
    
    .tree-toggle {
      color: #a0a9b8;
      cursor: pointer;
      font-size: 12px;
      width: 16px;
      text-align: center;
    }
    
    .tree-toggle:hover {
      color: #6ea8fe;
    }
    
    .tree-label {
      cursor: pointer;
      flex: 1;
      padding: 2px 6px;
      margin: -2px -6px;
      border-radius: 6px;
      transition: background 0.2s ease;
    }
    
    /* Make library panel a flex container */
    .library-panel {
      display: flex;
      flex-direction: column;
    }
    
    .tree-container {
      flex: 1; /* Take up remaining space */
    }
    
    
    .settings-content {
      padding: 16px 20px;
    }
    
    .setting-item {
      margin-bottom: 16px;
    }
    
    .setting-item label {
      display: block;
      margin-bottom: 8px;
      color: #e6edf3;
      font-weight: 500;
    }
    
    .setting-select {
      width: 100%;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 8px 12px;
      color: #e6edf3;
    }
    
    /* Panel Settings Section */
    .panel-settings-section {
      border-top: 1px solid rgba(110, 168, 254, 0.2);
      padding-top: 16px;
      margin-top: 16px;
    }
    
    .panel-settings-section h4 {
      margin: 0 0 12px 0;
      font-family: var(--font-heading);
      color: #6ea8fe;
      font-size: 1rem;
      font-weight: 600;
    }
    
    .panel-mode-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
    }
    
    .mode-label {
      font-size: 12px;
      color: #7d8590;
      font-weight: 500;
    }
    
    /* Custom Toggle Switch */
    .toggle-switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
      cursor: pointer;
    }
    
    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 12px;
      transition: all 0.2s ease;
    }
    
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background: #7d8590;
      border-radius: 50%;
      transition: all 0.2s ease;
    }
    
    .toggle-switch input:checked + .toggle-slider {
      background: rgba(110, 168, 254, 0.15);
      border-color: rgba(110, 168, 254, 0.4);
    }
    
    .toggle-switch input:checked + .toggle-slider:before {
      transform: translateX(20px);
      background: #6ea8fe;
    }
    
    .toggle-switch:hover .toggle-slider {
      border-color: rgba(110, 168, 254, 0.6);
    }
    
    /* Mission card transitions */
    .glass.hidden {
      opacity: 0;
      transform: translateY(-20px);
      pointer-events: none;
    }
    
    .glass.fading {
      opacity: 0;
      transform: translateY(-20px);
      pointer-events: none;
    }
    
    .glass.fading-in {
      opacity: 0;
      transform: translateY(20px);
    }
    
    .glass {
      transition: opacity 3s ease, transform 3s ease;
    }
    
    /* Main Workspace */
    .main-workspace {
      position: fixed;
      left: 0; /* Will be overridden by dynamic [style.left.px] */
      top: 0;
      bottom: 0;
      right: 0;
      background: transparent; /* Let background canvas show through */
      z-index: 50;
      transition: left 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 600ms ease;
      opacity: 0;
      pointer-events: none;
    }

    .main-workspace.visible {
      opacity: 1;
      pointer-events: auto;
    }
    
    .workspace-content {
      width: 100%;
      height: 100%;
      padding: 0; /* Remove padding to eliminate 8px gap */
      /* No margin - full viewport overlay */
    }

    .preset-toolbar {
      position: absolute;
      top: 20px;
      left: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(15, 23, 42, 0.72);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 12px;
      padding: 12px 16px;
      backdrop-filter: blur(12px);
      z-index: 5;
    }

    .preset-toolbar select {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 8px;
      color: #e6edf3;
      padding: 6px 12px;
      font-size: 13px;
    }

    .preset-toolbar select:focus {
      outline: none;
      border-color: rgba(110, 168, 254, 0.6);
      box-shadow: 0 0 0 2px rgba(110, 168, 254, 0.25);
    }

    .preset-label {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #94a3b8;
      font-weight: 600;
    }
    
    .view-container {
      width: 100%;
      height: 100%;
      overflow: hidden;
      position: relative; /* Ensure child absolute positioning works */
    }
    
    .description-view,
    .data-view,
    .business-view {
      padding: 20px;
      color: #e6edf3;
      background: rgba(11, 15, 20, 0.9);
      border-radius: 8px;
      margin: 20px;
    }
    
    .description-view h3,
    .data-view h3,
    .business-view h3 {
      color: #6ea8fe;
      font-family: var(--font-heading);
      margin-bottom: 16px;
    }
    
    .data-view pre {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 16px;
      color: #e6edf3;
      overflow: auto;
    }
    
    
  `]
})
export class LandingShellComponent implements OnInit, OnDestroy {
  // Configuration - populated from service
  libraryItems: LibraryItem[] = [];
  staticLibraryItems = LIBRARY_ITEMS; // Keep static items as fallback

  loginVisible = false;
  email = '';
  password = '';
  remember = true;

  // Mission card content loaded from markdown
  missionContent = {
    title: '',
    tagline: '',
    sections: [] as { heading: string; paragraphs: string[] }[]
  };
  private rafId = 0;
  private ctx!: CanvasRenderingContext2D;
  private canvas!: HTMLCanvasElement;
  private nodes: Array<{x: number, y: number, vx: number, vy: number}> = [];
  
  // Unified mode state - visibility controls
  missionCardVisible = true;
  activityBarVisible = false;
  panelsEnabled = false;
  missionCardFading = false;
  missionCardFadingIn = true;
  // UI state computed from service
  get libraryPanelOpen() { return this.uiState.libraryPanelOpen(); }
  get settingsPanelOpen() { return this.uiState.settingsPanelOpen(); }
  get propertiesPanelOpen() { return this.uiState.propertiesPanelOpen(); }
  get nodeStylePanelOpen() { return this.uiState.nodeStylePanelOpen(); }
  get layoutPanelOpen() { return this.uiState.layoutPanelOpen(); }
  get chatPanelOpen() { return this.uiState.chatPanelOpen(); }
  get debugPanelOpen() { return this.uiState.debugPanelOpen(); }

  // Computed: "Don't show again" is the inverse of "Show intro"
  dontShowAgain = computed(() => !this.uiState.showIntro());
  currentViewJsonData = '';
  activityBarHover = false;
  activityBarHidden = false;
  selectedView = 'data';
  currentViewColor = 'rgba(110, 168, 254, 0.6)';

  // Deprecated - keeping for backward compatibility
  exploreMode = false;
  
  // Graph workspace state
  selectedEntityId: string | null = null;
  selectedEntityLabel: string | null = null;
  selectedEntityData: any = null;
  graphNodes: any[] = [];
  graphEdges: any[] = [];
  
  // Canvas data for processes/systems
  canvasNodes: any[] = [];
  canvasEdges: any[] = [];
  presets: ReadonlyArray<ViewPresetDescriptor> = ViewPresetRegistry.list();
  activePresetId: string = this.presets[0]?.id ?? 'containment-insight';
  // ModularCanvasComponent removed - only RuntimeCanvasComponent used
  
  // Library selection state
  selectedLibraryItem: string | null = null;
  selectedViewNodeDetails: any = null;
  expandedSetNodes: Set<string> = new Set();
  useRuntimeCanvas: boolean = false;
  
  
  // State before hiding to restore on hover
  private stateBeforeHide = {
    libraryPanelOpen: false,
    settingsPanelOpen: false,
    propertiesPanelOpen: false
  };
  
  // Drag state
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  panelPosition = { x: 11, y: 5.4 }; // vw/vh units

  // Computed property for any LEFT panel open state (for push mode)
  get anyLeftPanelOpen(): boolean {
    // Only left-side panels affect push mode
    return this.libraryPanelOpen || this.settingsPanelOpen;
  }

  // Computed property for any panel open state
  get anyPanelOpen(): boolean {
    return this.libraryPanelOpen || this.settingsPanelOpen || this.propertiesPanelOpen;
  }

  // Calculate total workspace offset (activity bar + optional push mode)
  get workspacePushOffset(): number {
    let offset = 0;

    // ALWAYS add activity bar width when activity bar is visible and not hidden
    if (this.activityBarVisible && !this.activityBarHidden) {
      offset += 60; // Activity bar width (permanent design setting)
    }

    // ADDITIONALLY add panel width if push mode is enabled and a LEFT panel is open
    // Right-side panels (properties, chat) are always in overlay mode
    if (this.uiState.panelPushMode() && this.anyLeftPanelOpen) {
      offset += 340; // Panel width - configurable per panel
    }

    return offset;
  }

  constructor(
    private messageService: MessageService,
    private http: HttpClient,
    public uiState: UiStateService,
    private treeState: TreeStateService,
    private itemsStore: ItemsStoreService,
    private viewRegistry: ViewRegistryService,
    private viewStateService: ViewSpecificStateService,
    private viewNodeState: ViewNodeStateService,
    private themeService: ThemeService
  ) {}

  async ngOnInit(): Promise<void> {
    // Initialize theme service (will load persisted theme and set CSS variables)
    // The service constructor handles initialization automatically

    // Load mission card content
    await this.loadMissionContent();

    // Initialize state management services
    this.viewRegistry.initializeDefaultViews();
    this.treeState.initializeMockData();

    // Subscribe to library items from service (FR-030)
    this.viewNodeState.getLibraryItems().subscribe(items => {
      this.libraryItems = items.length > 0 ? items : this.staticLibraryItems;
    });

    // Subscribe to expanded SetNodes
    this.viewNodeState.expandedSetNodes.subscribe(expanded => {
      this.expandedSetNodes = expanded;
    });

    // Check user preference for intro
    const showIntro = this.uiState.showIntro();
    const autoOpenLibrary = this.uiState.autoOpenLibraryPanel();

    if (showIntro) {
      // Show mission card intro
      this.missionCardVisible = true;
      this.activityBarVisible = false;
      this.panelsEnabled = false;
      this.missionCardFadingIn = true;
      this.uiState.setLibraryPanel(false);
      this.uiState.setSettingsPanel(false);
      this.activityBarHover = false;
      this.activityBarHidden = false;

      // Trigger fade-in after a short delay
      setTimeout(() => {
        this.missionCardFadingIn = false;
      }, 100);
    } else {
      // Skip intro - go straight to explore mode
      this.missionCardVisible = false;
      this.activityBarVisible = true;
      this.panelsEnabled = true;
      this.missionCardFadingIn = false;
      // Use user preference for auto-opening library panel
      this.uiState.setLibraryPanel(autoOpenLibrary);
      this.uiState.setSettingsPanel(false);
      this.activityBarHover = false;
      this.activityBarHidden = false;
      this.exploreMode = true; // For backward compatibility
    }
    
    // Add global mouse event listeners for dragging
    document.addEventListener('mousemove', this.onGlobalMouseMove);
    document.addEventListener('mouseup', this.onGlobalMouseUp);
    // Initialize canvas animation after view init
    setTimeout(() => {
      this.canvas = document.querySelector('.bg-canvas') as HTMLCanvasElement;
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d')!;
        this.resize();
        this.initNodes();
        this.animate();
        window.addEventListener('resize', this.resize);
      }
    }, 100);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('mousemove', this.onGlobalMouseMove);
    document.removeEventListener('mouseup', this.onGlobalMouseUp);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }

  private resize = () => {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.ctx?.scale(dpr, dpr);
  };

  private initNodes() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    
    for (let i = 0; i < 50; i++) {
      this.nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5
      });
    }
  }

  private animate = () => {
    this.rafId = requestAnimationFrame(this.animate);
    if (!this.ctx || !this.canvas) return;

    // Stop animation when workspace is active
    if (this.selectedEntityId) {
      this.ctx.clearRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
      return;
    }

    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    this.ctx.clearRect(0, 0, w, h);

    // Update and draw nodes with current view color
    this.ctx.fillStyle = this.currentViewColor;
    this.ctx.strokeStyle = this.currentViewColor.replace('0.6)', '0.2)');

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      
      // Update position
      node.x += node.vx;
      node.y += node.vy;

      // Bounce off edges
      if (node.x < 0 || node.x > w) node.vx *= -1;
      if (node.y < 0 || node.y > h) node.vy *= -1;

      // Draw node
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
      this.ctx.fill();

      // Draw connections to nearby nodes
      for (let j = i + 1; j < this.nodes.length; j++) {
        const other = this.nodes[j];
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 100) {
          this.ctx.beginPath();
          this.ctx.moveTo(node.x, node.y);
          this.ctx.lineTo(other.x, other.y);
          this.ctx.stroke();
        }
      }
    }
  };

  onCanvasMove(event: MouseEvent) {
    // Simple mouse interaction
  }


  onDontShowAgainChange(event: any) {
    // Inverse logic: "don't show again" = true means showIntro = false
    this.uiState.setShowIntro(!event.checked);
  }

  enterExploreMode() {
    // Step 1: Start 3-second fade out
    this.missionCardFading = true;

    // Step 2: After 3 seconds, hide card completely
    setTimeout(() => {
      this.missionCardVisible = false;
    }, 3000);

    // Step 3: After fade + pause (3.5s total), show activity bar
    setTimeout(() => {
      this.activityBarVisible = true;
      this.panelsEnabled = true;
      this.exploreMode = true; // For backward compatibility
      this.activityBarHidden = false; // Ensure activity bar is visible
      this.messageService.add({
        severity: 'success',
        summary: 'Explore Mode',
        detail: 'Navigation enabled'
      });

      // Step 4: After activity bar is shown, conditionally open library panel
      setTimeout(() => {
        const autoOpenLibrary = this.uiState.autoOpenLibraryPanel();
        if (autoOpenLibrary && !this.libraryPanelOpen) {
          this.toggleLibrary();
        }

        // Force Angular change detection to ensure button remains clickable
        setTimeout(() => {
          // Trigger change detection cycle
          this.activityBarHidden = false; // Redundant but forces update
        }, 100);
      }, 500);
    }, 3500);
  }

  private resetToLanding() {
    this.missionCardFading = false;
  }

  toggleLibrary() {
    // Ensure activity bar is visible when opening panels
    this.activityBarHidden = false;
    this.uiState.toggleLibraryPanel();
  }

  toggleSettings() {
    // Ensure activity bar is visible when opening panels
    this.activityBarHidden = false;
    this.uiState.toggleSettingsPanel();
  }

  onLogout() {
    // Handle logout - for now just show a message
    this.messageService.add({
      severity: 'info',
      summary: 'Logout',
      detail: 'Logout functionality not implemented yet'
    });
  }

  toggleProperties() {
    // Properties panel is right-side and independent of left panels
    // DO NOT show activity bar or affect left panels
    // Close chat panel when opening properties (mutual exclusion for right-side panels only)
    if (this.uiState.chatPanelOpen()) this.uiState.setChatPanel(false);
    this.uiState.togglePropertiesPanel();
  }

  toggleChat() {
    // Close properties panel when opening chat (mutual exclusion)
    if (this.uiState.propertiesPanelOpen()) this.uiState.setPropertiesPanel(false);
    this.uiState.toggleChatPanel();
  }

  toggleDebugPanel() {
    this.uiState.toggleDebugPanel();
    if (this.uiState.debugPanelOpen()) {
      this.updateDebugPanelData();
    }
  }

  onDebugPanelClosed() {
    this.uiState.setDebugPanel(false);
  }

  updateDebugPanelData() {
    if (!this.uiState.debugPanelOpen()) return;
    
    // Get JSON data from current active view engine
    // ModularCanvas now manages its own state via service
    this.currentViewJsonData = '{"message": "Debug data handled by ModularCanvas component"}';
  }

  toggleActivityBar() {
    if (this.activityBarHidden) {
      // Show activity bar with smooth transition
      this.activityBarHidden = false;
      this.activityBarVisible = true;
    } else {
      // Store state to restore when shown again
      this.stateBeforeHide = {
        libraryPanelOpen: this.uiState.libraryPanelOpen(),
        settingsPanelOpen: this.uiState.settingsPanelOpen(),
        propertiesPanelOpen: this.uiState.propertiesPanelOpen()
      };

      // Close panels and hide activity bar immediately for smooth animation
      this.uiState.setLibraryPanel(false);
      this.uiState.setSettingsPanel(false);
      this.uiState.setPropertiesPanel(false);
      this.activityBarHidden = true;
      this.activityBarHover = false;
      // Keep activityBarVisible true so the hover trigger can work
    }
  }

  onHoverTrigger() {
    // Only respond to hover if activity bar is currently hidden
    if (this.activityBarHidden) {
      // Show activity bar and restore panels
      this.activityBarHidden = false;
      this.activityBarVisible = true;
      this.uiState.setLibraryPanel(this.stateBeforeHide.libraryPanelOpen);
      this.uiState.setSettingsPanel(this.stateBeforeHide.settingsPanelOpen);
      this.uiState.setPropertiesPanel(this.stateBeforeHide.propertiesPanelOpen);
    }
  }

  onTriggerLeave() {
    // Do nothing - let the activity bar stay visible until hamburger click
    // This ensures the user can interact with the activity bar after hovering
  }

  onActivityBarItemClick(itemId: string) {
    switch (itemId) {
      case 'home':
        this.goHome();
        break;
      case 'library':
        this.toggleLibrary();
        break;
      case 'properties':
        this.toggleProperties();
        break;
      case 'chat':
        this.toggleChat();
        break;
      case 'style':
        this.uiState.toggleNodeStylePanel();
        break;
      case 'layout':
        this.uiState.toggleLayoutPanel();
        break;
      case 'admin':
        this.toggleSettings();
        break;
      case 'debug':
        this.toggleDebugPanel();
        break;
      default:
        console.log('Activity bar item clicked:', itemId);
    }
  }

  goHome() {
    // Close LEFT-side panels only, keep activity bar open
    this.uiState.setLibraryPanel(false);
    this.uiState.setSettingsPanel(false);
    // Keep right-side panels (properties, chat) as they are

    // Return to floating shapes by clearing selected entity
    this.selectedEntityId = null;
    this.selectedEntityLabel = null;
    this.selectedEntityData = null;
    this.selectedLibraryItem = null;
    this.selectedViewNodeDetails = null;
    this.useRuntimeCanvas = false;

    // Clear any selected view to show the animated background
    this.selectedView = 'data'; // Reset to default but entity is null so workspace won't show

    // Clear the UI state's active view as well to ensure no lingering state
    this.uiState.setActiveView(null as any);

    // Also tell the view node state service to deselect any view node
    this.viewNodeState.clearSelection();
  }

  onViewChange(viewType: string) {
    this.selectedView = viewType;
    this.uiState.setActiveView(viewType as any);
    
    // Change canvas node colors based on view
    switch (viewType) {
      case 'description':
        this.currentViewColor = 'rgba(110, 168, 254, 0.6)'; // Blue
        break;
      case 'data':
        this.currentViewColor = 'rgba(34, 197, 94, 0.6)'; // Green
        break;
      case 'graph':
        this.currentViewColor = 'rgba(239, 68, 68, 0.6)'; // Red
        break;
      case 'business':
        this.currentViewColor = 'rgba(168, 85, 247, 0.6)'; // Purple
        break;
    }

    // For non-graph views, show floating nodes background
    if (viewType !== 'graph') {
      // Store current entity for later restoration but enable floating nodes animation
      // Keep selectedEntityId so we can restore graph when switching back
    } else if (viewType === 'graph') {
      // When switching to graph view, ensure we have the correct selectedEntityId
      // If we don't have one but have graph data, find the entity that has graph data
      if (!this.selectedEntityId && (this.graphNodes.length > 0 || this.graphEdges.length > 0)) {
        // Find the entity that has saved graph data
        const viewStates = this.viewStateService.getAllViewStates();
        for (const [entityId, state] of viewStates.entries()) {
          if (state.entities.length > 0) {
            this.selectedEntityId = entityId;
            this.selectedEntityLabel = entityId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
            break;
          }
        }
      }
    }
    
    this.messageService.add({
      severity: 'info',
      summary: 'View Changed',
      detail: `Switched to ${viewType} view with ${this.currentViewColor}`
    });
  }

  signIn() {
    this.loginVisible = false;
    this.messageService.add({
      severity: 'success',
      summary: 'Welcome',
      detail: 'Loading your workspace...'
    });
  }

  startDrag(event: MouseEvent) {
    if (event.target === event.currentTarget || (event.target as HTMLElement).closest('.drag-handle')) {
      this.isDragging = true;
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.dragOffset = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      event.preventDefault();
    }
  }

  onPresetChange(presetId: string) {
    this.activePresetId = presetId;
    // modularCanvasComponent removed
  }

  onPresetResolved(resolved: ResolvedViewPreset | null): void {
    if (!resolved) {
      return;
    }
    this.activePresetId = resolved.preset.id;
  }

  private onGlobalMouseMove = (event: MouseEvent) => {
    if (!this.isDragging) return;

    const newX = ((event.clientX - this.dragOffset.x) / window.innerWidth) * 100;
    const newY = ((event.clientY - this.dragOffset.y) / window.innerHeight) * 100;

    // Constrain to viewport bounds
    this.panelPosition.x = Math.max(0, Math.min(70, newX)); // max 70vw to keep panel visible
    this.panelPosition.y = Math.max(0, Math.min(80, newY)); // max 80vh to keep panel visible
  };

  private onGlobalMouseUp = () => {
    this.isDragging = false;
  };


  async onLibraryItemSelect(itemId: string) {
    this.selectedLibraryItem = itemId;

    // Get item details from service
    const itemDetails = this.viewNodeState.getItemDetails(itemId);

    if (itemDetails) {
      // Store details for properties panel
      this.selectedViewNodeDetails = itemDetails;

      // Check if it's a ViewNode (has renderer property)
      if (itemDetails.renderer || itemDetails.layout_engine) {
        // It's a ViewNode - tell service to select it
        this.viewNodeState.selectViewNodeById(itemId);

        // Determine if we should use runtime canvas
        this.useRuntimeCanvas = itemDetails.layout_engine === 'containment-runtime';

        // Set view to modular canvas
        this.selectedView = 'modular-canvas';
        this.uiState.setActiveView('modular-canvas');
        this.selectedEntityId = itemId;
        this.selectedEntityLabel = itemDetails.name;

        this.messageService.add({
          severity: 'info',
          summary: `Loading ${itemDetails.name}`,
          detail: 'Executing query and applying layout...'
        });
        return;
      }
      // It's a SetNode - just show details
      console.log('🔷 SetNode clicked:', itemDetails.name);
      return;
    }
    
    // Fallback to static item handling
    const item = this.staticLibraryItems.find(item => item.id === itemId);
    if (!item) {
      console.warn(`Library item not found: ${itemId}`);
      return;
    }
    
    // Set view type FIRST to prevent header flash
    if (item.viewType) {
      this.selectedView = item.viewType as string;
      this.uiState.setActiveView(item.viewType as ViewType);
    }
    
    // Then set entity properties
    this.selectedEntityId = itemId;
    this.selectedEntityLabel = item.label;
    
    // Handle items with custom views
    if (item.viewType) {
      // View type already set above
    } else {
      this.messageService.add({
        severity: 'info',
        summary: item.summary,
        detail: item.detail
      });
    }
  }

  // ViewNode selection is now handled via service - method no longer needed


  onChatPanelToggled(isVisible: boolean) {
    this.uiState.setChatPanel(isVisible);
  }

  onPropertiesPanelToggled(isVisible: boolean) {
    this.uiState.setPropertiesPanel(isVisible);
  }

  onLayoutPanelToggled(isVisible: boolean) {
    this.uiState.setLayoutPanel(isVisible);
  }

  onNodeStylePanelToggled(isVisible: boolean) {
    this.uiState.setNodeStylePanel(isVisible);
  }

  // Library data now loaded via ViewNodeStateService

  // Hierarchical library items now created in ViewNodeStateService

  // Tree expansion functionality
  isExpandableSetNode(item: LibraryItem): boolean {
    // SetNodes (parent items) are expandable if they have children
    const setNodes = this.viewNodeState.getSetNodes();
    return !item.nested && setNodes.some(sn => sn.id === item.id);
  }

  isSetNodeExpanded(itemId: string): boolean {
    return this.viewNodeState.isSetNodeExpanded(itemId);
  }

  toggleSetNodeExpansion(itemId: string, event: Event): void {
    event.stopPropagation(); // Prevent item selection
    this.viewNodeState.toggleSetNodeExpansion(itemId);
  }

  isChildOfCollapsedSet(item: LibraryItem): boolean {
    if (!item.nested) return false; // Not a child item
    
    // Find the parent SetNode for this nested item
    let parentSetNode = null;
    for (let i = this.libraryItems.indexOf(item) - 1; i >= 0; i--) {
      const potentialParent = this.libraryItems[i];
      if (!potentialParent.nested) {
        parentSetNode = potentialParent;
        break;
      }
    }
    
    // Hide if parent SetNode is collapsed
    return parentSetNode ? !this.isSetNodeExpanded(parentSetNode.id) : false;
  }

  // SetNode selection is now handled in onLibraryItemSelect

  async loadMissionContent(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get('assets/mission_card.md', { responseType: 'text' })
      );
      this.parseMissionMarkdown(response);
    } catch (error) {
      console.error('Failed to load mission card content:', error);
      // Fallback to hardcoded content
      this.missionContent = {
        title: 'Kalisi',
        tagline: 'Draw your world. Link it together. Adapt with clarity.',
        sections: [
          {
            heading: 'Model',
            paragraphs: [
              'Start by sketching your world in a way that makes sense to you.',
              'It looks like a diagram — a software stack, a compliance process, even something personal — but every shape and link is stored in a graph.'
            ]
          },
          {
            heading: 'Monitor',
            paragraphs: [
              'Connect live data streams to your model.',
              'See how systems, processes, and outcomes behave in real time.',
              'Turn a static picture into a living system.'
            ]
          },
          {
            heading: 'Analyze',
            paragraphs: [
              'Uncover patterns, risks, and dependencies hidden in complexity.',
              'Ask "what if?" and test scenarios before making changes.',
              'Move from reactive to predictive.'
            ]
          }
        ]
      };
    }
  }

  parseMissionMarkdown(markdown: string): void {
    const lines = markdown.split('\n').map(line => line.trim()).filter(line => line);

    this.missionContent.title = '';
    this.missionContent.tagline = '';
    this.missionContent.sections = [];

    let currentSection: { heading: string; paragraphs: string[] } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // H1 - Title
      if (line.startsWith('# ')) {
        this.missionContent.title = line.substring(2);
      }
      // H2 - Section heading
      else if (line.startsWith('## ')) {
        if (currentSection) {
          this.missionContent.sections.push(currentSection);
        }
        currentSection = { heading: line.substring(3), paragraphs: [] };
      }
      // Regular paragraph
      else if (!line.startsWith('#')) {
        // If no section yet, treat as tagline
        if (!currentSection && !this.missionContent.tagline) {
          this.missionContent.tagline = line;
        } else if (currentSection) {
          currentSection.paragraphs.push(line);
        }
      }
    }

    // Add last section
    if (currentSection) {
      this.missionContent.sections.push(currentSection);
    }
  }

}
