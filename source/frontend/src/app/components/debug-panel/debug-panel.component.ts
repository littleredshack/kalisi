import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-debug-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="debug-panel" 
         [class.open]="isOpen"
         [style.left.px]="position.x"
         [style.top.px]="position.y"
         [style.width.px]="size.width"
         [style.height.px]="size.height">
      
      <div class="panel-header"
           (mousedown)="startDrag($event)">
        <h3>Debug: View State</h3>
        <div class="header-controls">
          <button class="minimize-btn" (click)="toggleMinimized()" [title]="isMinimized ? 'Maximize' : 'Minimize'">
            <i class="pi" [class.pi-window-minimize]="!isMinimized" [class.pi-window-maximize]="isMinimized"></i>
          </button>
          <button class="close-btn" (click)="close()" title="Close">
            <i class="pi pi-times"></i>
          </button>
        </div>
      </div>

      <div class="panel-content" *ngIf="!isMinimized">
        <textarea 
          class="json-display"
          [value]="jsonData"
          readonly
          placeholder="No view state data available"></textarea>
      </div>

      <!-- Resize handles -->
      <div class="resize-handle resize-se" (mousedown)="startResize($event, 'se')"></div>
      <div class="resize-handle resize-e" (mousedown)="startResize($event, 'e')"></div>
      <div class="resize-handle resize-s" (mousedown)="startResize($event, 's')"></div>
    </div>
  `,
  styles: [`
    .debug-panel {
      position: fixed;
      background: #1a1a1a;
      border: 1px solid #3a3a3a;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      z-index: 1000;
      min-width: 300px;
      min-height: 200px;
      opacity: 0;
      transform: scale(0.9);
      transition: opacity 0.2s, transform 0.2s;
      pointer-events: none;
    }

    .debug-panel.open {
      opacity: 1;
      transform: scale(1);
      pointer-events: auto;
    }

    .panel-header {
      background: #2a2a2a;
      border-bottom: 1px solid #3a3a3a;
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
      user-select: none;
      border-radius: 7px 7px 0 0;
    }

    .panel-header h3 {
      margin: 0;
      color: #e0e0e0;
      font-size: 14px;
      font-weight: 600;
    }

    .header-controls {
      display: flex;
      gap: 4px;
    }

    .minimize-btn,
    .close-btn {
      background: transparent;
      border: none;
      color: #888;
      padding: 4px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .minimize-btn:hover {
      background: #3a3a3a;
      color: #ccc;
    }

    .close-btn:hover {
      background: #e74c3c;
      color: white;
    }

    .panel-content {
      padding: 12px;
      height: calc(100% - 48px);
    }

    .json-display {
      width: 100%;
      height: 100%;
      background: #0d1117;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      padding: 12px;
      color: #e6edf3;
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 11px;
      resize: none;
      overflow-y: auto;
      white-space: pre;
    }

    .resize-handle {
      position: absolute;
      background: transparent;
    }

    .resize-se {
      bottom: 0;
      right: 0;
      width: 12px;
      height: 12px;
      cursor: se-resize;
    }

    .resize-e {
      top: 12px;
      bottom: 12px;
      right: 0;
      width: 4px;
      cursor: e-resize;
    }

    .resize-s {
      bottom: 0;
      left: 12px;
      right: 12px;
      height: 4px;
      cursor: s-resize;
    }

    .resize-handle:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  `]
})
export class DebugPanelComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Input() jsonData = '';
  @Output() panelClosed = new EventEmitter<void>();

  position = { x: 100, y: 100 };
  size = { width: 400, height: 300 };
  isMinimized = false;

  // Drag state
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };

  // Resize state  
  private isResizing = false;
  private resizeHandle = '';
  private resizeStart = { x: 0, y: 0, width: 0, height: 0 };

  ngOnInit(): void {
    this.loadPanelState();
    this.setupEventListeners();
  }

  ngOnDestroy(): void {
    this.savePanelState();
    this.removeEventListeners();
  }

  close(): void {
    this.panelClosed.emit();
  }

  toggleMinimized(): void {
    this.isMinimized = !this.isMinimized;
    this.savePanelState();
  }

  startDrag(event: MouseEvent): void {
    this.isDragging = true;
    this.dragOffset = {
      x: event.clientX - this.position.x,
      y: event.clientY - this.position.y
    };
    event.preventDefault();
  }

  startResize(event: MouseEvent, handle: string): void {
    this.isResizing = true;
    this.resizeHandle = handle;
    this.resizeStart = {
      x: event.clientX,
      y: event.clientY,
      width: this.size.width,
      height: this.size.height
    };
    event.preventDefault();
    event.stopPropagation();
  }

  private onMouseMove = (event: MouseEvent) => {
    if (this.isDragging) {
      this.position = {
        x: Math.max(0, event.clientX - this.dragOffset.x),
        y: Math.max(0, event.clientY - this.dragOffset.y)
      };
    } else if (this.isResizing) {
      const deltaX = event.clientX - this.resizeStart.x;
      const deltaY = event.clientY - this.resizeStart.y;

      switch (this.resizeHandle) {
        case 'se':
          this.size = {
            width: Math.max(300, this.resizeStart.width + deltaX),
            height: Math.max(200, this.resizeStart.height + deltaY)
          };
          break;
        case 'e':
          this.size = {
            width: Math.max(300, this.resizeStart.width + deltaX),
            height: this.size.height
          };
          break;
        case 's':
          this.size = {
            width: this.size.width,
            height: Math.max(200, this.resizeStart.height + deltaY)
          };
          break;
      }
    }
  };

  private onMouseUp = () => {
    if (this.isDragging || this.isResizing) {
      this.savePanelState();
    }
    this.isDragging = false;
    this.isResizing = false;
  };

  private setupEventListeners(): void {
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  private removeEventListeners(): void {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }

  private loadPanelState(): void {
    const saved = localStorage.getItem('debug-panel-state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        this.position = state.position || this.position;
        this.size = state.size || this.size;
        this.isMinimized = state.isMinimized || false;
      } catch (error) {
        // Use defaults
      }
    }
  }

  private savePanelState(): void {
    const state = {
      position: this.position,
      size: this.size,
      isMinimized: this.isMinimized
    };
    localStorage.setItem('debug-panel-state', JSON.stringify(state));
  }
}