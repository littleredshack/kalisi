import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { CanvasEvent, CanvasEventBus } from '../../shared/layouts/core/layout-events';
import { NodeStyleOverrides, NodeShape } from '../../shared/canvas/types';
import { LayoutPriority } from '../../shared/layouts/core/layout-orchestrator';

const HISTORY_LIMIT = 500;
type PresetRequestedEvent = Extract<CanvasEvent, { readonly type: 'PresetRequested' }>;
type StyleOverrideRequestedEvent = Extract<CanvasEvent, { readonly type: 'StyleOverrideRequested' }>;

export interface LayoutMetricsEvent {
  readonly canvasId: string;
  readonly engineName: string;
  readonly durationMs?: number;
  readonly queueWaitMs?: number;
  readonly queueDepth?: number;
  readonly priority?: LayoutPriority;
  readonly timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class CanvasEventHubService {
  private readonly busMap = new Map<string, CanvasEventBus>();
  private readonly historyMap = new Map<string, CanvasEvent[]>();
  private readonly historySubjects = new Map<string, BehaviorSubject<CanvasEvent[]>>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly layoutMetricsSubject = new Subject<LayoutMetricsEvent>();
  private activeCanvasId: string | null = null;

  readonly layoutMetrics$ = this.layoutMetricsSubject.asObservable();

  registerCanvas(canvasId: string, eventBus: CanvasEventBus): void {
    this.unregisterCanvas(canvasId);
    this.busMap.set(canvasId, eventBus);

    const seedHistory = this.historyMap.get(canvasId) ?? [];
    const subject = this.ensureSubject(canvasId, seedHistory);

    const subscription = eventBus.events$.subscribe(event => {
      const history = this.historyMap.get(canvasId) ?? [];
      history.push(event);
      if (history.length > HISTORY_LIMIT) {
        history.splice(0, history.length - HISTORY_LIMIT);
      }
      this.historyMap.set(canvasId, history);
      subject.next([...history]);

       const metrics = this.extractLayoutMetrics(canvasId, event);
       if (metrics) {
         this.layoutMetricsSubject.next(metrics);
       }
    });

    this.subscriptions.set(canvasId, subscription);
  }

  unregisterCanvas(canvasId: string): void {
    this.subscriptions.get(canvasId)?.unsubscribe();
    this.subscriptions.delete(canvasId);
    this.busMap.delete(canvasId);
  }

  setActiveCanvasId(canvasId: string | null): void {
    this.activeCanvasId = canvasId;
  }

  getHistory$(canvasId: string): Observable<CanvasEvent[]> {
    return this.ensureSubject(canvasId).asObservable();
  }

  emitEvent(canvasId: string, event: CanvasEvent): void {
    const bus = this.busMap.get(canvasId);
    if (!bus) {
      console.warn(`[CanvasEventHub] emitEvent called for unregistered canvas "${canvasId}"`);
      return;
    }
    bus.emit({
      ...event,
      timestamp: event.timestamp ?? Date.now()
    });
  }

  processAssistantMessage(message: string, canvasId?: string): CanvasEvent[] {
    const targetCanvasId = canvasId ?? this.activeCanvasId;
    if (!targetCanvasId) {
      return [];
    }

    const events = this.extractEvents(message);
    const directives = this.extractPresetDirectives(message, targetCanvasId);
    directives.forEach(directive => {
      const exists = events.some(
        event => isPresetRequested(event) && event.presetId === directive.presetId
      );
      if (!exists) {
        events.push(directive);
      }
    });
    const styleDirectives = this.extractStyleOverrideDirectives(message, targetCanvasId);
    styleDirectives.forEach(directive => {
      events.push(directive);
    });
    events.forEach(event => this.emitEvent(targetCanvasId, event));
    return events;
  }

  private extractEvents(message: string): CanvasEvent[] {
    const events: CanvasEvent[] = [];
    const blockPattern = /```canvas-event\s*([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = blockPattern.exec(message)) !== null) {
      const payload = match[1].trim();
      try {
        const parsed = JSON.parse(payload);
        if (Array.isArray(parsed)) {
          parsed.forEach(item => this.pushIfCanvasEvent(events, item));
        } else {
          this.pushIfCanvasEvent(events, parsed);
        }
      } catch (error) {
        console.warn('[CanvasEventHub] Failed to parse canvas-event payload', { error, payload });
      }
    }
    return events;
  }

  private extractPresetDirectives(message: string, canvasId: string): PresetRequestedEvent[] {
    const directives: PresetRequestedEvent[] = [];
    const presetPattern = /\bpreset\s+([a-z0-9_-]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = presetPattern.exec(message)) !== null) {
      const presetId = match[1].toLowerCase();
      directives.push({
        type: 'PresetRequested',
        canvasId,
        presetId,
        source: 'ai',
        timestamp: Date.now()
      } satisfies PresetRequestedEvent);
    }
    return directives;
  }

  private extractStyleOverrideDirectives(message: string, canvasId: string): StyleOverrideRequestedEvent[] {
    const directives: StyleOverrideRequestedEvent[] = [];
    const stylePattern = /\bstyle\s+node\s+([a-z0-9-]+)\s+([^\n\r]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = stylePattern.exec(message)) !== null) {
      const nodeId = match[1];
      const tokenString = match[2] ?? '';
      const overrides = this.parseStyleOverrideTokens(tokenString);
      if (!overrides || Object.keys(overrides).length === 0) {
        continue;
      }
      directives.push({
        type: 'StyleOverrideRequested',
        canvasId,
        nodeId,
        overrides,
        scope: 'node',
        source: 'ai',
        timestamp: Date.now()
      } satisfies StyleOverrideRequestedEvent);
    }
    return directives;
  }

  private pushIfCanvasEvent(acc: CanvasEvent[], candidate: unknown): void {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }
    const event = candidate as Partial<CanvasEvent>;
    if (typeof event.type !== 'string') {
      return;
    }
    acc.push({
      ...(event as CanvasEvent),
      source: (event as any).source ?? 'ai',
      timestamp: typeof event.timestamp === 'number' ? event.timestamp : Date.now()
    });
  }

  private ensureSubject(canvasId: string, seed?: CanvasEvent[]): BehaviorSubject<CanvasEvent[]> {
    let subject = this.historySubjects.get(canvasId);
    if (!subject) {
      subject = new BehaviorSubject<CanvasEvent[]>(seed ?? []);
      this.historySubjects.set(canvasId, subject);
    }
    return subject;
  }

  private extractLayoutMetrics(canvasId: string, event: CanvasEvent): LayoutMetricsEvent | null {
    if (event.type !== 'LayoutApplied') {
      return null;
    }

    const diagnostics = event.result.diagnostics;
    if (!diagnostics) {
      return null;
    }

    const metrics = diagnostics.metrics ?? {};
    const queueWait = typeof metrics?.['queueWaitMs'] === 'number' ? metrics['queueWaitMs'] : undefined;
    const queueDepth = typeof metrics?.['queueDepth'] === 'number' ? metrics['queueDepth'] : undefined;
    const queuePriority = typeof metrics?.['queuePriority'] === 'number' ? metrics['queuePriority'] : undefined;

    return {
      canvasId,
      engineName: event.engineName,
      durationMs: diagnostics.durationMs,
      queueWaitMs: queueWait,
      queueDepth,
      priority: queuePriority !== undefined ? this.resolvePriority(queuePriority) : undefined,
      timestamp: event.timestamp
    };
  }

  private resolvePriority(weight: number): LayoutPriority {
    if (weight >= 3) {
      return 'critical';
    }
    if (weight === 2) {
      return 'high';
    }
    if (weight === 1) {
      return 'normal';
    }
    return 'low';
  }

  private parseStyleOverrideTokens(input: string): Partial<NodeStyleOverrides> | null {
    const overrides: Partial<NodeStyleOverrides> = {};
    const tokens = input
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean);
    tokens.forEach(token => {
      const [rawKey, rawValue] = token.split('=');
      if (!rawKey || rawValue === undefined) {
        return;
      }
      const key = rawKey.toLowerCase();
      const value = rawValue.trim();
      switch (key) {
        case 'fill':
        case 'color':
          overrides.fill = value;
          break;
        case 'stroke':
        case 'border':
          overrides.stroke = value;
          break;
        case 'icon':
          overrides.icon = value;
          break;
        case 'corner':
        case 'cornerradius':
        case 'radius': {
          const parsed = Number(value);
          if (!Number.isNaN(parsed)) {
            overrides.cornerRadius = parsed;
          }
          break;
        }
        case 'shape': {
          const lower = value.toLowerCase();
          if (isValidNodeShape(lower)) {
            overrides.shape = lower as NodeShape;
          }
          break;
        }
        case 'label':
        case 'labelvisible':
          overrides.labelVisible = value.toLowerCase() === 'true' || value === '1';
          break;
        default:
          break;
      }
    });
    return Object.keys(overrides).length > 0 ? overrides : null;
  }
}

function isPresetRequested(
  event: CanvasEvent
): event is Extract<CanvasEvent, { readonly type: 'PresetRequested' }> {
  return event.type === 'PresetRequested';
}

function isValidNodeShape(value: string): value is NodeShape {
  return value === 'rounded' || value === 'rectangle' || value === 'circle' || value === 'triangle';
}
