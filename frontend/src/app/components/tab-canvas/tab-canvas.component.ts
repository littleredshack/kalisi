import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { TabManagerService, Tab } from '../../core/services/tab-manager.service';
import { CanvasService, CanvasData, CanvasNode, CanvasEdge } from '../../core/services/canvas.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

// Canvas interfaces imported from CanvasService

@Component({
  selector: 'app-tab-canvas',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    FormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatSnackBarModule
  ],
  template: `
    <div class="tab-canvas-container">
      <!-- Canvas for each tab -->
      <canvas 
        #canvas
        class="tab-canvas"
        [width]="canvasWidth"
        [height]="canvasHeight"
        (mousedown)="onMouseDown($event)"
        (mousemove)="onMouseMove($event)"
        (mouseup)="onMouseUp($event)"
        (wheel)="onWheel($event)"
        (dblclick)="onDoubleClick($event)">
      </canvas>
      
      <!-- Canvas Controls -->
      <div class="canvas-controls">
        <button mat-mini-fab (click)="zoomIn()" matTooltip="Zoom In">
          <mat-icon>zoom_in</mat-icon>
        </button>
        <button mat-mini-fab (click)="zoomOut()" matTooltip="Zoom Out">
          <mat-icon>zoom_out</mat-icon>
        </button>
        <button mat-mini-fab (click)="fitToScreen()" matTooltip="Fit to Screen">
          <mat-icon>fit_screen</mat-icon>
        </button>
        <button mat-mini-fab (click)="clearCanvas()" matTooltip="Clear Canvas">
          <mat-icon>clear</mat-icon>
        </button>
      </div>
      
      <!-- Node Editor (shown when node is selected) -->
      <div class="node-editor" *ngIf="selectedNode" [style.left.px]="nodeEditorPosition.x" [style.top.px]="nodeEditorPosition.y">
        <mat-form-field appearance="outline">
          <mat-label>Node Label</mat-label>
          <input matInput [(ngModel)]="selectedNode.label" (input)="updateNodeLabel()">
        </mat-form-field>
        <button mat-icon-button (click)="deleteNode()" color="warn">
          <mat-icon>delete</mat-icon>
        </button>
      </div>
      
      <!-- Tab Info Overlay -->
      <div class="tab-info">
        <span class="tab-name">{{ currentTab?.name }}</span>
        <span class="tab-type">{{ currentTab?.canvasType }}</span>
      </div>
    </div>
  `,
  styles: [`
    .tab-canvas-container {
      position: relative;
      width: 100%;
      height: 100%;
      background: #1a1a2e;
      overflow: hidden;
    }
    
    .tab-canvas {
      position: absolute;
      top: 0;
      left: 0;
      cursor: crosshair;
      background: #16213e;
    }
    
    .tab-canvas.dragging {
      cursor: move;
    }
    
    .canvas-controls {
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 10;
    }
    
    .node-editor {
      position: absolute;
      background: white;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .node-editor mat-form-field {
      margin: 0;
    }
    
    .tab-info {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      z-index: 5;
    }
    
    .tab-name {
      font-weight: 500;
    }
    
    .tab-type {
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
    }
  `]
})
export class TabCanvasComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() tabId!: string;
  @Output() nodeSelected = new EventEmitter<CanvasNode | null>();
  
  currentTab: Tab | null = null;
  canvasWidth = 800;
  canvasHeight = 600;
  
  private canvasData: CanvasData = {
    nodes: [],
    edges: [],
    transform: { x: 0, y: 0, scale: 1 }
  };
  
  selectedNode: CanvasNode | null = null;
  nodeEditorPosition = { x: 0, y: 0 };
  
  private isDragging = false;
  private lastMousePos = { x: 0, y: 0 };
  private ctx: CanvasRenderingContext2D | null = null;
  private destroy$ = new Subject<void>();
  private animationFrame: number | null = null;
  private saveDebounce$ = new Subject<void>();
  private lastSavedData: string = '';
  private debugLoggedOnce = false;
  
  constructor(
    private tabManager: TabManagerService,
    private canvasService: CanvasService,
    private snackBar: MatSnackBar
  ) {}
  
  ngOnInit(): void {
    console.log('TabCanvas: Component initialized for tabId:', this.tabId);
    
    // Subscribe to tab changes
    this.tabManager.tabState$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
      const tab = state.tabs.find(t => t.id === this.tabId);
      if (tab) {
        console.log('TabCanvas: Tab state updated:', tab.name, 'has data:', !!tab.data);
        this.currentTab = tab;
        this.loadTabData();
      }
    });
    
    // Set up auto-save with debounce
    this.saveDebounce$.pipe(
      debounceTime(2000), // Wait 2 seconds after last change
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.persistCanvasToNeo4j();
    });
  }
  
  ngAfterViewInit(): void {
    // Wait for the DOM to be fully rendered
    setTimeout(() => {
      this.resizeCanvas();
      this.initCanvas();
      this.startRenderLoop();
    }, 0);
    
    window.addEventListener('resize', () => this.resizeCanvas());
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    window.removeEventListener('resize', () => this.resizeCanvas());
  }
  
  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d');
  }
  
  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement;
    
    if (container) {
      // Get container dimensions
      const rect = container.getBoundingClientRect();
      this.canvasWidth = Math.max(rect.width || container.clientWidth || 800, 800);
      this.canvasHeight = Math.max(rect.height || container.clientHeight || 600, 600);
      
      console.log('TabCanvas: Resizing canvas to:', this.canvasWidth, 'x', this.canvasHeight);
      console.log('TabCanvas: Container dimensions:', rect.width, rect.height);
      
      // Update canvas element size
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
      canvas.style.width = this.canvasWidth + 'px';
      canvas.style.height = this.canvasHeight + 'px';
    } else {
      // Fallback dimensions
      this.canvasWidth = 800;
      this.canvasHeight = 600;
      canvas.width = this.canvasWidth;
      canvas.height = this.canvasHeight;
      canvas.style.width = this.canvasWidth + 'px';
      canvas.style.height = this.canvasHeight + 'px';
      console.log('TabCanvas: Using fallback dimensions:', this.canvasWidth, 'x', this.canvasHeight);
    }
  }
  
  private startRenderLoop(): void {
    const render = () => {
      this.renderCanvas();
      this.animationFrame = requestAnimationFrame(render);
    };
    render();
  }
  
  private renderCanvas(): void {
    if (!this.ctx) return;
    
    // Clear canvas
    this.ctx.fillStyle = '#16213e';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    
    // Apply transform
    this.ctx.save();
    this.ctx.translate(this.canvasData.transform.x, this.canvasData.transform.y);
    this.ctx.scale(this.canvasData.transform.scale, this.canvasData.transform.scale);
    
    // Draw grid
    this.drawGrid();
    
    // Debug logging (only once)
    if (this.canvasData.nodes.length > 0 && !this.debugLoggedOnce) {
      console.log('TabCanvas: Rendering', this.canvasData.nodes.length, 'nodes and', this.canvasData.edges.length, 'edges');
      console.log('TabCanvas: Canvas size:', this.canvasWidth, 'x', this.canvasHeight);
      console.log('TabCanvas: Transform:', this.canvasData.transform);
      console.log('TabCanvas: First node position:', this.canvasData.nodes[0].x, this.canvasData.nodes[0].y);
      console.log('TabCanvas: Canvas element:', this.canvasRef?.nativeElement);
      this.debugLoggedOnce = true;
    }
    
    // Draw edges
    this.canvasData.edges.forEach(edge => this.drawEdge(edge));
    
    // Draw nodes
    this.canvasData.nodes.forEach(node => this.drawNode(node));
    
    this.ctx.restore();
  }
  
  private drawGrid(): void {
    if (!this.ctx) return;
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.lineWidth = 1;
    
    const gridSize = 50;
    const startX = -this.canvasData.transform.x / this.canvasData.transform.scale;
    const startY = -this.canvasData.transform.y / this.canvasData.transform.scale;
    const endX = startX + this.canvasWidth / this.canvasData.transform.scale;
    const endY = startY + this.canvasHeight / this.canvasData.transform.scale;
    
    for (let x = Math.floor(startX / gridSize) * gridSize; x < endX; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, startY);
      this.ctx.lineTo(x, endY);
      this.ctx.stroke();
    }
    
    for (let y = Math.floor(startY / gridSize) * gridSize; y < endY; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(startX, y);
      this.ctx.lineTo(endX, y);
      this.ctx.stroke();
    }
  }
  
  private drawNode(node: CanvasNode): void {
    if (!this.ctx) return;
    
    // Draw node circle
    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, 30, 0, Math.PI * 2);
    this.ctx.fillStyle = node === this.selectedNode ? '#4CAF50' : '#2196F3';
    this.ctx.fill();
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    // Draw label
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(node.label, node.x, node.y);
  }
  
  private drawEdge(edge: CanvasEdge): void {
    if (!this.ctx) return;
    
    const sourceNode = this.canvasData.nodes.find(n => n.id === edge.source);
    const targetNode = this.canvasData.nodes.find(n => n.id === edge.target);
    
    if (!sourceNode || !targetNode) return;
    
    this.ctx.beginPath();
    this.ctx.moveTo(sourceNode.x, sourceNode.y);
    this.ctx.lineTo(targetNode.x, targetNode.y);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    // Draw arrow
    const angle = Math.atan2(targetNode.y - sourceNode.y, targetNode.x - sourceNode.x);
    const arrowLength = 15;
    const arrowAngle = Math.PI / 6;
    
    const arrowX = targetNode.x - Math.cos(angle) * 30;
    const arrowY = targetNode.y - Math.sin(angle) * 30;
    
    this.ctx.beginPath();
    this.ctx.moveTo(arrowX, arrowY);
    this.ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle - arrowAngle),
      arrowY - arrowLength * Math.sin(angle - arrowAngle)
    );
    this.ctx.moveTo(arrowX, arrowY);
    this.ctx.lineTo(
      arrowX - arrowLength * Math.cos(angle + arrowAngle),
      arrowY - arrowLength * Math.sin(angle + arrowAngle)
    );
    this.ctx.stroke();
  }
  
  onMouseDown(event: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.canvasData.transform.x) / this.canvasData.transform.scale;
    const y = (event.clientY - rect.top - this.canvasData.transform.y) / this.canvasData.transform.scale;
    
    // Check if clicking on a node
    const clickedNode = this.canvasData.nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 30;
    });
    
    if (clickedNode) {
      this.selectedNode = clickedNode;
      this.nodeEditorPosition = {
        x: event.clientX - rect.left + 10,
        y: event.clientY - rect.top - 50
      };
      
      // Emit node selection for property display
      this.nodeSelected.emit(clickedNode);
    } else {
      this.selectedNode = null;
      this.isDragging = true;
      this.lastMousePos = { x: event.clientX, y: event.clientY };
      
      // Clear node selection
      this.nodeSelected.emit(null);
    }
  }
  
  onMouseMove(event: MouseEvent): void {
    if (this.isDragging) {
      const dx = event.clientX - this.lastMousePos.x;
      const dy = event.clientY - this.lastMousePos.y;
      
      this.canvasData.transform.x += dx;
      this.canvasData.transform.y += dy;
      
      this.lastMousePos = { x: event.clientX, y: event.clientY };
      this.saveTabData();
    }
  }
  
  onMouseUp(event: MouseEvent): void {
    this.isDragging = false;
  }
  
  onWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Zoom towards mouse position
    const newScale = this.canvasData.transform.scale * scaleFactor;
    if (newScale >= 0.1 && newScale <= 5) {
      this.canvasData.transform.x = mouseX - (mouseX - this.canvasData.transform.x) * scaleFactor;
      this.canvasData.transform.y = mouseY - (mouseY - this.canvasData.transform.y) * scaleFactor;
      this.canvasData.transform.scale = newScale;
      this.saveTabData();
    }
  }
  
  onDoubleClick(event: MouseEvent): void {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.canvasData.transform.x) / this.canvasData.transform.scale;
    const y = (event.clientY - rect.top - this.canvasData.transform.y) / this.canvasData.transform.scale;
    
    // Create new node
    const newNode: CanvasNode = {
      id: `node_${Date.now()}`,
      x,
      y,
      label: `Node ${this.canvasData.nodes.length + 1}`,
      type: 'default'
    };
    
    this.canvasData.nodes.push(newNode);
    this.saveTabData();
  }
  
  zoomIn(): void {
    this.canvasData.transform.scale = Math.min(5, this.canvasData.transform.scale * 1.2);
    this.saveTabData();
  }
  
  zoomOut(): void {
    this.canvasData.transform.scale = Math.max(0.1, this.canvasData.transform.scale * 0.8);
    this.saveTabData();
  }
  
  fitToScreen(): void {
    if (this.canvasData.nodes.length === 0) {
      this.canvasData.transform = { x: 0, y: 0, scale: 1 };
      return;
    }
    
    // Calculate bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    this.canvasData.nodes.forEach(node => {
      minX = Math.min(minX, node.x - 30);
      minY = Math.min(minY, node.y - 30);
      maxX = Math.max(maxX, node.x + 30);
      maxY = Math.max(maxY, node.y + 30);
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 50;
    
    const scaleX = (this.canvasWidth - padding * 2) / width;
    const scaleY = (this.canvasHeight - padding * 2) / height;
    const scale = Math.min(scaleX, scaleY, 2);
    
    this.canvasData.transform.scale = scale;
    this.canvasData.transform.x = this.canvasWidth / 2 - (minX + width / 2) * scale;
    this.canvasData.transform.y = this.canvasHeight / 2 - (minY + height / 2) * scale;
    
    this.saveTabData();
  }
  
  clearCanvas(): void {
    if (confirm('Are you sure you want to clear the canvas? This cannot be undone.')) {
      this.canvasData = {
        nodes: [],
        edges: [],
        transform: { x: 0, y: 0, scale: 1 }
      };
      this.selectedNode = null;
      this.saveTabData();
    }
  }
  
  updateNodeLabel(): void {
    this.saveTabData();
  }
  
  deleteNode(): void {
    if (this.selectedNode) {
      // Remove node
      this.canvasData.nodes = this.canvasData.nodes.filter(n => n.id !== this.selectedNode!.id);
      
      // Remove connected edges
      this.canvasData.edges = this.canvasData.edges.filter(
        e => e.source !== this.selectedNode!.id && e.target !== this.selectedNode!.id
      );
      
      this.selectedNode = null;
      this.saveTabData();
    }
  }
  
  private loadTabData(): void {
    if (this.currentTab) {
      // For development, prioritize local tab data since API requires auth
      if (this.currentTab?.data) {
        // Use local tab data first
        this.canvasData = this.currentTab.data;
        this.lastSavedData = JSON.stringify(this.canvasData);
        console.log('TabCanvas: Using local tab data:', this.canvasData);
        return;
      }
      
      // Try to load from Neo4j as fallback
      this.canvasService.loadCanvas(this.currentTab.id).subscribe(canvas => {
        if (canvas?.data) {
          this.canvasData = canvas.data;
          this.lastSavedData = JSON.stringify(this.canvasData);
          console.log('TabCanvas: Loaded data from service:', this.canvasData);
        } else {
          // Initialize with default data
          this.canvasData = {
            nodes: [],
            edges: [],
            transform: { x: 0, y: 0, scale: 1 }
          };
          console.log('TabCanvas: Using default empty data');
        }
      });
    }
  }
  
  private saveTabData(): void {
    if (this.currentTab) {
      // Update local tab data
      this.tabManager.updateTabData(this.currentTab.id, this.canvasData);
      
      // Trigger debounced save to Neo4j
      this.saveDebounce$.next();
    }
  }
  
  private persistCanvasToNeo4j(): void {
    if (!this.currentTab) return;
    
    // Check if data has actually changed
    const currentData = JSON.stringify(this.canvasData);
    if (currentData === this.lastSavedData) {
      return; // No changes to save
    }
    
    this.canvasService.saveOrUpdateCanvas(
      this.currentTab.id,
      this.currentTab.name,
      this.currentTab.canvasType,
      this.canvasData
    ).subscribe(response => {
      if (response.id) {
        this.lastSavedData = currentData;
        this.snackBar.open('Canvas saved', 'Close', {
          duration: 2000,
          horizontalPosition: 'right',
          verticalPosition: 'bottom'
        });
      }
    });
  }
}