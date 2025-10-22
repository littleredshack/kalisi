import { Component, EventEmitter, Output, Input, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipModule } from 'primeng/tooltip';
import { PropertiesPanelComponent } from '../properties-panel/properties-panel.component';
import {
  CanvasControlService,
  CameraInfo,
  LayoutEngineOption,
  GraphLensOption,
  CanvasSelectionSnapshot
} from '../../core/services/canvas-control.service';
import { Observable, combineLatest, map, startWith } from 'rxjs';
import { ViewPresetDescriptor } from '../../shared/graph/view-presets';
// Preset manager removed

interface LevelOption {
  label: string;
  value: number;
}

interface SelectOptionState<T> {
  options: T[];
  activeId: string | null;
}

interface PanelViewModel {
  hasCanvas: boolean;
  camera: CameraInfo | null;
  autoState: string;
  canUndo: boolean;
  canRedo: boolean;
  layout: SelectOptionState<LayoutEngineOption>;
  lens: SelectOptionState<GraphLensOption>;
  levels: LevelOption[];
  selection: CanvasSelectionSnapshot | null;
  preset: PresetPanelState;
}

interface PresetPanelState {
  options: Array<{ id: string; label: string; description?: string }>;
  activeId: string | null;
  activeLabel: string | null;
  description: string | null;
  palette: Record<string, string>;
  hasOverrides: boolean;
}

@Component({
  selector: 'app-properties-rhs-panel',
  standalone: true,
  imports: [
    CommonModule,
    TooltipModule,
    PropertiesPanelComponent
  ],
  templateUrl: './properties-rhs-panel.component.html',
  styleUrls: ['./properties-rhs-panel.component.scss']
})
export class PropertiesRhsPanelComponent implements OnInit, OnDestroy, OnChanges {
  @Input() isOpen = false;
  @Input() selectedLibraryItem: string | null = null;
  @Input() selectedViewNodeDetails: any = null;
  @Output() panelToggled = new EventEmitter<boolean>();

  // Panel state
  isVisible = false;
  panelWidth = 340; // Default width
  panelHeight = 600; // Default height
  panelX = 100; // Default X position
  panelY = 100; // Default Y position

  resizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeHandle = '';

  dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  private readonly STORAGE_KEY = 'properties-panel-state';

  // Canvas control observables
  hasActiveCanvas$: Observable<boolean>;
  cameraInfo$: Observable<CameraInfo>;
  availableLevels$: Observable<number[]>;
  autoLayoutState$: Observable<string>;
  canUndo$: Observable<boolean>;
  canRedo$: Observable<boolean>;
  layoutEngines$: Observable<LayoutEngineOption[]>;
  activeLayoutEngine$: Observable<LayoutEngineOption | null>;
  layoutEngineOptions$: Observable<SelectOptionState<LayoutEngineOption>>;
  graphLensOptions$: Observable<SelectOptionState<GraphLensOption>>;
  levelOptions$: Observable<LevelOption[]>;
  presetOptions$: Observable<ReadonlyArray<ViewPresetDescriptor>>;
  activePreset$: Observable<any>;
  readonly selection$: Observable<CanvasSelectionSnapshot | null>;
  readonly panelState$: Observable<PanelViewModel>;

  constructor(private canvasControlService: CanvasControlService) {
    this.selection$ = this.canvasControlService.selection$;
    // Initialize observables from service
    this.hasActiveCanvas$ = this.canvasControlService.hasActiveCanvas$;
    this.cameraInfo$ = this.canvasControlService.cameraInfo$;
    this.availableLevels$ = this.canvasControlService.availableLevels$;
    this.autoLayoutState$ = this.canvasControlService.autoLayoutState$;
    this.canUndo$ = this.canvasControlService.canUndo$;
    this.canRedo$ = this.canvasControlService.canRedo$;
    this.layoutEngines$ = this.canvasControlService.layoutEngines$;
    this.activeLayoutEngine$ = this.canvasControlService.activeLayoutEngine$;
    this.layoutEngineOptions$ = combineLatest([this.layoutEngines$, this.activeLayoutEngine$]).pipe(
      map(([options, active]) => ({
        options,
        activeId: active?.id ?? null
      }))
    );
    this.graphLensOptions$ = combineLatest([
      this.canvasControlService.graphLensOptions$,
      this.canvasControlService.activeGraphLens$
    ]).pipe(
      map(([options, active]) => ({
        options,
        activeId: active?.id ?? null
      }))
    );

    // Transform levels array into dropdown options
    this.levelOptions$ = this.availableLevels$.pipe(
      map(levels => levels.map(level => ({
        label: `Level ${level}`,
        value: level
      })))
    );
    this.presetOptions$ = this.canvasControlService.presetOptions$;
    this.activePreset$ = this.canvasControlService.activePreset$;

    const emptyLayout: SelectOptionState<LayoutEngineOption> = { options: [], activeId: null };
    const emptyLens: SelectOptionState<GraphLensOption> = { options: [], activeId: null };
    const emptyPresetState: PresetPanelState = {
      options: [],
      activeId: null,
      activeLabel: null,
      description: null,
      palette: {},
      hasOverrides: false
    };

    this.panelState$ = combineLatest({
      hasCanvas: this.hasActiveCanvas$,
      camera: this.cameraInfo$,
      autoState: this.autoLayoutState$,
      canUndo: this.canUndo$,
      canRedo: this.canRedo$,
      layout: this.layoutEngineOptions$.pipe(startWith(emptyLayout)),
      lens: this.graphLensOptions$.pipe(startWith(emptyLens)),
      levels: this.levelOptions$.pipe(startWith([] as LevelOption[])),
      selection: this.selection$,
      presetOptions: this.presetOptions$.pipe(startWith([] as ReadonlyArray<ViewPresetDescriptor>)),
      activePreset: this.activePreset$.pipe(startWith(null as any))
    }).pipe(
      map(({ hasCanvas, camera, autoState, canUndo, canRedo, layout, lens, levels, selection, presetOptions, activePreset }) => ({
        hasCanvas,
        camera: camera ?? null,
        autoState: autoState ?? 'Auto Layout: OFF',
        canUndo: !!canUndo,
        canRedo: !!canRedo,
        layout: layout ?? emptyLayout,
        lens: lens ?? emptyLens,
        levels: levels ?? [],
        selection: selection ?? null,
        preset: this.buildPresetPanelState(presetOptions, activePreset) ?? emptyPresetState
      }))
    );
  }

  private buildPresetPanelState(
    options: ReadonlyArray<ViewPresetDescriptor>,
    active: any
  ): PresetPanelState {
    const optionList = options.map(option => ({
      id: option.id,
      label: option.label,
      description: option.description
    }));

    const paletteRecord: Record<string, string> = {};
    const palette = active?.preset.style?.palette ?? {};
    Object.entries(palette).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim().length > 0) {
        paletteRecord[key] = value;
      }
    });

    const overrides = active?.overrides ?? null;
    let hasOverrides = false;
    if (overrides && typeof overrides === 'object') {
      const styleOverrides = (overrides as Partial<ViewPresetDescriptor>).style;
      const paletteOverrides =
        styleOverrides && typeof styleOverrides === 'object'
          ? (styleOverrides as { palette?: Record<string, string> }).palette
          : null;
      hasOverrides = !!paletteOverrides && Object.keys(paletteOverrides).length > 0;
    }

    return {
      options: optionList,
      activeId: active?.preset.id ?? null,
      activeLabel: active?.preset.label ?? null,
      description: active?.preset.description ?? null,
      palette: paletteRecord,
      hasOverrides
    };
  }

  ngOnInit(): void {
    // Load saved width from localStorage
    this.loadPanelWidth();

    // Add global mouse event listeners for resizing
    document.addEventListener('mousemove', this.onGlobalMouseMove);
    document.addEventListener('mouseup', this.onGlobalMouseUp);
  }

  ngOnDestroy(): void {
    // Clean up global listeners
    document.removeEventListener('mousemove', this.onGlobalMouseMove);
    document.removeEventListener('mouseup', this.onGlobalMouseUp);
  }

  ngOnChanges(): void {
    // Handle visibility - immediate close for responsive feel
    if (this.isOpen && !this.isVisible) {
      this.isVisible = true;
    } else if (!this.isOpen && this.isVisible) {
      this.isVisible = false; // Close immediately
    }
  }

  closePanel(): void {
    this.panelToggled.emit(false);
  }

  // Drag functionality for moving the panel
  onHeaderDragStart(event: MouseEvent): void {
    // Don't start dragging if clicking on buttons or interactive elements
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.control-btn')) {
      return;
    }

    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragOffsetX = event.clientX - this.panelX;
    this.dragOffsetY = event.clientY - this.panelY;
    event.preventDefault();
  }

  // Resize functionality
  onResizeStart(event: MouseEvent, handle: string): void {
    this.resizing = true;
    this.resizeHandle = handle;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;
    this.resizeStartWidth = this.panelWidth;
    this.resizeStartHeight = this.panelHeight;
    event.preventDefault();
  }

  private onGlobalMouseMove = (event: MouseEvent): void => {
    if (this.dragging) {
      // Update panel position
      this.panelX = event.clientX - this.dragOffsetX;
      this.panelY = event.clientY - this.dragOffsetY;

      // Keep panel within viewport bounds
      const maxX = window.innerWidth - 100; // Keep at least 100px visible
      const maxY = window.innerHeight - 60; // Keep header visible
      this.panelX = Math.max(0, Math.min(maxX, this.panelX));
      this.panelY = Math.max(0, Math.min(maxY, this.panelY));
    } else if (this.resizing) {
      const deltaX = event.clientX - this.resizeStartX;
      const deltaY = event.clientY - this.resizeStartY;

      switch (this.resizeHandle) {
        case 'right':
          this.panelWidth = Math.max(280, Math.min(600, this.resizeStartWidth + deltaX));
          break;
        case 'bottom':
          this.panelHeight = Math.max(400, Math.min(900, this.resizeStartHeight + deltaY));
          break;
        case 'bottom-right':
          this.panelWidth = Math.max(280, Math.min(600, this.resizeStartWidth + deltaX));
          this.panelHeight = Math.max(400, Math.min(900, this.resizeStartHeight + deltaY));
          break;
      }
    }
  };

  private onGlobalMouseUp = (): void => {
    if (this.resizing || this.dragging) {
      // Save panel state to localStorage when resize or drag ends
      this.savePanelState();
    }
    this.resizing = false;
    this.dragging = false;
    this.resizeHandle = '';
  };

  private loadPanelWidth(): void {
    const savedState = localStorage.getItem(this.STORAGE_KEY);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        // Validate and apply saved state
        if (state.width >= 280 && state.width <= 600) {
          this.panelWidth = state.width;
        }
        if (state.height >= 400 && state.height <= 900) {
          this.panelHeight = state.height;
        }
        if (state.x !== undefined && state.y !== undefined) {
          this.panelX = Math.max(0, Math.min(window.innerWidth - 100, state.x));
          this.panelY = Math.max(0, Math.min(window.innerHeight - 60, state.y));
        }
      } catch (e) {
        // If parsing fails, use defaults
        console.warn('Failed to parse saved panel state', e);
      }
    }
  }

  private savePanelState(): void {
    const state = {
      x: this.panelX,
      y: this.panelY,
      width: this.panelWidth,
      height: this.panelHeight
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  }
}
