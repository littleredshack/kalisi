import { HierarchicalNode } from '../types';

export function ensureRelativeNodeCoordinates(nodes: HierarchicalNode[], parentWorldX: number = 0, parentWorldY: number = 0): void {
  nodes.forEach(node => {
    if (!node) {
      return;
    }

    if (!node.metadata) {
      node.metadata = {};
    }

    const metadata = node.metadata as Record<string, any>;
    const storedWorld = metadata['worldPosition'];
    const hasStoredWorld = storedWorld && typeof storedWorld.x === 'number' && typeof storedWorld.y === 'number';

    const worldX = hasStoredWorld ? storedWorld.x : node.x + parentWorldX;
    const worldY = hasStoredWorld ? storedWorld.y : node.y + parentWorldY;

    metadata['worldPosition'] = { x: worldX, y: worldY };
    metadata['__relative'] = true;

    node.x = worldX - parentWorldX;
    node.y = worldY - parentWorldY;


    ensureRelativeNodeCoordinates(node.children ?? [], worldX, worldY);
  });
}
