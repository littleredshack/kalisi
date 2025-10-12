import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CanvasEventHubService } from './canvas-event-hub.service';
import { LayoutModuleRegistry } from '../../shared/layouts/layout-module-registry';

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
  getCanvasId(): string;
  getAvailableLayoutEngines(): string[];
  getActiveLayoutEngine(): string | null;
  switchLayoutEngine(engineName: string): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface LayoutEngineOption {
  readonly id: string;
  readonly label: string;
  readonly runtimeEngine: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
}

@Injectable({ providedIn: 'root' })
export class CanvasControlService {
  private activeCanvas: CanvasController | null = null;
  private activeCanvasId: string | null = null;

  private readonly cameraInfoSubject = new BehaviorSubject<CameraInfo>({ x: 0, y: 0, zoom: 1 });
  private readonly availableLevelsSubject = new BehaviorSubject<number[]>([]);
  private readonly autoLayoutStateSubject = new BehaviorSubject<string>('Auto Layout: OFF');
  private readonly hasActiveCanvasSubject = new BehaviorSubject<boolean>(false);
  private readonly layoutEnginesSubject = new BehaviorSubject<LayoutEngineOption[]>([]);
  private readonly activeLayoutEngineSubject = new BehaviorSubject<LayoutEngineOption | null>(null);
  private readonly activeCanvasIdSubject = new BehaviorSubject<string | null>(null);
  private readonly canUndoSubject = new BehaviorSubject<boolean>(false);
  private readonly canRedoSubject = new BehaviorSubject<boolean>(false);

  readonly cameraInfo$ = this.cameraInfoSubject.asObservable();
  readonly availableLevels$ = this.availableLevelsSubject.asObservable();
  readonly autoLayoutState$ = this.autoLayoutStateSubject.asObservable();
  readonly hasActiveCanvas$ = this.hasActiveCanvasSubject.asObservable();
  readonly layoutEngines$ = this.layoutEnginesSubject.asObservable();
  readonly activeLayoutEngine$ = this.activeLayoutEngineSubject.asObservable();
  readonly activeCanvasId$ = this.activeCanvasIdSubject.asObservable();
  readonly canUndo$ = this.canUndoSubject.asObservable();
  readonly canRedo$ = this.canRedoSubject.asObservable();

  constructor(private readonly canvasEventHubService: CanvasEventHubService) {}

  registerCanvas(canvas: CanvasController): void {
    this.activeCanvas = canvas;
    this.activeCanvasId = canvas.getCanvasId();
    this.hasActiveCanvasSubject.next(true);
    this.activeCanvasIdSubject.next(this.activeCanvasId);
    this.canvasEventHubService.setActiveCanvasId(this.activeCanvasId);
    this.updateState();
  }

  unregisterCanvas(): void {
    this.activeCanvas = null;
    this.activeCanvasId = null;
    this.hasActiveCanvasSubject.next(false);
    this.cameraInfoSubject.next({ x: 0, y: 0, zoom: 1 });
    this.availableLevelsSubject.next([]);
    this.autoLayoutStateSubject.next('Auto Layout: OFF');
    this.layoutEnginesSubject.next([]);
    this.activeLayoutEngineSubject.next(null);
    this.activeCanvasIdSubject.next(null);
    this.canUndoSubject.next(false);
    this.canRedoSubject.next(false);
    this.canvasEventHubService.setActiveCanvasId(null);
  }

  resetCanvas(): void {
    this.activeCanvas?.onResetClick();
    this.updateState();
  }

  async saveLayout(): Promise<void> {
    if (this.activeCanvas) {
      await this.activeCanvas.onSaveClick();
    }
  }

  toggleAutoLayout(): void {
    this.activeCanvas?.onToggleCollapseBehavior();
    this.updateState();
  }

  collapseToLevel(level: number): void {
    if (!this.activeCanvas) {
      return;
    }
    const mockEvent = { target: { value: level.toString() } } as any as Event;
    this.activeCanvas.onLevelSelect(mockEvent);
    this.updateState();
  }

  changeLayoutEngine(engineName: string): void {
    if (!this.activeCanvas) {
      return;
    }
    const option = this.resolveEngineOption(engineName);
    if (option) {
      this.activeLayoutEngineSubject.next(option);
    }

    const canvasId = this.getActiveCanvasId();
    if (canvasId) {
      this.canvasEventHubService.emitEvent(canvasId, {
        type: 'EngineSwitched',
        engineName,
        previousEngineName: this.activeCanvas.getActiveLayoutEngine() ?? undefined,
        canvasId,
        source: 'user',
        timestamp: Date.now()
      });
    } else {
      this.activeCanvas.switchLayoutEngine(engineName);
      this.updateState();
    }
  }

  undo(): void {
    this.activeCanvas?.undo();
    this.updateState();
  }

  redo(): void {
    this.activeCanvas?.redo();
    this.updateState();
  }

  updateCameraInfo(info: CameraInfo): void {
    this.cameraInfoSubject.next(info);
  }

  updateAvailableLevels(levels: number[]): void {
    this.availableLevelsSubject.next(levels);
  }

  getActiveCanvasId(): string | null {
    return this.activeCanvasId;
  }

  private updateState(): void {
    if (!this.activeCanvas) {
      return;
    }

    const cameraInfo = this.activeCanvas.getCameraInfo();
    this.cameraInfoSubject.next(cameraInfo);

    const levels = this.activeCanvas.getAvailableLevels();
    this.availableLevelsSubject.next(levels);

    this.autoLayoutStateSubject.next(this.activeCanvas.getCollapseBehaviorLabel());
    const engineOptions = this.resolveEngineOptions(this.activeCanvas.getAvailableLayoutEngines());
    this.layoutEnginesSubject.next(engineOptions);
    this.activeLayoutEngineSubject.next(this.resolveEngineOption(this.activeCanvas.getActiveLayoutEngine()));
    this.canUndoSubject.next(this.activeCanvas.canUndo());
    this.canRedoSubject.next(this.activeCanvas.canRedo());
  }

  notifyStateChange(): void {
    this.updateState();
  }

  private resolveEngineOptions(engineIds: string[]): LayoutEngineOption[] {
    return engineIds.map(id => this.resolveEngineOption(id) ?? this.fallbackOption(id));
  }

  private resolveEngineOption(id: string | null): LayoutEngineOption | null {
    if (!id) {
      return null;
    }
    const module = LayoutModuleRegistry.getModule(id);
    if (module) {
      return {
        id: module.id,
        label: module.label,
        runtimeEngine: module.runtimeEngine,
        description: module.description,
        tags: module.tags
      };
    }
    return this.fallbackOption(id);
  }

  private fallbackOption(id: string): LayoutEngineOption {
    return {
      id,
      label: this.formatLabel(id),
      runtimeEngine: 'containment-grid'
    };
  }

  private formatLabel(id: string): string {
    return id
      .split(/[-_]/g)
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }
}
