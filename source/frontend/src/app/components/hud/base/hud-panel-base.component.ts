import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  OnDestroy,
  signal,
  effect,
  ChangeDetectionStrategy,
  Input
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HudPanelService } from '../../../core/services/hud-panel.service';

@Component({
  selector: 'app-hud-panel-base',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hud-panel-base.component.html',
  styleUrls: ['./hud-panel-base.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export abstract class HudPanelBaseComponent implements OnInit, OnDestroy {
  @Input() panelId!: string;
  @Input() title: string = 'Panel';
  @Input() icon: string = 'pi-palette';

  protected readonly position = signal({ x: 100, y: 100 });
  protected readonly panelOpacity = signal(0.9);
  protected readonly zIndex = signal(100);
  protected readonly isDragging = signal(false);
  protected readonly isVisible = signal(false);

  private dragOffset = { x: 0, y: 0 };
  private saveDebounceTimer: any;

  constructor(
    protected elementRef: ElementRef,
    protected hudPanel: HudPanelService
  ) {}

  ngOnInit(): void {
    // Load saved state
    const state = this.hudPanel.getPanelState(this.panelId);
    if (state) {
      this.position.set(state.position);
      this.panelOpacity.set(state.opacity);
      this.zIndex.set(state.zIndex);
      this.isVisible.set(state.visible);
    }

    // Watch for visibility changes
    // We'll use effect to watch the panel state changes
    effect(() => {
      const currentState = this.hudPanel.getPanelState(this.panelId);
      if (currentState) {
        this.isVisible.set(currentState.visible);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.hudPanel.unregisterPanel(this.panelId);
  }

  startDrag(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const rect = this.elementRef.nativeElement.querySelector('.hud-panel').getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    this.isDragging.set(true);
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging()) return;

    const x = event.clientX - this.dragOffset.x;
    const y = event.clientY - this.dragOffset.y;

    // Clamp to viewport boundaries
    const clamped = this.clampToViewport(x, y);
    this.position.set(clamped);

    // Debounce save to localStorage
    this.debouncedSave();
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    if (this.isDragging()) {
      this.isDragging.set(false);
      // Save final position
      this.hudPanel.updatePosition(this.panelId, this.position());
    }
  }

  private clampToViewport(x: number, y: number): { x: number; y: number } {
    const panel = this.elementRef.nativeElement.querySelector('.hud-panel');
    const rect = panel.getBoundingClientRect();

    const minX = 0;
    const minY = 0;
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  }

  private debouncedSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.hudPanel.updatePosition(this.panelId, this.position());
    }, 500);
  }

  setOpacity(opacity: number): void {
    const clamped = Math.max(0, Math.min(1, opacity));
    this.panelOpacity.set(clamped);
    this.hudPanel.updateOpacity(this.panelId, clamped);
  }

  onPanelClick(): void {
    // Bring to front on any click
    this.hudPanel.bringToFront(this.panelId);
    const state = this.hudPanel.getPanelState(this.panelId);
    if (state) {
      this.zIndex.set(state.zIndex);
    }
  }

  onClose(event: MouseEvent): void {
    event.stopPropagation();
    this.hudPanel.hidePanel(this.panelId);
  }
}
