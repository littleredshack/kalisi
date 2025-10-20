import { Injectable } from '@angular/core';
import { HudSettings } from '../../shared/models/hud.models';

@Injectable({ providedIn: 'root' })
export class HudSettingsService {
  private readonly STORAGE_PREFIX = 'hud';
  private readonly SETTINGS_KEY = `${this.STORAGE_PREFIX}.settings`;
  private readonly SCHEMA_VERSION = 1;

  private settings: HudSettings = this.getDefaults();

  constructor() {
    this.settings = this.loadSettings();
  }

  loadSettings(): HudSettings {
    try {
      const stored = localStorage.getItem(this.SETTINGS_KEY);
      if (!stored) return this.getDefaults();

      const parsed = JSON.parse(stored) as HudSettings;
      return this.migrateIfNeeded(parsed);
    } catch (error) {
      console.error('Failed to load HUD settings:', error);
      return this.getDefaults();
    }
  }

  saveSettings(settings: HudSettings): void {
    try {
      localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
      this.settings = settings;
    } catch (error) {
      if ((error as any).name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, using session storage');
        // Fallback: use sessionStorage or in-memory
      } else {
        console.error('Failed to save HUD settings:', error);
      }
    }
  }

  getPanelSettings(panelId: string) {
    return this.settings.panels[panelId];
  }

  savePanelVisibility(panelId: string, visible: boolean): void {
    if (!this.settings.panels[panelId]) {
      this.settings.panels[panelId] = {
        position: { x: 100, y: 100 },
        opacity: 0.9,
        visible,
        zIndex: 100
      };
    } else {
      this.settings.panels[panelId].visible = visible;
    }
    this.saveSettings(this.settings);
  }

  savePanelPosition(panelId: string, position: { x: number; y: number }): void {
    if (!this.settings.panels[panelId]) {
      this.settings.panels[panelId] = {
        position,
        opacity: 0.9,
        visible: true,
        zIndex: 100
      };
    } else {
      this.settings.panels[panelId].position = position;
    }
    this.saveSettings(this.settings);
  }

  savePanelOpacity(panelId: string, opacity: number): void {
    if (!this.settings.panels[panelId]) {
      this.settings.panels[panelId] = {
        position: { x: 100, y: 100 },
        opacity,
        visible: true,
        zIndex: 100
      };
    } else {
      this.settings.panels[panelId].opacity = opacity;
    }
    this.saveSettings(this.settings);
  }

  savePanelZIndex(panelId: string, zIndex: number): void {
    if (!this.settings.panels[panelId]) {
      this.settings.panels[panelId] = {
        position: { x: 100, y: 100 },
        opacity: 0.9,
        visible: true,
        zIndex
      };
    } else {
      this.settings.panels[panelId].zIndex = zIndex;
    }
    this.saveSettings(this.settings);
  }

  private getDefaults(): HudSettings {
    return {
      version: this.SCHEMA_VERSION,
      panels: {},
      theme: {
        glowColor: 'cyan',
        glowIntensity: 1
      }
    };
  }

  private migrateIfNeeded(settings: HudSettings): HudSettings {
    if (settings.version === this.SCHEMA_VERSION) {
      return settings;
    }
    // Add migration logic here when schema changes
    return settings;
  }
}
