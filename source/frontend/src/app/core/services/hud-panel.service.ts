import { Injectable, signal, computed } from '@angular/core';
import { PanelState, PanelMetadata } from '../../shared/models/hud.models';
import { HudSettingsService } from './hud-settings.service';

@Injectable({ providedIn: 'root' })
export class HudPanelService {
  private _panels = signal<Map<string, PanelState>>(new Map());
  private _nextZIndex = 100;

  readonly visiblePanels = computed(() =>
    Array.from(this._panels().values()).filter(p => p.visible)
  );

  readonly activePanelId = signal<string | null>(null);

  constructor(private hudSettings: HudSettingsService) {
    // Load saved state on init
    this.loadState();
  }

  registerPanel(id: string, metadata: PanelMetadata): void {
    console.log('[HudPanelService] Registering panel:', id, metadata);
    const existing = this._panels().get(id);
    if (existing) {
      console.log('[HudPanelService] Panel already registered:', id);
      return;
    }

    // Load from settings or use defaults
    const saved = this.hudSettings.getPanelSettings(id);
    console.log('[HudPanelService] Saved settings for panel:', saved);
    const state: PanelState = {
      id,
      visible: saved?.visible ?? metadata.defaultVisible,
      position: saved?.position ?? metadata.defaultPosition,
      opacity: saved?.opacity ?? 0.9,
      zIndex: saved?.zIndex ?? this._nextZIndex++
    };

    console.log('[HudPanelService] Panel state created:', state);
    this._panels.update(panels => {
      panels.set(id, state);
      return new Map(panels);
    });
    console.log('[HudPanelService] Panel registered successfully, total panels:', this._panels().size);
  }

  unregisterPanel(id: string): void {
    this._panels.update(panels => {
      panels.delete(id);
      return new Map(panels);
    });
  }

  showPanel(id: string): void {
    console.log('[HudPanelService] showPanel called for:', id);
    this._panels.update(panels => {
      const panel = panels.get(id);
      console.log('[HudPanelService] Panel state before show:', panel);
      if (panel) {
        panels.set(id, { ...panel, visible: true });
        this.hudSettings.savePanelVisibility(id, true);
        console.log('[HudPanelService] Panel set to visible');
      } else {
        console.warn('[HudPanelService] Panel not found:', id);
      }
      return new Map(panels);
    });
  }

  hidePanel(id: string): void {
    console.log('[HudPanelService] hidePanel called for:', id);
    this._panels.update(panels => {
      const panel = panels.get(id);
      console.log('[HudPanelService] Panel state before hide:', panel);
      if (panel) {
        panels.set(id, { ...panel, visible: false });
        this.hudSettings.savePanelVisibility(id, false);
        console.log('[HudPanelService] Panel set to hidden');
      } else {
        console.warn('[HudPanelService] Panel not found:', id);
      }
      return new Map(panels);
    });
  }

  togglePanel(id: string): void {
    const panel = this._panels().get(id);
    console.log('[HudPanelService] Toggle panel:', id, 'current state:', panel);
    if (panel?.visible) {
      console.log('[HudPanelService] Panel is visible, hiding');
      this.hidePanel(id);
    } else {
      console.log('[HudPanelService] Panel is hidden, showing');
      this.showPanel(id);
    }
  }

  bringToFront(id: string): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        const newZIndex = this._nextZIndex++;
        panels.set(id, { ...panel, zIndex: newZIndex });
        this.activePanelId.set(id);
        this.hudSettings.savePanelZIndex(id, newZIndex);
      }
      return new Map(panels);
    });
  }

  updatePosition(id: string, position: { x: number; y: number }): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, position });
        this.hudSettings.savePanelPosition(id, position);
      }
      return new Map(panels);
    });
  }

  updateOpacity(id: string, opacity: number): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, opacity });
        this.hudSettings.savePanelOpacity(id, opacity);
      }
      return new Map(panels);
    });
  }

  getPanelState(id: string): PanelState | undefined {
    return this._panels().get(id);
  }

  isPanelVisible(id: string): boolean {
    return this._panels().get(id)?.visible ?? false;
  }

  private loadState(): void {
    const settings = this.hudSettings.loadSettings();
    // Initialize panels map from settings if needed
  }
}
