import { Injectable } from '@angular/core';
import { ILayoutService, LayoutNode, Position } from './layout.interfaces';

/**
 * Force-directed layout service - extracted from FlatGraphLayoutEngine
 * Uses physics simulation for organic node positioning
 */
@Injectable({
  providedIn: 'root'
})
export class ForceDirectedLayoutService implements ILayoutService {

  getName(): string {
    return 'force-directed';
  }

  calculatePositions(nodes: LayoutNode[]): Map<string, Position> {
    const positions = new Map<string, Position>();

    if (nodes.length === 0) return positions;

    // Initialize random positions
    nodes.forEach(node => {
      positions.set(node.id, {
        x: Math.random() * 800,
        y: Math.random() * 600
      });
    });

    // Simple force-directed layout simulation
    const iterations = 50;
    const repulsionForce = 5000;
    const attractionForce = 0.1;
    const damping = 0.9;

    // Create velocities map
    const velocities = new Map<string, Position>();
    nodes.forEach(node => {
      velocities.set(node.id, { x: 0, y: 0 });
    });

    for (let iter = 0; iter < iterations; iter++) {
      // Apply repulsion between all nodes
      nodes.forEach(nodeA => {
        nodes.forEach(nodeB => {
          if (nodeA.id === nodeB.id) return;

          const posA = positions.get(nodeA.id)!;
          const posB = positions.get(nodeB.id)!;
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;

          const force = repulsionForce / (distance * distance);
          const fx = (dx / distance) * force;
          const fy = (dy / distance) * force;

          const velA = velocities.get(nodeA.id)!;
          velA.x -= fx;
          velA.y -= fy;
        });
      });

      // Apply attraction for connected nodes (parent-child)
      nodes.forEach(parent => {
        if (parent.children) {
          parent.children.forEach(child => {
            const parentPos = positions.get(parent.id)!;
            const childNode = nodes.find(n => n.id === child.id);
            if (childNode) {
              const childPos = positions.get(child.id)!;
              const dx = childPos.x - parentPos.x;
              const dy = childPos.y - parentPos.y;
              const distance = Math.sqrt(dx * dx + dy * dy) || 1;

              const fx = dx * attractionForce;
              const fy = dy * attractionForce;

              const parentVel = velocities.get(parent.id)!;
              const childVel = velocities.get(child.id)!;
              parentVel.x += fx;
              parentVel.y += fy;
              childVel.x -= fx;
              childVel.y -= fy;
            }
          });
        }
      });

      // Update positions based on velocities
      nodes.forEach(node => {
        const pos = positions.get(node.id)!;
        const vel = velocities.get(node.id)!;

        vel.x *= damping;
        vel.y *= damping;

        pos.x += vel.x;
        pos.y += vel.y;

        // Keep nodes on screen
        pos.x = Math.max(50, Math.min(750, pos.x));
        pos.y = Math.max(50, Math.min(550, pos.y));
      });
    }

    return positions;
  }
}