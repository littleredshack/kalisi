import { Injectable, signal, computed } from '@angular/core';
import { ViewType } from '../models/view.models';

@Injectable({
  providedIn: 'root'
})
export class UiStateService {
  constructor() {
    this.loadPersistedPreferences();
  }
  // Core UI state signals
  private _activeItemId = signal<string | null>(null);
  private _activeView = signal<ViewType | null>(null);
  private _libraryPanelOpen = signal<boolean>(false);
  private _settingsPanelOpen = signal<boolean>(false);
  private _propertiesPanelOpen = signal<boolean>(false);
  private _exploreMode = signal<boolean>(false);
  private _panelPushMode = signal<boolean>(true);
  private _showIntro = signal<boolean>(true);

  // Public read-only signals
  readonly activeItemId = this._activeItemId.asReadonly();
  readonly activeView = this._activeView.asReadonly();
  readonly libraryPanelOpen = this._libraryPanelOpen.asReadonly();
  readonly settingsPanelOpen = this._settingsPanelOpen.asReadonly();
  readonly propertiesPanelOpen = this._propertiesPanelOpen.asReadonly();
  readonly exploreMode = this._exploreMode.asReadonly();
  readonly panelPushMode = this._panelPushMode.asReadonly();
  readonly showIntro = this._showIntro.asReadonly();

  // Computed signals
  readonly hasActiveItem = computed(() => this._activeItemId() !== null);
  readonly hasActiveView = computed(() => this._activeView() !== null);
  readonly anyPanelOpen = computed(() => this._libraryPanelOpen() || this._settingsPanelOpen() || this._propertiesPanelOpen());

  // State mutations
  setActiveItem(itemId: string | null) {
    this._activeItemId.set(itemId);
    // Reset to default view when selecting new item
    if (itemId) {
      this._activeView.set('description');
    } else {
      this._activeView.set(null);
    }
  }

  setActiveView(view: ViewType | null) {
    this._activeView.set(view);
  }

  setLibraryPanel(open: boolean) {
    this._libraryPanelOpen.set(open);
    // Close other panels when opening library
    if (open) {
      this._settingsPanelOpen.set(false);
      this._propertiesPanelOpen.set(false);
    }
  }

  setSettingsPanel(open: boolean) {
    this._settingsPanelOpen.set(open);
    // Close other panels when opening settings
    if (open) {
      this._libraryPanelOpen.set(false);
      this._propertiesPanelOpen.set(false);
    }
  }

  setPropertiesPanel(open: boolean) {
    this._propertiesPanelOpen.set(open);
    // Close other panels when opening properties
    if (open) {
      this._libraryPanelOpen.set(false);
      this._settingsPanelOpen.set(false);
    }
  }

  setExploreMode(enabled: boolean) {
    this._exploreMode.set(enabled);
    if (enabled) {
      // Auto-open library on explore
      this._libraryPanelOpen.set(true);
    } else {
      // Close all panels when leaving explore
      this._libraryPanelOpen.set(false);
      this._settingsPanelOpen.set(false);
      this._propertiesPanelOpen.set(false);
      this._activeItemId.set(null);
      this._activeView.set(null);
    }
  }

  toggleLibraryPanel() {
    this.setLibraryPanel(!this._libraryPanelOpen());
  }

  toggleSettingsPanel() {
    this.setSettingsPanel(!this._settingsPanelOpen());
  }

  togglePropertiesPanel() {
    this.setPropertiesPanel(!this._propertiesPanelOpen());
  }

  closeAllPanels() {
    this._libraryPanelOpen.set(false);
    this._settingsPanelOpen.set(false);
    this._propertiesPanelOpen.set(false);
  }

  setPanelPushMode(pushMode: boolean) {
    this._panelPushMode.set(pushMode);
    // Persist to localStorage
    localStorage.setItem('edt2_panel_push_mode', pushMode.toString());
  }

  togglePanelPushMode() {
    this.setPanelPushMode(!this._panelPushMode());
  }

  setShowIntro(showIntro: boolean) {
    this._showIntro.set(showIntro);
    // Persist to localStorage
    localStorage.setItem('edt2_show_intro', showIntro.toString());
  }

  toggleShowIntro() {
    this.setShowIntro(!this._showIntro());
  }

  private loadPersistedPreferences() {
    const pushMode = localStorage.getItem('edt2_panel_push_mode');
    if (pushMode !== null) {
      this._panelPushMode.set(pushMode === 'true');
    }

    const showIntro = localStorage.getItem('edt2_show_intro');
    if (showIntro !== null) {
      this._showIntro.set(showIntro === 'true');
    }
  }

  // Export current state for persistence
  exportState() {
    return {
      activeItemId: this._activeItemId(),
      activeView: this._activeView(),
      libraryPanelOpen: this._libraryPanelOpen(),
      settingsPanelOpen: this._settingsPanelOpen(),
      propertiesPanelOpen: this._propertiesPanelOpen(),
      panelPushMode: this._panelPushMode()
    };
  }

  // Import state from persistence
  importState(state: Partial<ReturnType<typeof this.exportState>>) {
    if (state.activeItemId !== undefined) this._activeItemId.set(state.activeItemId);
    if (state.activeView !== undefined) this._activeView.set(state.activeView);
    if (state.libraryPanelOpen !== undefined) this._libraryPanelOpen.set(state.libraryPanelOpen);
    if (state.settingsPanelOpen !== undefined) this._settingsPanelOpen.set(state.settingsPanelOpen);
    if (state.propertiesPanelOpen !== undefined) this._propertiesPanelOpen.set(state.propertiesPanelOpen);
    if (state.panelPushMode !== undefined) this._panelPushMode.set(state.panelPushMode);
  }
}