import { EdgeOverlayPatch, EdgeResolutionOptions, NodeOverlayPatch, OverlayPatchBase, OverlayResolutionOptions } from './overlay-types';

function clonePatch<T extends OverlayPatchBase>(patch: T): T {
  return JSON.parse(JSON.stringify(patch));
}

export class OverlayStore {
  private nodeGlobalPatch: NodeOverlayPatch | null = null;
  private edgeGlobalPatch: EdgeOverlayPatch | null = null;
  private readonly nodePatches = new Map<string, NodeOverlayPatch>();
  private readonly edgePatches = new Map<string, EdgeOverlayPatch>();
  private version = 0;

  getVersion(): number {
    return this.version;
  }

  clear(): void {
    this.nodeGlobalPatch = null;
    this.edgeGlobalPatch = null;
    this.nodePatches.clear();
    this.edgePatches.clear();
    this.bump();
  }

  setGlobalNodePatch(patch: NodeOverlayPatch | null): void {
    this.nodeGlobalPatch = patch ? clonePatch(patch) : null;
    this.bump();
  }

  setGlobalEdgePatch(patch: EdgeOverlayPatch | null): void {
    this.edgeGlobalPatch = patch ? clonePatch(patch) : null;
    this.bump();
  }

  upsertNodePatch(nodeId: string, patch: NodeOverlayPatch): void {
    this.nodePatches.set(nodeId, clonePatch(patch));
    this.bump();
  }

  upsertEdgePatch(edgeId: string, patch: EdgeOverlayPatch): void {
    this.edgePatches.set(edgeId, clonePatch(patch));
    this.bump();
  }

  removeNodePatch(nodeId: string): void {
    if (this.nodePatches.delete(nodeId)) {
      this.bump();
    }
  }

  removeEdgePatch(edgeId: string): void {
    if (this.edgePatches.delete(edgeId)) {
      this.bump();
    }
  }

  getNodePatch(nodeId: string): NodeOverlayPatch | null {
    const patch = this.nodePatches.get(nodeId);
    return patch ? clonePatch(patch) : null;
  }

  getEdgePatch(edgeId: string): EdgeOverlayPatch | null {
    const patch = this.edgePatches.get(edgeId);
    return patch ? clonePatch(patch) : null;
  }

  getNodeResolutionChain(options: OverlayResolutionOptions): NodeOverlayPatch[] {
    const patches: NodeOverlayPatch[] = [];
    if (this.nodeGlobalPatch) {
      patches.push(clonePatch(this.nodeGlobalPatch));
    }
    for (const ancestorId of options.ancestorIds) {
      const patch = this.nodePatches.get(ancestorId);
      if (patch && patch.scope !== 'node') {
        patches.push(clonePatch(patch));
        if (patch.stopCascade) {
          break;
        }
      }
    }
    const nodePatch = this.nodePatches.get(options.nodeId);
    if (nodePatch) {
      patches.push(clonePatch(nodePatch));
    }
    return patches;
  }

  getEdgeResolutionChain(options: EdgeResolutionOptions): EdgeOverlayPatch[] {
    const patches: EdgeOverlayPatch[] = [];
    if (this.edgeGlobalPatch) {
      patches.push(clonePatch(this.edgeGlobalPatch));
    }
    const edgePatch = this.edgePatches.get(options.edgeId);
    if (edgePatch) {
      patches.push(clonePatch(edgePatch));
    }
    return patches;
  }

  private bump(): void {
    this.version = (this.version + 1) % Number.MAX_SAFE_INTEGER;
  }
}
