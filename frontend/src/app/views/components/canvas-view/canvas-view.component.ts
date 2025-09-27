import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, takeUntil } from 'rxjs';

import { ViewsService } from '../../services/views.service';
import { GraphData, GraphNode, GraphEdge, Transform, Point } from '../../models/view.models';
import { CanvasRenderer } from '../../services/canvas-renderer.service';
import { PluginManager } from '../../services/plugin-manager.service';

@Component({
  selector: 'app-canvas-view',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  template: `
    <div class="canvas-container" #canvasContainer>
      <!-- Loading state -->
      <div *ngIf="isLoading" class="loading-overlay">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Loading view data...</p>
      </div>
      
      <!-- Error state -->
      <div *ngIf="errorMessage" class="error-overlay">
        <mat-icon class="error-icon">error_outline</mat-icon>
        <p>{{ errorMessage }}</p>
        <button mat-raised-button color="primary" (click)="retry()">
          Retry
        </button>
      </div>
      
      <!-- Canvas -->
      <canvas 
        #canvas 
        [width]="canvasWidth" 
        [height]="canvasHeight"
        [style.display]="isLoading || errorMessage ? 'none' : 'block'"
        (mousedown)="onMouseDown($event)"
        (mousemove)="onMouseMove($event)"
        (mouseup)="onMouseUp($event)"
        (wheel)="onWheel($event)"
        (contextmenu)="onRightClick($event)">
      </canvas>
      
      <!-- Canvas overlay for UI elements -->
      <div class="canvas-overlay" [style.display]="isLoading || errorMessage ? 'none' : 'block'">
        <!-- Zoom controls -->
        <div class="zoom-controls">
          <button mat-mini-fab (click)="zoomIn()" matTooltip="Zoom In">
            <mat-icon>zoom_in</mat-icon>
          </button>
          <button mat-mini-fab (click)="zoomOut()" matTooltip="Zoom Out">
            <mat-icon>zoom_out</mat-icon>
          </button>
          <button mat-mini-fab (click)="fitToScreen()" matTooltip="Fit to Screen">
            <mat-icon>fit_screen</mat-icon>
          </button>
        </div>
        
        <!-- Node info tooltip -->
        <div 
          *ngIf="hoveredNode" 
          class="node-tooltip"
          [style.left.px]="tooltipPosition.x"
          [style.top.px]="tooltipPosition.y">
          <div class="tooltip-header">
            <strong>{{ hoveredNode.label || hoveredNode.id }}</strong>
            <span class="node-type">{{ hoveredNode.type }}</span>
          </div>
          <div class="tooltip-content">
            <div *ngFor="let prop of getNodeProperties(hoveredNode)" class="property">
              <span class="prop-key">{{ prop.key }}:</span>
              <span class="prop-value">{{ prop.value }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .canvas-container {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #fafafa;
    }
    
    canvas {
      position: absolute;
      top: 0;
      left: 0;
      cursor: grab;
      border-radius: 4px;
    }
    
    canvas:active {
      cursor: grabbing;
    }
    
    .canvas-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
    }
    
    .loading-overlay, .error-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.9);
      z-index: 10;
    }
    
    .error-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #f44336;
      margin-bottom: 16px;
    }
    
    .zoom-controls {
      position: absolute;
      bottom: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: auto;
    }
    
    .node-tooltip {
      position: absolute;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 12px;
      border-radius: 8px;
      max-width: 300px;
      z-index: 1000;
      pointer-events: none;
      font-size: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    
    .tooltip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .node-type {
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
    }
    
    .tooltip-content {
      max-height: 200px;
      overflow-y: auto;
    }
    
    .property {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    
    .prop-key {
      font-weight: 500;
      margin-right: 8px;
      opacity: 0.8;
    }
    
    .prop-value {
      word-break: break-word;
      text-align: right;
      flex: 1;
    }
  `],
  providers: [CanvasRenderer, PluginManager]
})
export class CanvasViewComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasContainer') containerRef!: ElementRef<HTMLDivElement>;
  
  @Input() viewId!: string;
  @Input() query!: string;
  @Input() plugin!: string;

  canvasWidth = 800;
  canvasHeight = 600;
  isLoading = false;
  errorMessage = '';
  
  // Graph data
  private graphData: GraphData = { nodes: [], edges: [] };
  
  // Interaction state
  private isDragging = false;
  private lastMousePos: Point = { x: 0, y: 0 };
  private draggedNode: GraphNode | null = null;
  
  // Transform state
  private transform: Transform = { x: 0, y: 0, scale: 1 };
  
  // Tooltip state
  hoveredNode: GraphNode | null = null;
  tooltipPosition: Point = { x: 0, y: 0 };
  
  private destroy$ = new Subject<void>();
  private animationId: number | null = null;

  constructor(
    private viewsService: ViewsService,
    private renderer: CanvasRenderer,
    private pluginManager: PluginManager
  ) {}

  ngOnInit(): void {
    this.loadGraphData();
  }

  ngAfterViewInit(): void {
    this.initializeCanvas();
    this.setupResizeObserver();
    this.startRenderLoop();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private initializeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;
    
    // Set initial size
    this.updateCanvasSize();
    
    // Initialize renderer
    this.renderer.initialize(canvas);
    
    // Load plugin
    this.loadPlugin();
  }
  
  private setupResizeObserver(): void {
    let resizeTimeout: number;
    
    const resizeObserver = new ResizeObserver(() => {
      // Debounce resize events to prevent canvas redraw during transitions
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        this.updateCanvasSize();
      }, 100); // Wait 100ms after resize stops before updating canvas
    });
    
    resizeObserver.observe(this.containerRef.nativeElement);
  }
  
  private updateCanvasSize(): void {
    const container = this.containerRef.nativeElement;
    const rect = container.getBoundingClientRect();
    
    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;
    
    // Update canvas size with device pixel ratio for crisp rendering
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = this.canvasWidth * dpr;
      canvas.height = this.canvasHeight * dpr;
      canvas.style.width = `${this.canvasWidth}px`;
      canvas.style.height = `${this.canvasHeight}px`;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }
  }
  
  private startRenderLoop(): void {
    const render = () => {
      this.renderFrame();
      this.animationId = requestAnimationFrame(render);
    };
    render();
  }
  
  private renderFrame(): void {
    if (!this.renderer.isInitialized()) return;
    
    // Clear canvas
    this.renderer.clear();
    
    // Apply transform
    this.renderer.applyTransform(this.transform);
    
    // Render graph using plugin
    if (this.plugin) {
      const pluginInstance = this.pluginManager.getPlugin(this.plugin);
      if (pluginInstance && this.graphData) {
        pluginInstance.render(this.graphData, this.renderer);
      }
    }
    
    // Reset transform for UI elements
    this.renderer.resetTransform();
  }
  
  private loadPlugin(): void {
    // For now, use mock data since backend isn't implemented yet
    if (!this.plugin) {
      this.errorMessage = 'No plugin specified for this view';
      return;
    }
    
    if (this.plugin === 'basic-graph') {
      this.graphData = this.viewsService.getMockGraphData();
    }
  }
  
  private loadGraphData(): void {
    this.isLoading = true;
    this.errorMessage = '';
    
    // For development, use mock data
    setTimeout(() => {
      this.graphData = this.viewsService.getMockGraphData();
      this.isLoading = false;
    }, 1000);
    
    // TODO: Replace with actual API call when backend is ready
    /*
    this.viewsService.getViewData(this.viewId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.graphData = data;
          this.isLoading = false;
        },
        error: (error) => {
          this.errorMessage = 'Failed to load view data';
          this.isLoading = false;
        }
      });
    */
  }

  // Mouse event handlers
  onMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.lastMousePos = { x: event.clientX, y: event.clientY };
    
    // Check for node hit
    const canvasPos = this.screenToCanvas({ x: event.offsetX, y: event.offsetY });
    this.draggedNode = this.getNodeAt(canvasPos);
  }

  onMouseMove(event: MouseEvent): void {
    const currentPos = { x: event.clientX, y: event.clientY };
    
    if (this.isDragging) {
      const deltaX = currentPos.x - this.lastMousePos.x;
      const deltaY = currentPos.y - this.lastMousePos.y;
      
      if (this.draggedNode) {
        // Drag node
        this.draggedNode.x += deltaX / this.transform.scale;
        this.draggedNode.y += deltaY / this.transform.scale;
      } else {
        // Pan canvas
        this.transform.x += deltaX;
        this.transform.y += deltaY;
      }
    } else {
      // Update hover state
      const canvasPos = this.screenToCanvas({ x: event.offsetX, y: event.offsetY });
      const hoveredNode = this.getNodeAt(canvasPos);
      
      if (hoveredNode !== this.hoveredNode) {
        this.hoveredNode = hoveredNode;
        if (hoveredNode) {
          this.tooltipPosition = { x: event.clientX + 10, y: event.clientY - 10 };
        }
      }
    }
    
    this.lastMousePos = currentPos;
  }

  onMouseUp(event: MouseEvent): void {
    this.isDragging = false;
    this.draggedNode = null;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const mousePos = { x: event.offsetX, y: event.offsetY };
    
    this.zoomAt(mousePos, scaleFactor);
  }
  
  onRightClick(event: MouseEvent): void {
    event.preventDefault();
    // TODO: Show context menu
  }

  // Zoom and pan methods
  zoomIn(): void {
    const center = { x: this.canvasWidth / 2, y: this.canvasHeight / 2 };
    this.zoomAt(center, 1.2);
  }

  zoomOut(): void {
    const center = { x: this.canvasWidth / 2, y: this.canvasHeight / 2 };
    this.zoomAt(center, 0.8);
  }
  
  fitToScreen(): void {
    if (this.graphData.nodes.length === 0) return;
    
    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    this.graphData.nodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    });
    
    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const padding = 50;
    
    const scaleX = (this.canvasWidth - padding * 2) / graphWidth;
    const scaleY = (this.canvasHeight - padding * 2) / graphHeight;
    const scale = Math.min(scaleX, scaleY, 2); // Max zoom of 2x
    
    this.transform.scale = scale;
    this.transform.x = this.canvasWidth / 2 - (minX + graphWidth / 2) * scale;
    this.transform.y = this.canvasHeight / 2 - (minY + graphHeight / 2) * scale;
  }
  
  private zoomAt(point: Point, scaleFactor: number): void {
    const newScale = Math.max(0.1, Math.min(5, this.transform.scale * scaleFactor));
    
    if (newScale !== this.transform.scale) {
      const factor = newScale / this.transform.scale;
      
      this.transform.x = point.x - (point.x - this.transform.x) * factor;
      this.transform.y = point.y - (point.y - this.transform.y) * factor;
      this.transform.scale = newScale;
    }
  }
  
  private screenToCanvas(screenPos: Point): Point {
    return {
      x: (screenPos.x - this.transform.x) / this.transform.scale,
      y: (screenPos.y - this.transform.y) / this.transform.scale
    };
  }
  
  private getNodeAt(canvasPos: Point): GraphNode | null {
    for (const node of this.graphData.nodes) {
      const dx = canvasPos.x - node.x;
      const dy = canvasPos.y - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= (node.radius || 20)) {
        return node;
      }
    }
    return null;
  }
  
  getNodeProperties(node: GraphNode): Array<{key: string, value: any}> {
    return Object.entries(node.properties || {})
      .map(([key, value]) => ({ key, value }))
      .slice(0, 10); // Limit to 10 properties
  }
  
  retry(): void {
    this.loadGraphData();
  }
}