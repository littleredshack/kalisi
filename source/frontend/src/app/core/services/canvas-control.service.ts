import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface CameraInfo {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasController {
  onResetClick(): void;
  onSaveClick(): Promise<void>;
  onToggleCollapseBehavior(): void;
  onLevelSelect(event: Event): void;
  getAvailableLevels(): number[];
  getCameraInfo(): CameraInfo;
  getCollapseBehaviorLabel(): string;
}

@Injectable({
  providedIn: 'root'
})
export class CanvasControlService {
  private activeCanvas: CanvasController | null = null;

  // Observable state for UI binding
  private cameraInfoSubject = new BehaviorSubject<CameraInfo>({ x: 0, y: 0, zoom: 1 });
  private availableLevelsSubject = new BehaviorSubject<number[]>([]);
  private autoLayoutStateSubject = new BehaviorSubject<string>('Auto Layout: OFF');
  private hasActiveCanvasSubject = new BehaviorSubject<boolean>(false);

  public cameraInfo$ = this.cameraInfoSubject.asObservable();
  public availableLevels$ = this.availableLevelsSubject.asObservable();
  public autoLayoutState$ = this.autoLayoutStateSubject.asObservable();
  public hasActiveCanvas$ = this.hasActiveCanvasSubject.asObservable();

  constructor() {}

  registerCanvas(canvas: CanvasController): void {
    this.activeCanvas = canvas;
    this.hasActiveCanvasSubject.next(true);
    this.updateState();
  }

  unregisterCanvas(): void {
    this.activeCanvas = null;
    this.hasActiveCanvasSubject.next(false);
    this.cameraInfoSubject.next({ x: 0, y: 0, zoom: 1 });
    this.availableLevelsSubject.next([]);
    this.autoLayoutStateSubject.next('Auto Layout: OFF');
  }

  resetCanvas(): void {
    if (this.activeCanvas) {
      this.activeCanvas.onResetClick();
      this.updateState();
    }
  }

  async saveLayout(): Promise<void> {
    if (this.activeCanvas) {
      await this.activeCanvas.onSaveClick();
    }
  }

  toggleAutoLayout(): void {
    if (this.activeCanvas) {
      this.activeCanvas.onToggleCollapseBehavior();
      this.updateState();
    }
  }

  collapseToLevel(level: number): void {
    if (this.activeCanvas) {
      // Create a mock event with the target value
      const mockEvent = {
        target: { value: level.toString() }
      } as any as Event;

      this.activeCanvas.onLevelSelect(mockEvent);
      this.updateState();
    }
  }

  updateCameraInfo(info: CameraInfo): void {
    this.cameraInfoSubject.next(info);
  }

  updateAvailableLevels(levels: number[]): void {
    this.availableLevelsSubject.next(levels);
  }

  private updateState(): void {
    if (this.activeCanvas) {
      // Update camera info
      const cameraInfo = this.activeCanvas.getCameraInfo();
      this.cameraInfoSubject.next(cameraInfo);

      // Update available levels
      const levels = this.activeCanvas.getAvailableLevels();
      this.availableLevelsSubject.next(levels);

      // Update auto layout state
      const autoLayoutLabel = this.activeCanvas.getCollapseBehaviorLabel();
      this.autoLayoutStateSubject.next(autoLayoutLabel);
    }
  }

  // Call this when canvas state changes (e.g., after camera moves)
  notifyStateChange(): void {
    this.updateState();
  }
}