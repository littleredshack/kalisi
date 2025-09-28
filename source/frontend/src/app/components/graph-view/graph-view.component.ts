import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="graph-view">
      <canvas #canvas class="graph-canvas" 
              (mousemove)="onMouseMove($event)"
              (click)="onCanvasClick($event)">
      </canvas>
      <div class="graph-info">
        <h4>Graph View</h4>
        <p>Nodes: {{ nodes.length }}</p>
        <p>Relationships: {{ edges.length }}</p>
        <div *ngIf="selectedNode" class="selected-info">
          <strong>Selected: {{ selectedNode.label }}</strong>
          <p>Type: {{ selectedNode.type }}</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .graph-view {
      position: relative;
      width: 100%;
      height: 100%;
      background:
        radial-gradient(1200px 800px at 20% 20%, rgba(36,56,99,.25), transparent),
        radial-gradient(1000px 600px at 80% 80%, rgba(24,96,128,.18), transparent),
        #0b0f14;
      color: #e6edf3;
    }
    
    .graph-canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    
    .graph-info {
      position: absolute;
      top: 16px;
      left: 16px;
      background: rgba(9, 15, 22, 0.9);
      border: 1px solid rgba(110, 168, 254, 0.2);
      border-radius: 8px;
      padding: 12px;
      min-width: 160px;
    }
    
    .graph-info h4 {
      margin: 0 0 8px 0;
      color: #6ea8fe;
      font-family: 'Orbitron', sans-serif;
    }
    
    .graph-info p {
      margin: 4px 0;
      font-size: 14px;
    }
    
    .selected-info {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(110, 168, 254, 0.2);
    }
  `]
})
export class GraphViewComponent implements OnInit, OnDestroy {
  @Input() nodes: GraphNode[] = [];
  @Input() edges: GraphEdge[] = [];
  
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animationId = 0;
  selectedNode: GraphNode | null = null;

  ngOnInit() {
    setTimeout(() => {
      this.canvas = document.querySelector('.graph-canvas') as HTMLCanvasElement;
      if (this.canvas) {
        this.ctx = this.canvas.getContext('2d')!;
        this.resize();
        this.animate();
        window.addEventListener('resize', this.resize);
      }
    }, 100);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resize);
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private resize = () => {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  };

  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // No canvas background drawing - using CSS background that matches landing page exactly

    // Draw edges
    this.ctx.strokeStyle = 'rgba(110, 168, 254, 0.6)';
    this.ctx.lineWidth = 2;
    
    for (const edge of this.edges) {
      const fromNode = this.nodes.find(n => n.id === edge.from);
      const toNode = this.nodes.find(n => n.id === edge.to);
      
      if (fromNode && toNode) {
        this.ctx.beginPath();
        this.ctx.moveTo(fromNode.x, fromNode.y);
        this.ctx.lineTo(toNode.x, toNode.y);
        this.ctx.stroke();
      }
    }

    // Draw nodes
    for (const node of this.nodes) {
      // Node circle
      this.ctx.fillStyle = this.selectedNode?.id === node.id 
        ? 'rgba(110, 168, 254, 1.0)' 
        : 'rgba(110, 168, 254, 0.8)';
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
      this.ctx.fill();

      // Node label
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = '12px "Inter", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(node.label, node.x, node.y - 30);
    }
  };

  onMouseMove(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find node under cursor
    const hoveredNode = this.nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 25;
    });
    
    this.canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
  }

  onCanvasClick(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Find clicked node
    const clickedNode = this.nodes.find(node => {
      const dx = node.x - x;
      const dy = node.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 25;
    });
    
    this.selectedNode = clickedNode || null;
  }
}