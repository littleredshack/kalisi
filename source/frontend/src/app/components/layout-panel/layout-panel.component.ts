import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TooltipModule } from 'primeng/tooltip';
import { CanvasControlService } from '../../core/services/canvas-control.service';
import { Observable, Subscription } from 'rxjs';
import { NodeSelectionSnapshot } from '../../shared/canvas/types';

@Component({
  selector: 'app-layout-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TooltipModule
  ],
  templateUrl: './layout-panel.component.html',
  styleUrls: ['./layout-panel.component.scss']
})
export class LayoutPanelComponent implements OnInit, OnDestroy, OnChanges {
  @Input() isOpen = false;
  @Output() panelToggled = new EventEmitter<boolean>();

  // Panel state
  isVisible = false;
  panelWidth = 360;
  panelHeight = 400;
  panelX = 100;
  panelY = 100;

  dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  resizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeHandle = '';

  private readonly STORAGE_KEY = 'layout-panel-state';

  // Layout configuration observables
  readonly containmentMode$: Observable<'containers' | 'flat'>;
  readonly layoutMode$: Observable<'grid' | 'force'>;
  readonly edgeRouting$: Observable<'orthogonal' | 'straight'>;

  // Current values
  containmentMode: 'containers' | 'flat' = 'containers';
  layoutMode: 'grid' | 'force' = 'grid';
  edgeRouting: 'orthogonal' | 'straight' = 'orthogonal';

  // Per-node configuration
  selectedNode: NodeSelectionSnapshot | null = null;
  nodeContainmentMode: string = 'inherit';
  nodeLayoutStrategy: string = 'inherit';
  applyToDescendants = false;

  private selectionSubscription?: Subscription;

  constructor(private canvasControlService: CanvasControlService) {
    this.containmentMode$ = this.canvasControlService.containmentMode$;
    this.layoutMode$ = this.canvasControlService.layoutMode$;
    this.edgeRouting$ = this.canvasControlService.edgeRouting$;
  }

  ngOnInit(): void {
    this.loadPanelState();

    // Add global mouse event listeners
    document.addEventListener('mousemove', this.onGlobalMouseMove);
    document.addEventListener('mouseup', this.onGlobalMouseUp);
    document.addEventListener('keydown', this.onGlobalKeyDown);

    // Subscribe to configuration changes
    this.containmentMode$.subscribe(mode => {
      this.containmentMode = mode;
    });

    this.layoutMode$.subscribe(mode => {
      this.layoutMode = mode;
    });

    this.edgeRouting$.subscribe(mode => {
      this.edgeRouting = mode;
    });

    // Subscribe to node selection
    this.selectionSubscription = this.canvasControlService.selection$.subscribe(selection => {
      this.selectedNode = selection;
      this.updateNodeConfigState();
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.onGlobalMouseMove);
    document.removeEventListener('mouseup', this.onGlobalMouseUp);
    document.removeEventListener('keydown', this.onGlobalKeyDown);
    this.selectionSubscription?.unsubscribe();
  }

  private onGlobalKeyDown = (event: KeyboardEvent): void => {
    // Option-L (Alt-L) to toggle the panel
    if ((event.altKey || event.metaKey) && event.code === 'KeyL') {
      event.preventDefault();
      this.isVisible = !this.isVisible;
      this.isOpen = this.isVisible;
      this.panelToggled.emit(this.isVisible);
    }
  };

  ngOnChanges(changes: SimpleChanges): void {
    if ('isOpen' in changes) {
      if (this.isOpen && !this.isVisible) {
        this.isVisible = true;
      } else if (!this.isOpen && this.isVisible) {
        this.isVisible = false;
      }
    }
  }

  closePanel(): void {
    this.isVisible = false;
    this.isOpen = false;
    this.panelToggled.emit(false);
  }

  // Drag functionality
  onHeaderDragStart(event: MouseEvent): void {
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
      this.panelX = event.clientX - this.dragOffsetX;
      this.panelY = event.clientY - this.dragOffsetY;

      const maxX = window.innerWidth - 100;
      const maxY = window.innerHeight - 60;
      this.panelX = Math.max(0, Math.min(maxX, this.panelX));
      this.panelY = Math.max(0, Math.min(maxY, this.panelY));
    } else if (this.resizing) {
      const deltaX = event.clientX - this.resizeStartX;
      const deltaY = event.clientY - this.resizeStartY;

      switch (this.resizeHandle) {
        case 'right':
          this.panelWidth = Math.max(320, Math.min(600, this.resizeStartWidth + deltaX));
          break;
        case 'bottom':
          this.panelHeight = Math.max(300, Math.min(700, this.resizeStartHeight + deltaY));
          break;
        case 'bottom-right':
          this.panelWidth = Math.max(320, Math.min(600, this.resizeStartWidth + deltaX));
          this.panelHeight = Math.max(300, Math.min(700, this.resizeStartHeight + deltaY));
          break;
      }
    }
  };

  private onGlobalMouseUp = (): void => {
    if (this.resizing || this.dragging) {
      this.savePanelState();
    }
    this.resizing = false;
    this.dragging = false;
    this.resizeHandle = '';
  };

  private loadPanelState(): void {
    const savedState = localStorage.getItem(this.STORAGE_KEY);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.width >= 320 && state.width <= 600) {
          this.panelWidth = state.width;
        }
        if (state.height >= 300 && state.height <= 700) {
          this.panelHeight = state.height;
        }
        if (state.x !== undefined && state.y !== undefined) {
          this.panelX = Math.max(0, Math.min(window.innerWidth - 100, state.x));
          this.panelY = Math.max(0, Math.min(window.innerHeight - 60, state.y));
        }
      } catch (e) {
        console.warn('Failed to parse saved layout panel state', e);
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

  // Layout configuration methods
  onContainmentToggle(enabled: boolean): void {
    const mode: 'containers' | 'flat' = enabled ? 'containers' : 'flat';
    this.canvasControlService.setContainmentMode(mode);
  }

  onLayoutModeChange(mode: 'grid' | 'force'): void {
    this.canvasControlService.setLayoutMode(mode);
  }

  onEdgeRoutingChange(mode: 'orthogonal' | 'straight'): void {
    this.canvasControlService.setEdgeRouting(mode);
  }

  get containmentEnabled(): boolean {
    return this.containmentMode === 'containers';
  }

  // Per-node configuration methods
  hasNodeSelected(): boolean {
    const result = this.selectedNode?.kind === 'node';
    return result;
  }

  getSelectedNodeName(): string {
    if (this.selectedNode?.kind === 'node') {
      return this.selectedNode.text || this.selectedNode.label || this.selectedNode.id || 'Selected Node';
    }
    return 'No node selected';
  }

  private updateNodeConfigState(): void {
    if (this.selectedNode?.kind === 'node' && this.selectedNode.layoutConfig) {
      this.nodeContainmentMode = this.selectedNode.layoutConfig.renderStyle?.nodeMode || 'inherit';
      this.nodeLayoutStrategy = this.selectedNode.layoutConfig.layoutStrategy || 'inherit';
    } else {
      this.nodeContainmentMode = 'inherit';
      this.nodeLayoutStrategy = 'inherit';
    }
    this.applyToDescendants = false;
  }

  onNodeContainmentChange(mode: string): void {
    this.canvasControlService.setNodeContainmentMode(
      null,
      mode as 'container' | 'flat' | 'inherit',
      this.applyToDescendants
    );
  }

  onNodeLayoutStrategyChange(strategy: string): void {
    this.canvasControlService.setNodeLayoutStrategy(
      null,
      strategy as 'grid' | 'force' | 'tree' | 'manual' | 'inherit',
      this.applyToDescendants
    );
  }

  onClearNodeConfig(): void {
    this.canvasControlService.clearNodeConfig(null);
    this.applyToDescendants = false;
  }
}
