import { Observable, Subject } from 'rxjs';
import { LayoutResult } from './layout-contract';
import { NodeStyleOverrides, StyleApplicationScope } from '../../canvas/types';

export type CanvasEventSource = 'user' | 'system' | 'ai' | 'collaboration' | 'history';

export type CanvasEvent =
  | {
      readonly type: 'CollapseNode';
      readonly nodeId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
    }
  | {
      readonly type: 'ExpandNode';
      readonly nodeId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
    }
  | {
      readonly type: 'ResizeNode';
      readonly nodeId: string;
      readonly width: number;
      readonly height: number;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
    }
  | {
      readonly type: 'NodeMoved';
      readonly nodeId: string;
      readonly x: number;
      readonly y: number;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
    }
  | {
      readonly type: 'LayoutRequested';
      readonly engineName: string;
      readonly canvasId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
      readonly payload?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: 'LayoutApplied';
      readonly engineName: string;
      readonly canvasId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
      readonly result: LayoutResult;
    }
  | {
      readonly type: 'EngineSwitched';
      readonly engineName: string;
      readonly previousEngineName?: string;
      readonly canvasId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
    }
  | {
      readonly type: 'CameraChanged';
      readonly canvasId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
      readonly camera: {
        readonly x: number;
        readonly y: number;
        readonly zoom: number;
      };
    }
  | {
      readonly type: 'HistoryReplay';
      readonly canvasId: string;
      readonly sinceVersion: number;
      readonly untilVersion: number;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
    }
  | {
      readonly type: 'GraphLensChanged';
      readonly canvasId: string;
      readonly lensId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
    }
  | {
      readonly type: 'CollapseToLevel';
      readonly canvasId: string;
      readonly level: number;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
    }
  | {
      readonly type: 'PresetRequested';
      readonly canvasId: string;
      readonly presetId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
      readonly overrides?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: 'StyleOverrideRequested';
      readonly canvasId: string;
      readonly nodeId: string;
      readonly source: CanvasEventSource;
      readonly timestamp: number;
      readonly overrides: Partial<NodeStyleOverrides>;
      readonly scope?: StyleApplicationScope;
    };

export class CanvasEventBus {
  private readonly subject = new Subject<CanvasEvent>();

  get events$(): Observable<CanvasEvent> {
    return this.subject.asObservable();
  }

  emit(event: CanvasEvent): void {
    this.subject.next(event);
  }

  complete(): void {
    this.subject.complete();
  }
}
