import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { CanvasControlService } from '../../core/services/canvas-control.service';
import { CanvasEventHubService } from '../../core/services/canvas-event-hub.service';
import { CanvasEvent } from '../../shared/layouts/core/layout-events';

interface CanvasEventDisplay {
  readonly event: CanvasEvent;
  readonly description: string;
  readonly timestamp: string;
  readonly source: string;
  readonly details?: string;
}

@Component({
  selector: 'app-canvas-event-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './canvas-event-history.component.html',
  styleUrls: ['./canvas-event-history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasEventHistoryComponent {
  readonly history$: Observable<CanvasEventDisplay[]>;

  constructor(
    private readonly canvasControlService: CanvasControlService,
    private readonly eventHub: CanvasEventHubService
  ) {
    this.history$ = this.canvasControlService.activeCanvasId$.pipe(
      switchMap(canvasId => {
        if (!canvasId) {
          return of([]);
        }
        return this.eventHub.getHistory$(canvasId).pipe(
          map(events =>
            [...events]
              .slice()
              .reverse()
              .map(event => ({
                event,
                description: this.describe(event),
                timestamp: this.formatTimestamp(event.timestamp),
                source: event.source,
                details: this.extractDetails(event)
              }))
          )
        );
      })
    );
  }

  replay(item: CanvasEventDisplay): void {
    const canvasId = this.canvasControlService.getActiveCanvasId();
    if (!canvasId) {
      return;
    }
    this.eventHub.emitEvent(canvasId, {
      ...item.event,
      timestamp: Date.now(),
      source: 'history'
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  private describe(event: CanvasEvent): string {
    const type = event.type;
    switch (type) {
      case 'CollapseNode':
        return `Collapse ${event.nodeId}`;
      case 'ExpandNode':
        return `Expand ${event.nodeId}`;
      case 'ResizeNode':
        return `Resize ${event.nodeId}`;
      case 'NodeMoved':
        return `Move ${event.nodeId}`;
      case 'LayoutRequested':
        return `Layout Requested (${event.engineName})`;
      case 'LayoutApplied':
        return `Layout Applied (${event.engineName})`;
      case 'EngineSwitched':
        return `Engine → ${event.engineName}`;
      case 'CameraChanged':
        return 'Camera Changed';
      case 'HistoryReplay':
        return 'History Replay';
      case 'GraphLensChanged':
        return `Lens → ${event.lensId}`;
    }
    return type as string;
  }

  private formatTimestamp(timestamp: number): string {
    if (!Number.isFinite(timestamp)) {
      return '';
    }
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  private extractDetails(event: CanvasEvent): string | undefined {
    if (event.type === 'LayoutRequested') {
      const payload = event.payload as Readonly<Record<string, unknown>> | undefined;
      if (!payload) {
        return undefined;
      }

      const details: string[] = [];
      const priority = payload['priority'];
      if (typeof priority === 'string') {
        details.push(`priority ${priority}`);
      }

      const queueDepth = payload['queueDepth'];
      if (typeof queueDepth === 'number') {
        details.push(`queue depth ${queueDepth}`);
      }

      const queueWaitMs = payload['queueWaitMs'];
      if (typeof queueWaitMs === 'number') {
        details.push(`wait ${Math.round(queueWaitMs)} ms`);
      }

      return details.length > 0 ? details.join(' • ') : undefined;
    }

    if (event.type === 'LayoutApplied') {
      const diagnostics = event.result.diagnostics;
      if (!diagnostics) {
        return undefined;
      }

      const details: string[] = [];
      if (typeof diagnostics.durationMs === 'number') {
        details.push(`${Math.round(diagnostics.durationMs)} ms`);
      }

      const metrics = diagnostics.metrics ?? {};
      const queueWait = metrics['queueWaitMs'];
      if (typeof queueWait === 'number') {
        details.push(`wait ${Math.round(queueWait)} ms`);
      }

      const queueDepth = metrics['queueDepth'];
      if (typeof queueDepth === 'number') {
        details.push(`queue depth ${queueDepth}`);
      }

      return details.length > 0 ? details.join(' • ') : undefined;
    }

    return undefined;
  }
}
