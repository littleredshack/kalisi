import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GSRendererService } from '../../../core/services/gs-renderer.service';

// =============================================================================
// UNIFIED APP CANVAS COMPONENT
// Single canvas component for the main application (not demo)
// Handles Systems, Processes, and other business views
// =============================================================================

export interface CanvasConfig {
  viewType: 'systems' | 'processes' | 'shared';
  showControls?: boolean;
  enableInteractions?: boolean;
}

@Component({
  selector: 'app-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-canvas-container">
      <canvas 
        #appCanvas 
        class="app-canvas"
        [class.interactive]="config.enableInteractions">
      </canvas>
      
      <div class="canvas-controls" *ngIf="config?.showControls">
        <div class="view-type">{{ config.viewType | titlecase }} View</div>
        <div class="interaction-help" *ngIf="config?.enableInteractions">
          <p>Click entities to select/drag • Click empty space to pan • Mouse wheel to zoom</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .app-canvas-container {
      width: 100%;
      height: 100%;
      position: relative;
      display: flex;
      flex-direction: column;
      background: var(--color-background);
      border-radius: 8px;
    }
    
    .app-canvas {
      flex: 1;
      cursor: default;
      background: transparent;
    }
    
    .app-canvas.interactive {
      cursor: crosshair;
    }
    
    .canvas-controls {
      padding: 12px;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      font-size: 12px;
    }
    
    .view-type {
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: 4px;
    }
    
    .interaction-help {
      color: var(--color-text-secondary);
    }
    
    .interaction-help p {
      margin: 0;
    }
  `]
})
export class AppCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('appCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() config: CanvasConfig = { viewType: 'shared', showControls: true, enableInteractions: true };

  constructor(private gsRenderer: GSRendererService) {}

  ngAfterViewInit(): void {
    if (this.canvasRef?.nativeElement) {
      this.initializeCanvas();
    }
  }

  ngOnDestroy(): void {
    // Cleanup renderer if needed
  }

  private async initializeCanvas(): Promise<void> {
    try {
      const canvas = this.canvasRef.nativeElement;
      
      // Initialize renderer with view-specific data
      this.gsRenderer.initializeRenderer('app-canvas', canvas);
      
      // Load data based on view type
      await this.loadViewData();
      
      console.log(`App Canvas initialized for ${this.config.viewType} view`);
    } catch (error) {
      console.error('Failed to initialize App Canvas:', error);
    }
  }

  private async loadViewData(): Promise<void> {
    // Load appropriate data based on config.viewType
    switch (this.config.viewType) {
      case 'systems':
        // Load systems data
        break;
      case 'processes':
        // Load processes data
        break;
      case 'shared':
        // Load shared/default data
        break;
    }
  }
}