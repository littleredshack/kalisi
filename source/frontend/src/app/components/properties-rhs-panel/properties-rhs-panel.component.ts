import { Component, EventEmitter, Output, Input, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { FormsModule } from '@angular/forms';
import { PropertiesPanelComponent } from '../properties-panel/properties-panel.component';
import { CanvasControlService, CameraInfo } from '../../core/services/canvas-control.service';
import { Observable, map } from 'rxjs';
import { CanvasEventHistoryComponent } from '../canvas-event-history/canvas-event-history.component';

@Component({
  selector: 'app-properties-rhs-panel',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TooltipModule,
    FormsModule,
    PropertiesPanelComponent,
    CanvasEventHistoryComponent
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
  layoutEngines$: Observable<string[]>;
  activeLayoutEngine$: Observable<string | null>;
  levelOptions$: Observable<any[]>;
  selectedLevel: number | null = null;

  constructor(private canvasControlService: CanvasControlService) {
    // Initialize observables from service
    this.hasActiveCanvas$ = this.canvasControlService.hasActiveCanvas$;
    this.cameraInfo$ = this.canvasControlService.cameraInfo$;
    this.availableLevels$ = this.canvasControlService.availableLevels$;
    this.autoLayoutState$ = this.canvasControlService.autoLayoutState$;
    this.canUndo$ = this.canvasControlService.canUndo$;
    this.canRedo$ = this.canvasControlService.canRedo$;
    this.layoutEngines$ = this.canvasControlService.layoutEngines$;
    this.activeLayoutEngine$ = this.canvasControlService.activeLayoutEngine$;

    // Transform levels array into dropdown options
    this.levelOptions$ = this.availableLevels$.pipe(
      map(levels => levels.map(level => ({
        label: `Level ${level}`,
        value: level
      })))
    );
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

  // Canvas control methods
  onReset(): void {
    this.canvasControlService.resetCanvas();
  }

  async onSave(): Promise<void> {
    await this.canvasControlService.saveLayout();
  }

  onToggleAutoLayout(): void {
    this.canvasControlService.toggleAutoLayout();
  }

  onUndo(): void {
    this.canvasControlService.undo();
  }

  onRedo(): void {
    this.canvasControlService.redo();
  }

  onCollapseLevel(level: number): void {
    if (level !== null && level !== undefined) {
      this.canvasControlService.collapseToLevel(level);
      // Reset dropdown after selection
      this.selectedLevel = null;
    }
  }

  onLayoutEngineChange(engineName: string): void {
    if (engineName) {
      this.canvasControlService.changeLayoutEngine(engineName);
    }
  }

  formatLayoutEngine(engine: string): string {
    return engine
      .split('-')
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }
}
