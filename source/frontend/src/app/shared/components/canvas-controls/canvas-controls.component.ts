import { Component, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ICameraController } from '../../canvas/camera-controller.interface';

@Component({
  selector: 'app-canvas-controls',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="zoom-controls">
      <label for="zoomSlider">Zoom:</label>
      <input type="range" id="zoomSlider"
             min="0.01" max="3" step="0.01"
             [value]="currentZoom"
             (input)="onZoomSliderChange($event)">
      <span class="zoom-display">{{(currentZoom * 100).toFixed(0)}}%</span>
    </div>
    <span class="camera-info">{{cameraInfo}}</span>
  `,
  styles: [`
    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-right: 20px;
    }

    .zoom-controls label {
      color: #b4b4b4;
      font-size: 12px;
      font-weight: 600;
    }

    .zoom-controls input[type="range"] {
      width: 120px;
      height: 4px;
      background: #4b5563;
      border-radius: 2px;
      outline: none;
    }

    .zoom-controls input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      background: #58a6ff;
      border-radius: 50%;
      cursor: pointer;
    }

    .zoom-display {
      color: #58a6ff;
      font-size: 11px;
      font-family: Monaco, monospace;
      min-width: 40px;
      text-align: right;
    }

    .camera-info {
      font-size: 12px;
      color: #a0a9b8;
      font-family: 'Monaco', monospace;
      min-width: 180px;
      text-align: right;
    }
  `]
})
export class CanvasControlsComponent {
  @Input() cameraController!: ICameraController;
  @Output() cameraChanged = new EventEmitter<void>();

  currentZoom = 1.0;
  cameraInfo = '';

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.updateCameraInfo();
  }

  onZoomSliderChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const zoomLevel = parseFloat(target.value);
    this.cameraController.setZoomLevel(zoomLevel);
    this.updateCameraInfo();
    this.cameraChanged.emit();
  }

  private updateCameraInfo(): void {
    if (this.cameraController) {
      this.currentZoom = this.cameraController.getZoomLevel();
      this.cameraInfo = this.cameraController.getDisplayInfo();
      this.cdr.detectChanges();
    }
  }

  // Method to be called externally when camera changes
  refresh(): void {
    this.updateCameraInfo();
  }
}