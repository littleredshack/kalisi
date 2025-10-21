import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CanvasEventHubService } from './canvas-event-hub.service';
import { LayoutModuleRegistry } from '../../shared/layouts/layout-module-registry';
import { GraphLensRegistry } from '../../shared/graph/lens-registry';
import { ViewPresetDescriptor, ViewPresetRegistry } from '../../shared/graph/view-presets';
import { ResolvedViewPreset } from '../../shared/canvas/presets/preset-manager';
import {
  CanvasData,
  NodeStyleOverrides,
  StyleApplicationScope,
  NodeStyleSnapshot,
  NodeSelectionSnapshot
} from '../../shared/canvas/types';
import { RuntimeViewConfig } from '../../shared/canvas/layout-runtime';

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
  switchLayoutEngine(engineName: string): Promise<CanvasData | null> | void;
  getActiveGraphLens?(): string | null;
  setGraphLens?(lensId: string): void;
  getAvailableGraphLenses?(): string[];
  setActivePreset?(presetId: string, overrides?: Partial<ViewPresetDescriptor> | null): void;
  getActivePreset?(): ResolvedViewPreset | null;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getSelectedNodeSnapshot?(): NodeSelectionSnapshot | null;
  applyNodeStyleOverride?(
    nodeId: string,
    overrides: Partial<NodeStyleOverrides>,
    scope: StyleApplicationScope
  ): void;
}

export interface LayoutEngineOption {
  readonly id: string;
  readonly label: string;
  readonly runtimeEngine: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
}

export interface GraphLensOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
}

export type CanvasSelectionSnapshot = NodeSelectionSnapshot;

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
  private readonly graphLensOptionsSubject = new BehaviorSubject<GraphLensOption[]>([]);
  private readonly activeGraphLensSubject = new BehaviorSubject<GraphLensOption | null>(null);
  private readonly activeCanvasIdSubject = new BehaviorSubject<string | null>(null);
  private readonly canUndoSubject = new BehaviorSubject<boolean>(false);
  private readonly canRedoSubject = new BehaviorSubject<boolean>(false);
  private readonly selectionSubject = new BehaviorSubject<CanvasSelectionSnapshot | null>(null);
  private readonly presetOptionsSubject = new BehaviorSubject<ReadonlyArray<ViewPresetDescriptor>>(ViewPresetRegistry.list());
  private readonly activePresetSubject = new BehaviorSubject<ResolvedViewPreset | null>(null);

  // Runtime view configuration observables
  private readonly containmentModeSubject = new BehaviorSubject<'containers' | 'flat'>('containers');
  private readonly layoutModeSubject = new BehaviorSubject<'grid' | 'force'>('grid');
  private readonly edgeRoutingSubject = new BehaviorSubject<'orthogonal' | 'straight'>('orthogonal');

  readonly cameraInfo$ = this.cameraInfoSubject.asObservable();
  readonly availableLevels$ = this.availableLevelsSubject.asObservable();
  readonly autoLayoutState$ = this.autoLayoutStateSubject.asObservable();
  readonly hasActiveCanvas$ = this.hasActiveCanvasSubject.asObservable();
  readonly layoutEngines$ = this.layoutEnginesSubject.asObservable();
  readonly activeLayoutEngine$ = this.activeLayoutEngineSubject.asObservable();
  readonly graphLensOptions$ = this.graphLensOptionsSubject.asObservable();
  readonly activeGraphLens$ = this.activeGraphLensSubject.asObservable();
  readonly activeCanvasId$ = this.activeCanvasIdSubject.asObservable();
  readonly canUndo$ = this.canUndoSubject.asObservable();
  readonly canRedo$ = this.canRedoSubject.asObservable();
  readonly selection$ = this.selectionSubject.asObservable();
  readonly presetOptions$ = this.presetOptionsSubject.asObservable();
  readonly activePreset$ = this.activePresetSubject.asObservable();

  // Runtime view configuration observables
  readonly containmentMode$ = this.containmentModeSubject.asObservable();
  readonly layoutMode$ = this.layoutModeSubject.asObservable();
  readonly edgeRouting$ = this.edgeRoutingSubject.asObservable();

  constructor(private readonly canvasEventHubService: CanvasEventHubService) {}

  registerCanvas(canvas: CanvasController): void {
    this.activeCanvas = canvas;
    this.activeCanvasId = canvas.getCanvasId();
    this.hasActiveCanvasSubject.next(true);
    this.activeCanvasIdSubject.next(this.activeCanvasId);
    this.canvasEventHubService.setActiveCanvasId(this.activeCanvasId);
    this.selectionSubject.next(null);
    this.activePresetSubject.next(this.activeCanvas.getActivePreset?.() ?? null);
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
    this.graphLensOptionsSubject.next([]);
    this.activeGraphLensSubject.next(null);
    this.activeCanvasIdSubject.next(null);
    this.canUndoSubject.next(false);
    this.canRedoSubject.next(false);
    this.selectionSubject.next(null);
    this.activePresetSubject.next(null);
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
    const canvasId = this.getActiveCanvasId();
    if (canvasId) {
      this.canvasEventHubService.emitEvent(canvasId, {
        type: 'CollapseToLevel',
        canvasId,
        level,
        source: 'user',
        timestamp: Date.now()
      });
    } else {
      const mockEvent = { target: { value: level.toString() } } as any as Event;
      this.activeCanvas.onLevelSelect(mockEvent);
      this.updateState();
    }
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
      const result = this.activeCanvas.switchLayoutEngine(engineName);
      Promise.resolve(result).then(() => this.updateState());
    }
  }

  changeGraphLens(lensId: string): void {
    if (!lensId) {
      return;
    }

    const option = this.resolveLensOption(lensId);
    if (option) {
      this.activeGraphLensSubject.next(option);
    }

    const canvasId = this.getActiveCanvasId();
    if (canvasId) {
      this.canvasEventHubService.emitEvent(canvasId, {
        type: 'GraphLensChanged',
        canvasId,
        lensId,
        source: 'user',
        timestamp: Date.now()
      });
    } else if (this.activeCanvas?.setGraphLens) {
      this.activeCanvas.setGraphLens(lensId);
      this.notifyStateChange();
    }
  }

  changePreset(presetId: string, overrides?: Partial<ViewPresetDescriptor> | null): void {
    if (!presetId) {
      return;
    }

    const canvasId = this.getActiveCanvasId();
    if (canvasId) {
      this.canvasEventHubService.emitEvent(canvasId, {
        type: 'PresetRequested',
        canvasId,
        presetId,
        overrides: overrides ?? undefined,
        source: 'user',
        timestamp: Date.now()
      });
    } else if (this.activeCanvas?.setActivePreset) {
      this.activeCanvas.setActivePreset(presetId, overrides ?? undefined);
      this.notifyStateChange();
    }
  }

  updatePresetPalette(palettePatch: Partial<Record<string, string>>): void {
    if (!palettePatch || Object.keys(palettePatch).length === 0) {
      return;
    }

    const active = this.activePresetSubject.value;
    if (!active) {
      return;
    }

    const existingOverrides = (active.overrides ?? null) as Partial<ViewPresetDescriptor> | null;
    const existingStyle = existingOverrides?.style ?? {};
    const existingPalette = (existingStyle.palette ?? {}) as Record<string, string>;

    const nextOverrides: Partial<ViewPresetDescriptor> = {
      ...(existingOverrides ?? {}),
      style: {
        ...existingStyle,
        palette: {
          ...existingPalette,
          ...palettePatch
        }
      }
    };

    this.changePreset(active.preset.id, nextOverrides);
  }

  resetPresetOverrides(): void {
    const active = this.activePresetSubject.value;
    if (!active) {
      return;
    }
    this.changePreset(active.preset.id, null);
  }

  undo(): void {
    this.activeCanvas?.undo();
    this.updateState();
  }

  redo(): void {
    this.activeCanvas?.redo();
    this.updateState();
  }

  setSelectionSnapshot(selection: CanvasSelectionSnapshot | null): void {
    this.selectionSubject.next(selection);
  }

  applyNodeStyleOverride(
    overrides: Partial<NodeStyleOverrides>,
    scope: StyleApplicationScope
  ): void {
    const selection = this.selectionSubject.value;
    if (!selection || selection.kind !== 'node') {
      return;
    }

    // If the canvas has the method, call it directly (used by RuntimeCanvas)
    // Otherwise, try to use the event hub (used by ModularCanvas with event-based architecture)
    if (this.activeCanvas?.applyNodeStyleOverride) {
      this.activeCanvas.applyNodeStyleOverride(selection.id, overrides, scope);
    } else {
      const canvasId = this.getActiveCanvasId();
      if (canvasId) {
        this.canvasEventHubService.emitEvent(canvasId, {
          type: 'StyleOverrideRequested',
          canvasId,
          nodeId: selection.id,
          overrides,
          scope,
          source: 'user',
          timestamp: Date.now()
        });
      }
    }
    this.refreshSelectionSnapshot();
  }

  /**
   * Set containment mode: 'containers' (nested) or 'flat' (independent nodes)
   */
  setContainmentMode(mode: 'containers' | 'flat'): void {
    this.containmentModeSubject.next(mode);
    this.publishRuntimeConfigUpdate();
  }

  /**
   * Set layout mode: 'grid' or 'force'
   */
  setLayoutMode(mode: 'grid' | 'force'): void {
    this.layoutModeSubject.next(mode);
    this.publishRuntimeConfigUpdate();
  }

  /**
   * Set edge routing: 'orthogonal' or 'straight'
   */
  setEdgeRouting(mode: 'orthogonal' | 'straight'): void {
    this.edgeRoutingSubject.next(mode);
    this.publishRuntimeConfigUpdate();
  }

  /**
   * Get current runtime view configuration
   */
  getRuntimeViewConfig(): RuntimeViewConfig {
    return {
      containmentMode: this.containmentModeSubject.value,
      layoutMode: this.layoutModeSubject.value,
      edgeRouting: this.edgeRoutingSubject.value
    };
  }

  /**
   * Publish runtime config update to event hub
   */
  private publishRuntimeConfigUpdate(): void {
    const canvasId = this.getActiveCanvasId();
    if (!canvasId) {
      return;
    }

    const config = this.getRuntimeViewConfig();
    this.canvasEventHubService.emitEvent(canvasId, {
      type: 'RuntimeConfigChanged',
      canvasId,
      config,
      source: 'user',
      timestamp: Date.now()
    });
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
    const lensIds = this.activeCanvas.getAvailableGraphLenses?.() ?? GraphLensRegistry.list().map(lens => lens.id);
    this.graphLensOptionsSubject.next(this.resolveLensOptions(lensIds));
    this.activeGraphLensSubject.next(this.resolveLensOption(this.activeCanvas.getActiveGraphLens?.() ?? null));
    this.canUndoSubject.next(this.activeCanvas.canUndo());
    this.canRedoSubject.next(this.activeCanvas.canRedo());
    this.activePresetSubject.next(this.activeCanvas.getActivePreset?.() ?? null);
    this.refreshSelectionSnapshot();
  }

  notifyStateChange(): void {
    this.updateState();
  }

  setActivePresetSnapshot(snapshot: ResolvedViewPreset | null): void {
    this.activePresetSubject.next(snapshot);
  }

  private refreshSelectionSnapshot(): void {
    if (this.activeCanvas?.getSelectedNodeSnapshot) {
      const snapshot = this.activeCanvas.getSelectedNodeSnapshot();
      this.selectionSubject.next(snapshot ?? null);
    } else {
      this.selectionSubject.next(null);
    }
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

  private resolveLensOptions(lensIds: string[]): GraphLensOption[] {
    if (!lensIds || lensIds.length === 0) {
      return GraphLensRegistry.list().map(lens => this.mapLensDescriptor(lens));
    }
    return lensIds.map(id => this.resolveLensOption(id) ?? this.mapLensDescriptor({ id, label: this.formatLabel(id) }));
  }

  private resolveLensOption(id: string | null): GraphLensOption | null {
    if (!id) {
      return null;
    }
    const descriptor = GraphLensRegistry.get(id);
    if (descriptor) {
      return this.mapLensDescriptor(descriptor);
    }
    return this.mapLensDescriptor({ id, label: this.formatLabel(id) });
  }

  private mapLensDescriptor(descriptor: { id: string; label: string; description?: string; tags?: ReadonlyArray<string> }): GraphLensOption {
    return {
      id: descriptor.id,
      label: descriptor.label,
      description: descriptor.description,
      tags: descriptor.tags
    };
  }
}
