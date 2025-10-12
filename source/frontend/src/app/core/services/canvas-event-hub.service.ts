import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { CanvasEvent, CanvasEventBus } from '../../shared/layouts/core/layout-events';

const HISTORY_LIMIT = 500;

@Injectable({
  providedIn: 'root'
})
export class CanvasEventHubService {
  private readonly busMap = new Map<string, CanvasEventBus>();
  private readonly historyMap = new Map<string, CanvasEvent[]>();
  private readonly historySubjects = new Map<string, BehaviorSubject<CanvasEvent[]>>();
  private readonly subscriptions = new Map<string, Subscription>();
  private activeCanvasId: string | null = null;

  registerCanvas(canvasId: string, eventBus: CanvasEventBus): void {
    this.unregisterCanvas(canvasId);
    this.busMap.set(canvasId, eventBus);

    const history = this.historyMap.get(canvasId) ?? [];
    const subject = this.ensureSubject(canvasId, history);

    const subscription = eventBus.events$.subscribe(event => {
      const current = this.historyMap.get(canvasId) ?? [];
      current.push(event);
      if (current.length > HISTORY_LIMIT) {
        current.splice(0, current.length - HISTORY_LIMIT);
      }
      this.historyMap.set(canvasId, current);
      subject.next([...current]);
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
}
