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
    const existing = this._panels().get(id);
    if (existing) return;

    // Load from settings or use defaults
    const saved = this.hudSettings.getPanelSettings(id);
    const state: PanelState = {
      id,
      visible: saved?.visible ?? metadata.defaultVisible,
      position: saved?.position ?? metadata.defaultPosition,
      opacity: saved?.opacity ?? 0.9,
      zIndex: saved?.zIndex ?? this._nextZIndex++
    };

    this._panels.update(panels => {
      panels.set(id, state);
      return new Map(panels);
    });
  }

  unregisterPanel(id: string): void {
    this._panels.update(panels => {
      panels.delete(id);
      return new Map(panels);
    });
  }

  showPanel(id: string): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, visible: true });
        this.hudSettings.savePanelVisibility(id, true);
      }
      return new Map(panels);
    });
  }

  hidePanel(id: string): void {
    this._panels.update(panels => {
      const panel = panels.get(id);
      if (panel) {
        panels.set(id, { ...panel, visible: false });
        this.hudSettings.savePanelVisibility(id, false);
      }
      return new Map(panels);
    });
  }

  togglePanel(id: string): void {
    const panel = this._panels().get(id);
    if (panel?.visible) {
      this.hidePanel(id);
    } else {
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
