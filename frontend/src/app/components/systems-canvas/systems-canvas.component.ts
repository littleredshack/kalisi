import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CanvasFrameworkService, Entity } from '../../core/services/canvas-framework.service';

// =============================================================================
// SYSTEMS CANVAS COMPONENT
// Clean implementation using the new canvas framework
// =============================================================================

@Component({
  selector: 'app-systems-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="systems-canvas-container">
      <canvas 
        #systemsCanvas 
        class="systems-canvas">
      </canvas>
      <div class="view-info">
        <h4>Systems View</h4>
        <p>Click and drag the squares. Use mouse wheel to zoom.</p>
      </div>
    </div>
  `,
  styles: [`
    .systems-canvas-container {
      width: 100%;
      height: 100%;
      position: relative;
      display: flex;
      flex-direction: column;
    }
    
    .systems-canvas {
      flex: 1;
      cursor: default;
      background: transparent;
    }
    
    .view-info {
      padding: 10px;
      background: #fff3e0;
      border-top: 1px solid #ccc;
      font-size: 12px;
    }
    
    .view-info h4 {
      margin: 0 0 5px 0;
      color: #333;
    }
    
    .view-info p {
      margin: 0;
      color: #666;
    }
  `]
})
export class SystemsCanvasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('systemsCanvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private viewId = 'systems';

  constructor(
    private canvasFramework: CanvasFrameworkService
  ) {}

  async ngAfterViewInit(): Promise<void> {
    if (!this.canvasRef) {
      console.error('Systems Canvas: Canvas ref not found');
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    
    // Create systems-specific entities
    const systemsEntities: Entity[] = [
      {
        id: 'api-gateway',
        name: 'API Gateway',
        x: 0,
        y: -100,
        width: 140,
        height: 60,
        color: '#9C27B0',
        selected: false,
        dragging: false
      },
      {
        id: 'database',
        name: 'Neo4j Database',
        x: -120,
        y: 20,
        width: 100,
        height: 80,
        color: '#795548',
        selected: false,
        dragging: false
      },
      {
        id: 'redis-cache',
        name: 'Redis Cache',
        x: 120,
        y: 20,
        width: 100,
        height: 80,
        color: '#F44336',
        selected: false,
        dragging: false
      },
      {
        id: 'frontend',
        name: 'Angular Frontend',
        x: 0,
        y: 120,
        width: 160,
        height: 60,
        color: '#E91E63',
        selected: false,
        dragging: false
      }
    ];

    // Only create view if it doesn't exist (preserve existing state)
    let viewState = this.canvasFramework.getViewState(this.viewId);
    if (!viewState) {
      viewState = this.canvasFramework.createView(this.viewId, systemsEntities);
    }
    
    // Create renderer (always new for canvas element)
    this.canvasFramework.createRenderer(this.viewId, canvas);
    
    // Switch to this view
    this.canvasFramework.switchToView(this.viewId);
    
    // Systems canvas initialized
  }

  ngOnDestroy(): void {
    // Only dispose renderer, keep view state for persistence
    this.canvasFramework.disposeRenderer(this.viewId);
  }
}