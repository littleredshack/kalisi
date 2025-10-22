import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { EdgeOverlayPatch, EdgeResolutionOptions, NodeOverlayPatch, OverlayResolutionOptions } from './overlay-types';
import { OverlayStore } from './overlay-store';
import { OverlayResolver } from './overlay-resolver';
import { EdgeStyleOverrides, NodeStyleOverrides } from '../types';

@Injectable({
  providedIn: 'root'
})
export class OverlayService {
  private readonly store = new OverlayStore();
  private readonly resolver = new OverlayResolver(this.store);
  private readonly change$ = new BehaviorSubject<number>(this.store.getVersion());

  get changes$(): Observable<number> {
    return this.change$.asObservable();
  }

  getResolver(): OverlayResolver {
    return this.resolver;
  }

  getStore(): OverlayStore {
    return this.store;
  }

  setGlobalContainmentMode(mode: 'containers' | 'flat', author: 'user' | 'system' = 'user'): void {
    const patch: NodeOverlayPatch = {
      id: 'global',
      scope: 'global',
      containmentMode: mode,
      updatedAt: Date.now(),
      author
    };
    this.store.setGlobalNodePatch(patch);
    this.emit();
  }

  applyNodeStyle(nodeId: string, overrides: Partial<NodeStyleOverrides>, scope: 'node' | 'subtree' = 'node', author: 'user' | 'system' = 'user'): void {
    const existing = this.store.getNodePatch(nodeId);
    const patch: NodeOverlayPatch = {
      id: nodeId,
      scope: scope ?? existing?.scope ?? 'node',
      style: {
        ...(existing?.style ?? {}),
        ...overrides
      },
      containmentMode: existing?.containmentMode,
      layout: existing?.layout,
      visibility: existing?.visibility,
      collapseState: existing?.collapseState,
      stopCascade: existing?.stopCascade,
      updatedAt: Date.now(),
      author
    };
    this.store.upsertNodePatch(nodeId, patch);
    this.emit();
  }

  applyNodeCollapse(
    nodeId: string,
    state: 'collapsed' | 'expanded',
    author: 'user' | 'system' = 'user'
  ): void {
    const existing = this.store.getNodePatch(nodeId);
    const patch: NodeOverlayPatch = {
      id: nodeId,
      scope: existing?.scope ?? 'node',
      style: existing?.style,
      layout: existing?.layout,
      containmentMode: existing?.containmentMode,
      visibility: existing?.visibility,
      collapseState: state,
      stopCascade: existing?.stopCascade,
      updatedAt: Date.now(),
      author
    };
    this.store.upsertNodePatch(nodeId, patch);
    this.emit();
  }

  clearNodeOverlay(nodeId: string): void {
    this.store.removeNodePatch(nodeId);
    this.emit();
  }

  applyEdgeStyle(edgeId: string, overrides: Partial<EdgeStyleOverrides>, author: 'user' | 'system' = 'user'): void {
    const existing = this.store.getEdgePatch(edgeId);
    const patch: EdgeOverlayPatch = {
      id: edgeId,
      scope: 'node',
      style: {
        ...(existing?.style ?? {}),
        ...overrides
      },
      visibility: existing?.visibility,
      stopCascade: false,
      updatedAt: Date.now(),
      author
    };
    this.store.upsertEdgePatch(edgeId, patch);
    this.emit();
  }

  resolveNode(options: OverlayResolutionOptions): ReturnType<OverlayResolver['resolveNode']> {
    return this.resolver.resolveNode(options);
  }

  resolveEdge(options: EdgeResolutionOptions): ReturnType<OverlayResolver['resolveEdge']> {
    return this.resolver.resolveEdge(options);
  }

  clear(): void {
    this.store.clear();
    this.emit();
  }

  private emit(): void {
    this.change$.next(this.store.getVersion());
  }
}
