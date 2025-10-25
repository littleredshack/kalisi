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

  // Initialize positions for nodes - preserve existing positions and dragging state
  console.log('[force-directed] Starting layout for', nodes.length, 'nodes');
  nodes.forEach((node: any, i: number) => {
    if (!node.geometry) {
      node.geometry = { x: 0, y: 0, width: 160, height: 80 };
    }

    // Only randomize if node doesn't have a position yet
    // NEVER randomize dragging nodes or nodes with locked positions
    const hasPosition = node.geometry.x !== 0 || node.geometry.y !== 0;
    const isDragging = node.metadata?.['dragging'] === true;
    const isLocked = node.metadata?.['_userLocked'] === true;

    if (!hasPosition && !isDragging && !isLocked) {
      node.geometry = {
        ...node.geometry,
        x: Math.random() * opts.width,
        y: Math.random() * opts.height
      };
    }

    if (node.vx === undefined) node.vx = 0;
    if (node.vy === undefined) node.vy = 0;
    if (i < 3) {
      console.log(`[force-directed] Node ${i} initial pos:`, node.geometry.x, node.geometry.y, 'dragging:', node.metadata?.['dragging']);
    }
  });

  // Build node lookup map
  const nodeMap = new Map<string, any>();
  nodes.forEach((node: any) => nodeMap.set(node.id, node));

  // Run simulation
  for (let iter = 0; iter < opts.iterations; iter++) {
    // Reset forces
    nodes.forEach((node: any) => {
      const isDragging = node.metadata?.['dragging'] === true;
      const isLocked = node.metadata?.['_userLocked'] === true;
      if (!isDragging && !isLocked) {
        node.vx = 0;
        node.vy = 0;
      }
    });

    // Apply repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      const nodeA: any = nodes[i];
      const isDraggingA = nodeA.metadata?.['dragging'] === true;
      const isLockedA = nodeA.metadata?.['_userLocked'] === true;
      if (isDraggingA || isLockedA) continue;

      for (let j = i + 1; j < nodes.length; j++) {
        const nodeB: any = nodes[j];
        const isDraggingB = nodeB.metadata?.['dragging'] === true;
        const isLockedB = nodeB.metadata?.['_userLocked'] === true;

        const dx = nodeB.geometry.x - nodeA.geometry.x;
        const dy = nodeB.geometry.y - nodeA.geometry.y;
        const distSq = dx * dx + dy * dy;

        if (distSq > 0) {
          const dist = Math.sqrt(distSq);
          const force = opts.repulsionStrength / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!isDraggingA && !isLockedA) {
            nodeA.vx -= fx;
            nodeA.vy -= fy;
          }
          if (!isDraggingB && !isLockedB) {
            nodeB.vx += fx;
            nodeB.vy += fy;
          }
        }
      }
    }

    // Apply spring forces from edges
    edges.forEach((edge: any) => {
      const source = nodeMap.get(edge.fromGUID);
      const target = nodeMap.get(edge.toGUID);

      if (source && target) {
        const isDraggingSource = source.metadata?.['dragging'] === true;
        const isLockedSource = source.metadata?.['_userLocked'] === true;
        const isDraggingTarget = target.metadata?.['dragging'] === true;
        const isLockedTarget = target.metadata?.['_userLocked'] === true;

        const dx = target.geometry.x - source.geometry.x;
        const dy = target.geometry.y - source.geometry.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          const force = (dist - opts.springLength) * opts.springStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!isDraggingSource && !isLockedSource) {
            source.vx += fx;
            source.vy += fy;
          }
          if (!isDraggingTarget && !isLockedTarget) {
            target.vx -= fx;
            target.vy -= fy;
          }
        }
      }
    });

    // Update positions
    nodes.forEach((node: any) => {
      const isDragging = node.metadata?.['dragging'] === true;
      const isLocked = node.metadata?.['_userLocked'] === true;
      if (!isDragging && !isLocked) {
        node.vx *= opts.damping;
        node.vy *= opts.damping;
        node.geometry = {
          ...node.geometry,
          x: node.geometry.x + node.vx,
          y: node.geometry.y + node.vy
        };

        // Keep nodes in bounds
        node.geometry = {
          ...node.geometry,
          x: Math.max(opts.nodeRadius, Math.min(opts.width - opts.nodeRadius, node.geometry.x)),
          y: Math.max(opts.nodeRadius, Math.min(opts.height - opts.nodeRadius, node.geometry.y))
        };
      }
    });
  }

  // Log final positions
  nodes.forEach((node: any, i: number) => {
    if (i < 3) {
      console.log(`[force-directed] Node ${i} final pos:`, node.geometry.x, node.geometry.y);
    }
  });
  console.log('[force-directed] Layout complete');
}
