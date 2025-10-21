import { Injectable, signal, computed, effect } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface ThemeColors {
  background: string;
  border: string;
  panelOpacity: number;
}

export interface ThemePreset {
  name: string;
  background: string;
  border: string;
}

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  // Default colors (current app colors)
  private readonly DEFAULT_BACKGROUND = '#0b0f14';
  private readonly DEFAULT_BORDER = '#30363d';
  private readonly DEFAULT_PANEL_OPACITY = 0.85;

  // Theme presets for quick selection
  readonly presets: ThemePreset[] = [
    { name: 'Dark Blue (Default)', background: '#0b0f14', border: '#30363d' },
    { name: 'Pure Black', background: '#000000', border: '#1a1a1a' },
    { name: 'Dark Gray', background: '#1a1a1a', border: '#333333' },
    { name: 'Navy', background: '#0f172a', border: '#1e293b' },
    { name: 'Dark Purple', background: '#1a0f1f', border: '#2d1b33' },
    { name: 'Dark Green', background: '#0f1f0f', border: '#1b331b' },
    { name: 'Dark Brown', background: '#1a0f0a', border: '#33251a' },
    { name: 'Midnight', background: '#0a0a0f', border: '#1a1a2e' }
  ];

  // Signals for reactive theme colors
  private _backgroundColor = signal<string>(this.DEFAULT_BACKGROUND);
  private _borderColor = signal<string>(this.DEFAULT_BORDER);
  private _panelOpacity = signal<number>(this.DEFAULT_PANEL_OPACITY);

  // Public readonly signals
  readonly backgroundColor = this._backgroundColor.asReadonly();
  readonly borderColor = this._borderColor.asReadonly();
  readonly panelOpacity = this._panelOpacity.asReadonly();

  // Computed values for derived colors
  readonly borderLightColor = computed(() => this.adjustAlpha(this._borderColor(), 0.5));
  readonly borderHoverColor = computed(() => this.adjustAlpha(this._borderColor(), 0.8));
  readonly backgroundOverlayColor = computed(() => this.adjustAlpha(this._backgroundColor(), 0.95));

  // Subject for debounced color changes
  private colorChangeSubject = new Subject<ThemeColors>();

  constructor() {
    // Load persisted theme on startup
    this.loadPersistedTheme();

    // Set up effect to update CSS variables when colors change
    effect(() => {
      this.updateCssVariables(
        this._backgroundColor(),
        this._borderColor(),
        this._panelOpacity()
      );
    });

    // Set up debounced color updates for smooth real-time changes
    this.colorChangeSubject.pipe(
      debounceTime(10), // 10ms for smooth updates
      distinctUntilChanged((a, b) =>
        a.background === b.background &&
        a.border === b.border &&
        a.panelOpacity === b.panelOpacity
      )
    ).subscribe(colors => {
      this.applyThemeColors(colors);
    });
  }

  /**
   * Set background color (debounced for real-time updates)
   */
  setBackgroundColor(color: string, immediate = false): void {
    if (immediate) {
      this._backgroundColor.set(color);
      this.persistTheme();
    } else {
      this.colorChangeSubject.next({
        background: color,
        border: this._borderColor(),
        panelOpacity: this._panelOpacity()
      });
    }
  }

  /**
   * Set border color (debounced for real-time updates)
   */
  setBorderColor(color: string, immediate = false): void {
    if (immediate) {
      this._borderColor.set(color);
      this.persistTheme();
    } else {
      this.colorChangeSubject.next({
        background: this._backgroundColor(),
        border: color,
        panelOpacity: this._panelOpacity()
      });
    }
  }

  /**
   * Set both colors at once
   */
  setThemeColors(background: string, border: string, immediate = false): void {
    if (immediate) {
      this._backgroundColor.set(background);
      this._borderColor.set(border);
      this.persistTheme();
    } else {
      this.colorChangeSubject.next({
        background,
        border,
        panelOpacity: this._panelOpacity()
      });
    }
  }

  setPropertiesPanelOpacity(opacity: number, immediate = false): void {
    const clamped = Math.min(1, Math.max(0, opacity));
    if (immediate) {
      this._panelOpacity.set(clamped);
      this.persistTheme();
    } else {
      this._panelOpacity.set(clamped);
      this.persistTheme();
    }
  }

  /**
   * Apply a preset theme
   */
  applyPreset(preset: ThemePreset): void {
    this.setThemeColors(preset.background, preset.border, true);
  }

  /**
   * Reset to default theme
   */
  resetToDefault(): void {
    this.setThemeColors(this.DEFAULT_BACKGROUND, this.DEFAULT_BORDER, true);
    this.setPropertiesPanelOpacity(this.DEFAULT_PANEL_OPACITY, true);
  }

  /**
   * Get current theme as preset format
   */
  getCurrentTheme(): ThemeColors {
    return {
      background: this._backgroundColor(),
      border: this._borderColor(),
      panelOpacity: this._panelOpacity()
    };
  }

  /**
   * Apply theme colors (internal)
   */
  private applyThemeColors(colors: ThemeColors): void {
    this._backgroundColor.set(colors.background);
    this._borderColor.set(colors.border);
    if (typeof colors.panelOpacity === 'number') {
      this._panelOpacity.set(Math.min(1, Math.max(0, colors.panelOpacity)));
    }
    this.persistTheme();
  }

  /**
   * Update CSS variables on the document root
   */
  private updateCssVariables(background: string, border: string, panelOpacity: number): void {
    const root = document.documentElement;

    const panelBackground = this.adjustAlpha(background, panelOpacity);
    const panelSurface = this.adjustAlpha(background, Math.min(1, panelOpacity + 0.08));
    const panelHeader = this.adjustAlpha(background, Math.min(1, panelOpacity + 0.12));
    const panelHover = this.adjustAlpha(background, Math.min(1, panelOpacity + 0.16));
    const borderSubtle = this.adjustAlpha(border, 0.35);
    const borderHover = this.adjustAlpha(border, 0.55);
    const borderStrong = this.adjustAlpha(border, 0.75);

    // Primary colors
    root.style.setProperty('--app-background', background);
    root.style.setProperty('--app-border', border);
    root.style.setProperty('--properties-panel-opacity', panelOpacity.toString());
    root.style.setProperty('--properties-panel-bg', panelBackground);

    // Derived colors
    root.style.setProperty('--app-border-light', this.adjustAlpha(border, 0.5));
    root.style.setProperty('--app-border-hover', this.adjustAlpha(border, 0.8));
    root.style.setProperty('--app-background-overlay', this.adjustAlpha(background, 0.95));

    // Panel-specific tokens
    root.style.setProperty('--panel-background', panelBackground);
    root.style.setProperty('--panel-surface', panelSurface);
    root.style.setProperty('--panel-header-background', panelHeader);
    root.style.setProperty('--panel-hover-background', panelHover);
    root.style.setProperty('--panel-border', border);
    root.style.setProperty('--panel-border-subtle', borderSubtle);
    root.style.setProperty('--panel-border-hover', borderHover);
    root.style.setProperty('--panel-border-strong', borderStrong);

    const backgroundAlphaMap: Array<[string, number]> = [
      ['--panel-background-alpha-45', 0.45],
      ['--panel-background-alpha-55', 0.55],
      ['--panel-background-alpha-60', 0.6],
      ['--panel-background-alpha-75', 0.75],
      ['--panel-background-alpha-85', 0.85]
    ];
    backgroundAlphaMap.forEach(([name, alpha]) => {
      root.style.setProperty(name, this.adjustAlpha(background, alpha));
    });

    const borderAlphaMap: Array<[string, number]> = [
      ['--panel-border-alpha-20', 0.2],
      ['--panel-border-alpha-30', 0.3],
      ['--panel-border-alpha-35', 0.35],
      ['--panel-border-alpha-40', 0.4],
      ['--panel-border-alpha-50', 0.5],
      ['--panel-border-alpha-60', 0.6]
    ];
    borderAlphaMap.forEach(([name, alpha]) => {
      root.style.setProperty(name, this.adjustAlpha(border, alpha));
    });

    root.style.setProperty('--panel-border-muted', this.adjustAlpha(border, Math.min(1, panelOpacity * 0.35)));
    root.style.setProperty('--panel-border-faint', this.adjustAlpha(border, Math.min(1, panelOpacity * 0.25)));
    root.style.setProperty('--panel-background-soft', this.adjustAlpha(background, Math.min(1, panelOpacity * 0.65)));
    root.style.setProperty('--panel-background-subtle', this.adjustAlpha(background, Math.min(1, panelOpacity * 0.45)));

    // Calculate lighter/darker variants
    root.style.setProperty('--app-background-light', this.lighten(background, 10));
    root.style.setProperty('--app-background-dark', this.darken(background, 10));
    root.style.setProperty('--app-border-strong', this.lighten(border, 20));

    // Update PrimeNG theme variable overrides
    root.style.setProperty('--surface-ground', background);
    root.style.setProperty('--p-border-color', border);
    root.style.setProperty('--surface-border', border);

    // Update PrimeNG surface colors to match theme
    root.style.setProperty('--p-surface-0', background);
    root.style.setProperty('--p-surface-50', this.lighten(background, 10));
    root.style.setProperty('--p-surface-100', border);
    root.style.setProperty('--p-surface-200', border);
    root.style.setProperty('--p-surface-300', this.lighten(border, 20));
  }

  /**
   * Persist theme to localStorage
   */
  private persistTheme(): void {
    const theme: ThemeColors = {
      background: this._backgroundColor(),
      border: this._borderColor(),
      panelOpacity: this._panelOpacity()
    };
    localStorage.setItem('app_theme_colors', JSON.stringify(theme));
  }

  /**
   * Load persisted theme from localStorage
   */
  private loadPersistedTheme(): void {
    const stored = localStorage.getItem('app_theme_colors');
    if (stored) {
      try {
        const theme: ThemeColors = JSON.parse(stored);
        this._backgroundColor.set(theme.background);
        this._borderColor.set(theme.border);
        if (typeof theme.panelOpacity === 'number') {
          this._panelOpacity.set(Math.min(1, Math.max(0, theme.panelOpacity)));
        }
      } catch (e) {
        console.warn('Failed to load persisted theme:', e);
      }
    }
  }

  /**
   * Utility: Adjust alpha channel of a color
   */
  private adjustAlpha(color: string, alpha: number): string {
    // Convert hex to rgba
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Utility: Lighten a color by percentage
   */
  private lighten(color: string, percent: number): string {
    const hex = color.replace('#', '');
    const r = Math.min(255, Math.floor(parseInt(hex.substring(0, 2), 16) * (1 + percent / 100)));
    const g = Math.min(255, Math.floor(parseInt(hex.substring(2, 4), 16) * (1 + percent / 100)));
    const b = Math.min(255, Math.floor(parseInt(hex.substring(4, 6), 16) * (1 + percent / 100)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Utility: Darken a color by percentage
   */
  private darken(color: string, percent: number): string {
    const hex = color.replace('#', '');
    const r = Math.max(0, Math.floor(parseInt(hex.substring(0, 2), 16) * (1 - percent / 100)));
    const g = Math.max(0, Math.floor(parseInt(hex.substring(2, 4), 16) * (1 - percent / 100)));
    const b = Math.max(0, Math.floor(parseInt(hex.substring(4, 6), 16) * (1 - percent / 100)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
}
