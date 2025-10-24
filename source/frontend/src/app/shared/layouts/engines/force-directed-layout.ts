/**
 * Simple force-directed layout for flat graphs
 * Modifies node objects in place, adding x, y properties
 */

interface ForceNode {
  guid: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  dragging?: boolean;
  [key: string]: any;
}

interface ForceEdge {
  source_guid?: string;
  target_guid?: string;
  properties?: {
    fromGUID?: string;
    toGUID?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface ForceLayoutOptions {
  width?: number;
  height?: number;
  iterations?: number;
  nodeRadius?: number;
  repulsionStrength?: number;
  springStrength?: number;
  springLength?: number;
  damping?: number;
}

const DEFAULT_OPTIONS: Required<ForceLayoutOptions> = {
  width: 1200,
  height: 800,
  iterations: 100,
  nodeRadius: 30,
  repulsionStrength: 5000,
  springStrength: 0.01,
  springLength: 150,
  damping: 0.8
};

/**
 * Apply force-directed layout to nodes
 * Modifies nodes in place by adding/updating x, y properties
 */
export function applyForceDirectedLayout(
  nodes: ForceNode[],
  edges: ForceEdge[],
  options: ForceLayoutOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Initialize positions for nodes that don't have them
  nodes.forEach(node => {
    if (node.x === undefined || node.y === undefined) {
      node.x = Math.random() * opts.width;
      node.y = Math.random() * opts.height;
    }
    if (node.vx === undefined) node.vx = 0;
    if (node.vy === undefined) node.vy = 0;
  });

  // Build node lookup map
  const nodeMap = new Map<string, ForceNode>();
  nodes.forEach(node => nodeMap.set(node.guid, node));

  // Run simulation
  for (let iter = 0; iter < opts.iterations; iter++) {
    // Reset forces
    nodes.forEach(node => {
      if (!node.dragging) {
        node.vx = 0;
        node.vy = 0;
      }
    });

    // Apply repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      const nodeA = nodes[i];
      if (nodeA.dragging) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB = nodes[j];

        const dx = nodeB.x! - nodeA.x!;
        const dy = nodeB.y! - nodeA.y!;
        const distSq = dx * dx + dy * dy;

        if (distSq > 0) {
          const dist = Math.sqrt(distSq);
          const force = opts.repulsionStrength / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!nodeA.dragging) {
            nodeA.vx! -= fx;
            nodeA.vy! -= fy;
          }
          if (!nodeB.dragging) {
            nodeB.vx! += fx;
            nodeB.vy! += fy;
          }
        }
      }
    }

    // Apply spring forces from edges
    edges.forEach(edge => {
      const sourceGuid = edge.properties?.fromGUID || edge.source_guid || '';
      const targetGuid = edge.properties?.toGUID || edge.target_guid || '';
      const source = nodeMap.get(sourceGuid);
      const target = nodeMap.get(targetGuid);

      if (source && target) {
        const dx = target.x! - source.x!;
        const dy = target.y! - source.y!;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          const force = (dist - opts.springLength) * opts.springStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!source.dragging) {
            source.vx! += fx;
            source.vy! += fy;
          }
          if (!target.dragging) {
            target.vx! -= fx;
            target.vy! -= fy;
          }
        }
      }
    });

    // Update positions
    nodes.forEach(node => {
      if (!node.dragging) {
        node.vx! *= opts.damping;
        node.vy! *= opts.damping;
        node.x! += node.vx!;
        node.y! += node.vy!;

        // Keep nodes in bounds
        node.x! = Math.max(opts.nodeRadius, Math.min(opts.width - opts.nodeRadius, node.x!));
        node.y! = Math.max(opts.nodeRadius, Math.min(opts.height - opts.nodeRadius, node.y!));
      }
    });
  }
}
