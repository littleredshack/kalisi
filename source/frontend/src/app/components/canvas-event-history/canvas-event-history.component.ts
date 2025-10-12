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
    private readonly canvasControl: CanvasControlService,
    private readonly eventHub: CanvasEventHubService
  ) {
    this.history$ = this.canvasControl.activeCanvasId$.pipe(
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
                source: event.source
              }))
          )
        );
      })
    );
  }

  replay(item: CanvasEventDisplay): void {
    const canvasId = this.canvasControl.getActiveCanvasId();
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
    switch (event.type) {
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
      default:
        return event.type;
    }
  }

  private formatTimestamp(timestamp: number): string {
    if (!Number.isFinite(timestamp)) {
      return '';
    }
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
