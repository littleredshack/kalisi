import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { CanvasData } from '../../shared/canvas/types';

interface HistoryStack {
  past: CanvasData[];
  future: CanvasData[];
  suppress: boolean;
  state$: BehaviorSubject<{ canUndo: boolean; canRedo: boolean }>;
}

const MAX_HISTORY = 50;

@Injectable({ providedIn: 'root' })
export class CanvasHistoryService {
  private readonly stacks = new Map<string, HistoryStack>();

  registerCanvas(canvasId: string, initial: CanvasData): void {
    const stack = this.ensure(canvasId);
    stack.past = [this.clone(initial)];
    stack.future = [];
    stack.suppress = false;
    this.emitState(stack);
  }

  unregisterCanvas(canvasId: string): void {
    this.stacks.delete(canvasId);
  }

  record(canvasId: string, snapshot: CanvasData): void {
    const stack = this.ensure(canvasId);
    if (stack.suppress) {
      return;
    }
    stack.past.push(this.clone(snapshot));
    if (stack.past.length > MAX_HISTORY) {
      stack.past.splice(0, stack.past.length - MAX_HISTORY);
    }
    stack.future = [];
    this.emitState(stack);
  }

  beginRestore(canvasId: string): void {
    const stack = this.ensure(canvasId);
    stack.suppress = true;
  }

  endRestore(canvasId: string): void {
    const stack = this.ensure(canvasId);
    stack.suppress = false;
  }

  undo(canvasId: string): CanvasData | null {
    const stack = this.ensure(canvasId);
    if (stack.past.length <= 1) {
      return null;
    }
    const current = stack.past.pop()!;
    stack.future.push(this.clone(current));
    const snapshot = this.clone(stack.past[stack.past.length - 1]);
    this.emitState(stack);
    return snapshot;
  }

  redo(canvasId: string): CanvasData | null {
    const stack = this.ensure(canvasId);
    if (stack.future.length === 0) {
      return null;
    }
    const next = stack.future.pop()!;
    stack.past.push(this.clone(next));
    this.emitState(stack);
    return this.clone(next);
  }

  canUndo(canvasId: string): boolean {
    const stack = this.ensure(canvasId);
    return stack.past.length > 1;
  }

  canRedo(canvasId: string): boolean {
    const stack = this.ensure(canvasId);
    return stack.future.length > 0;
  }

  state$(canvasId: string): Observable<{ canUndo: boolean; canRedo: boolean }> {
    return this.ensure(canvasId).state$.asObservable();
  }

  private ensure(canvasId: string): HistoryStack {
    let stack = this.stacks.get(canvasId);
    if (!stack) {
      stack = {
        past: [],
        future: [],
        suppress: false,
        state$: new BehaviorSubject<{ canUndo: boolean; canRedo: boolean }>({ canUndo: false, canRedo: false })
      };
      this.stacks.set(canvasId, stack);
    }
    return stack;
  }

  private emitState(stack: HistoryStack): void {
    stack.state$.next({
      canUndo: stack.past.length > 1,
      canRedo: stack.future.length > 0
    });
  }

  private clone<T>(value: T): T {
    const structured = (globalThis as unknown as { structuredClone?: <Q>(input: Q) => Q }).structuredClone;
    if (typeof structured === 'function') {
      return structured(value);
    }
    return JSON.parse(JSON.stringify(value));
  }
}
