import { Injectable, signal, computed } from '@angular/core';
import { ViewType } from '../models/view.models';

@Injectable({
  providedIn: 'root'
})
export class UiStateService {
  constructor() {
    this.loadPersistedPreferences();
    this.loadPanelStates();
  }
  // Core UI state signals
  private _activeItemId = signal<string | null>(null);
  private _activeView = signal<ViewType | null>(null);
  private _libraryPanelOpen = signal<boolean>(false);
  private _settingsPanelOpen = signal<boolean>(false);
  private _propertiesPanelOpen = signal<boolean>(false);
  private _nodeStylePanelOpen = signal<boolean>(false);
  private _chatPanelOpen = signal<boolean>(false);
  private _debugPanelOpen = signal<boolean>(false);
  private _exploreMode = signal<boolean>(false);
  private _panelPushMode = signal<boolean>(true);
  private _showIntro = signal<boolean>(true);
  private _autoOpenLibraryPanel = signal<boolean>(true);

  // Public read-only signals
  readonly activeItemId = this._activeItemId.asReadonly();
  readonly activeView = this._activeView.asReadonly();
  readonly libraryPanelOpen = this._libraryPanelOpen.asReadonly();
  readonly settingsPanelOpen = this._settingsPanelOpen.asReadonly();
  readonly propertiesPanelOpen = this._propertiesPanelOpen.asReadonly();
  readonly nodeStylePanelOpen = this._nodeStylePanelOpen.asReadonly();
  readonly chatPanelOpen = this._chatPanelOpen.asReadonly();
  readonly debugPanelOpen = this._debugPanelOpen.asReadonly();
  readonly exploreMode = this._exploreMode.asReadonly();
  readonly panelPushMode = this._panelPushMode.asReadonly();
  readonly showIntro = this._showIntro.asReadonly();
  readonly autoOpenLibraryPanel = this._autoOpenLibraryPanel.asReadonly();

  // Computed signals
  readonly hasActiveItem = computed(() => this._activeItemId() !== null);
  readonly hasActiveView = computed(() => this._activeView() !== null);
  readonly anyPanelOpen = computed(() => this._libraryPanelOpen() || this._settingsPanelOpen() || this._propertiesPanelOpen() || this._nodeStylePanelOpen() || this._chatPanelOpen() || this._debugPanelOpen());

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
    // Close other LEFT panels when opening library
    // Do NOT close right-side panels (properties, etc)
    if (open) {
      this._settingsPanelOpen.set(false);
    }
    this.persistPanelStates();
  }

  setSettingsPanel(open: boolean) {
    this._settingsPanelOpen.set(open);
    // Close other LEFT panels when opening settings
    // Do NOT close right-side panels (properties, etc)
    if (open) {
      this._libraryPanelOpen.set(false);
    }
    this.persistPanelStates();
  }

  setPropertiesPanel(open: boolean) {
    this._propertiesPanelOpen.set(open);
    // Properties panel is right-side and independent
    // Do NOT close any left-side panels
    this.persistPanelStates();
  }

  setNodeStylePanel(open: boolean) {
    this._nodeStylePanelOpen.set(open);
    // Node style panel is floating and independent
    // Do NOT close any other panels
    this.persistPanelStates();
  }

  setChatPanel(open: boolean) {
    this._chatPanelOpen.set(open);
    // Chat panel is right-side and independent
    // Do NOT close any left-side panels
    this.persistPanelStates();
  }

  setDebugPanel(open: boolean) {
    this._debugPanelOpen.set(open);
    // Debug panel is right-side and independent
    // Do NOT close any left-side panels
    this.persistPanelStates();
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
      this._nodeStylePanelOpen.set(false);
      this._chatPanelOpen.set(false);
      this._debugPanelOpen.set(false);
      this._activeItemId.set(null);
      this._activeView.set(null);
    }
    this.persistPanelStates();
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

  toggleNodeStylePanel() {
    this.setNodeStylePanel(!this._nodeStylePanelOpen());
  }

  toggleChatPanel() {
    this.setChatPanel(!this._chatPanelOpen());
  }

  toggleDebugPanel() {
    this.setDebugPanel(!this._debugPanelOpen());
  }

  closeAllPanels() {
    this._libraryPanelOpen.set(false);
    this._settingsPanelOpen.set(false);
    this._propertiesPanelOpen.set(false);
    this._nodeStylePanelOpen.set(false);
    this._chatPanelOpen.set(false);
    this._debugPanelOpen.set(false);
    this.persistPanelStates();
  }

  setPanelPushMode(pushMode: boolean) {
    this._panelPushMode.set(pushMode);
    // Persist to localStorage
    localStorage.setItem('kalisi_panel_push_mode', pushMode.toString());
  }

  togglePanelPushMode() {
    this.setPanelPushMode(!this._panelPushMode());
  }

  setShowIntro(showIntro: boolean) {
    this._showIntro.set(showIntro);
    // Persist to localStorage
    localStorage.setItem('kalisi_show_intro', showIntro.toString());
  }

  toggleShowIntro() {
    this.setShowIntro(!this._showIntro());
  }

  setAutoOpenLibraryPanel(autoOpen: boolean) {
    this._autoOpenLibraryPanel.set(autoOpen);
    // Persist to localStorage
    localStorage.setItem('kalisi_auto_open_library', autoOpen.toString());
  }

  toggleAutoOpenLibraryPanel() {
    this.setAutoOpenLibraryPanel(!this._autoOpenLibraryPanel());
  }

  private loadPersistedPreferences() {
    const pushMode = localStorage.getItem('kalisi_panel_push_mode');
    if (pushMode !== null) {
      this._panelPushMode.set(pushMode === 'true');
    }

    const showIntro = localStorage.getItem('kalisi_show_intro');
    if (showIntro !== null) {
      this._showIntro.set(showIntro === 'true');
    }

    const autoOpenLibrary = localStorage.getItem('kalisi_auto_open_library');
    if (autoOpenLibrary !== null) {
      this._autoOpenLibraryPanel.set(autoOpenLibrary === 'true');
    }
  }

  // Persist panel states to localStorage
  private persistPanelStates() {
    const panelStates = {
      libraryPanelOpen: this._libraryPanelOpen(),
      settingsPanelOpen: this._settingsPanelOpen(),
      propertiesPanelOpen: this._propertiesPanelOpen(),
      nodeStylePanelOpen: this._nodeStylePanelOpen(),
      chatPanelOpen: this._chatPanelOpen(),
      debugPanelOpen: this._debugPanelOpen()
    };
    localStorage.setItem('kalisi_panel_states', JSON.stringify(panelStates));
  }

  // Load panel states from localStorage
  private loadPanelStates() {
    const stored = localStorage.getItem('kalisi_panel_states');
    if (stored) {
      try {
        const panelStates = JSON.parse(stored);
        if (panelStates.libraryPanelOpen !== undefined) this._libraryPanelOpen.set(panelStates.libraryPanelOpen);
        if (panelStates.settingsPanelOpen !== undefined) this._settingsPanelOpen.set(panelStates.settingsPanelOpen);
        if (panelStates.propertiesPanelOpen !== undefined) this._propertiesPanelOpen.set(panelStates.propertiesPanelOpen);
        if (panelStates.nodeStylePanelOpen !== undefined) this._nodeStylePanelOpen.set(panelStates.nodeStylePanelOpen);
        if (panelStates.chatPanelOpen !== undefined) this._chatPanelOpen.set(panelStates.chatPanelOpen);
        if (panelStates.debugPanelOpen !== undefined) this._debugPanelOpen.set(panelStates.debugPanelOpen);
      } catch (e) {
        console.warn('Failed to load panel states:', e);
      }
    }
  }

  // Export current state for persistence (legacy method - keeping for compatibility)
  exportState() {
    return {
      activeItemId: this._activeItemId(),
      activeView: this._activeView(),
      libraryPanelOpen: this._libraryPanelOpen(),
      settingsPanelOpen: this._settingsPanelOpen(),
      propertiesPanelOpen: this._propertiesPanelOpen(),
      chatPanelOpen: this._chatPanelOpen(),
      debugPanelOpen: this._debugPanelOpen(),
      panelPushMode: this._panelPushMode()
    };
  }

  // Import state from persistence (legacy method - keeping for compatibility)
  importState(state: Partial<ReturnType<typeof this.exportState>>) {
    if (state.activeItemId !== undefined) this._activeItemId.set(state.activeItemId);
    if (state.activeView !== undefined) this._activeView.set(state.activeView);
    if (state.libraryPanelOpen !== undefined) this._libraryPanelOpen.set(state.libraryPanelOpen);
    if (state.settingsPanelOpen !== undefined) this._settingsPanelOpen.set(state.settingsPanelOpen);
    if (state.propertiesPanelOpen !== undefined) this._propertiesPanelOpen.set(state.propertiesPanelOpen);
    if (state.chatPanelOpen !== undefined) this._chatPanelOpen.set(state.chatPanelOpen);
    if (state.debugPanelOpen !== undefined) this._debugPanelOpen.set(state.debugPanelOpen);
    if (state.panelPushMode !== undefined) this._panelPushMode.set(state.panelPushMode);
  }
}