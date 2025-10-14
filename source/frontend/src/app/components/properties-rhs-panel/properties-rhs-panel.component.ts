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
import { ResolvedViewPreset } from '../../shared/canvas/presets/preset-manager';

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
  panelWidth = 340; // Default width matching chat panel
  private resizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private readonly STORAGE_KEY = 'properties-panel-width';

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
  activePreset$: Observable<ResolvedViewPreset | null>;
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
      activePreset: this.activePreset$.pipe(startWith(null as ResolvedViewPreset | null))
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
    active: ResolvedViewPreset | null
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

  // Resize functionality - copied from chat panel
  onResizeStart(event: MouseEvent): void {
    this.resizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.panelWidth;
    event.preventDefault();
  }

  private onGlobalMouseMove = (event: MouseEvent): void => {
    if (!this.resizing) return;

    const deltaX = this.resizeStartX - event.clientX; // Reversed for right-side panel
    const newWidth = Math.max(280, Math.min(600, this.resizeStartWidth + deltaX));
    this.panelWidth = newWidth;
  };

  private onGlobalMouseUp = (): void => {
    if (this.resizing) {
      // Save width to localStorage when resize ends
      this.savePanelWidth();
    }
    this.resizing = false;
  };

  private loadPanelWidth(): void {
    const savedWidth = localStorage.getItem(this.STORAGE_KEY);
    if (savedWidth) {
      const width = parseInt(savedWidth, 10);
      // Validate the saved width is within acceptable bounds
      if (width >= 280 && width <= 600) {
        this.panelWidth = width;
      }
    }
  }

  private savePanelWidth(): void {
    localStorage.setItem(this.STORAGE_KEY, this.panelWidth.toString());
  }
}
