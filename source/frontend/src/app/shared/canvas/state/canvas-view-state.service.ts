import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import { CanvasData, HierarchicalNode } from '../types';

export type CanvasMutationType =
  | 'initialize'
  | 'replace'
  | 'position'
  | 'resize'
  | 'collapse'
  | 'layout'
  | 'camera';

export interface CanvasMutation {
  type: CanvasMutationType;
  source: 'engine' | 'layout' | 'external';
  nodeGuid?: string;
  payload?: Record<string, unknown>;
  version: number;
}

/**
 * Centralised observable state for canvas layout data.
 *
 * The canvas engine mutates its local copy, then publishes the change here.
 * Other collaborators (dynamic layout, persistence, etc.) subscribe to
 * mutations or state snapshots to react without tight coupling.
 */
@Injectable({
  providedIn: 'root'
})
export class CanvasViewStateService {
  private stateVersion = 0;
  private readonly stateSubject = new BehaviorSubject<CanvasData | null>(null);
  private readonly mutationSubject = new Subject<CanvasMutation>();

  get canvasData$(): Observable<CanvasData | null> {
    return this.stateSubject.asObservable();
  }

  get mutations$(): Observable<CanvasMutation> {
    return this.mutationSubject.asObservable();
  }

  get currentState(): CanvasData | null {
    return this.stateSubject.value;
  }

  /**
   * Replace the entire canvas state (initial load or external import).
   */
  initialize(data: CanvasData, source: CanvasMutation['source'] = 'engine'): void {
    const clone = this.deepClone(data);
    this.pushState(clone, { type: 'initialize', source });
  }

  /**
   * Publish an updated canvas snapshot originating from the engine.
   * Consumers should submit fully mutated data; the service clones it to
   * decouple future local mutations from observers.
   */
  publishFromEngine(data: CanvasData, mutation: Omit<CanvasMutation, 'source' | 'version'>): void {
    const clone = this.deepClone(data);
    this.pushState(clone, { ...mutation, source: 'engine' });
  }

  /**
   * Publish an updated canvas snapshot originating from an automatic layout pass.
   */
  publishFromLayout(data: CanvasData, mutation: Omit<CanvasMutation, 'source' | 'version'>): void {
    const clone = this.deepClone(data);
    this.pushState(clone, { ...mutation, source: 'layout' });
  }

  /**
   * Publish an update originating outside the engine/layout loop (e.g. persistence restore).
   */
  publishExternal(data: CanvasData, mutation: Omit<CanvasMutation, 'source' | 'version'>): void {
    const clone = this.deepClone(data);
    this.pushState(clone, { ...mutation, source: 'external' });
  }

  updateCamera(camera: { x: number; y: number; zoom: number }, source: CanvasMutation['source'] = 'engine'): void {
    const current = this.currentState;
    if (!current) {
      return;
    }

    const draft = this.deepClone(current);
    draft.camera = { ...camera };
    this.pushState(draft, {
      type: 'camera',
      source
    });
  }

  /**
   * Convenience helper for node position updates. Creates a cloned state,
   * applies the mutation, and emits the result.
   */
  updateNodePosition(
    nodeGuid: string,
    position: { x: number; y: number },
    options?: { userLocked?: boolean },
    source: CanvasMutation['source'] = 'engine'
  ): void {
    const current = this.currentState;
    if (!current) return;

    const draft = this.deepClone(current);
    const node = this.findNodeByGUID(draft.nodes, nodeGuid);
    if (!node) {
      return;
    }

    node.x = position.x;
    node.y = position.y;

    if (options?.userLocked) {
      (node as any)._lockedPosition = { x: position.x, y: position.y };
      (node as any)._userLocked = true;
    }

    this.pushState(draft, {
      type: 'position',
      nodeGuid,
      source
    });
  }

  private pushState(nextState: CanvasData, mutation: Omit<CanvasMutation, 'version'>): void {
    this.stateVersion += 1;
    const snapshot: CanvasData = {
      ...nextState,
      originalEdges:
        nextState.originalEdges || nextState.edges.filter(e => !e.id.startsWith('inherited-'))
    };

    this.stateSubject.next(snapshot);
    this.mutationSubject.next({
      ...mutation,
      version: this.stateVersion
    });
  }

  private deepClone<T>(value: T): T {
    const globalStructuredClone = (globalThis as unknown as { structuredClone?: <Q>(input: Q) => Q }).structuredClone;
    if (typeof globalStructuredClone === 'function') {
      return globalStructuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  private findNodeByGUID(nodes: HierarchicalNode[], guid: string): HierarchicalNode | null {
    const stack: HierarchicalNode[] = [...nodes];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node.GUID === guid) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        stack.push(...node.children);
      }
    }
    return null;
  }
}
