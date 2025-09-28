import { Injectable } from '@angular/core';

export interface Point {
  x: number;
  y: number;
}

export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Waypoint extends Point {
  id: string;
}

interface VisibilityGraph {
  graph: Map<string, { target: string; cost: number }[]>;
  waypoints: Map<string, Waypoint>;
}

/**
 * Orthogonal routing service using visibility graph + Dijkstra's algorithm
 * Ported from orthogonal-routing-spike/path_algorithm.js
 */
@Injectable({
  providedIn: 'root'
})
export class OrthogonalRoutingService {
  private readonly CLEARANCE = 10; // Pixels outside node boundaries

  /**
   * Calculate orthogonal paths for edges avoiding node obstacles
   */
  calculatePath(
    fromNode: NodeBounds,
    toNode: NodeBounds,
    obstacles: NodeBounds[]
  ): Point[] {
    // Build visibility graph using node positions as waypoints
    const visibilityGraph = this.buildVisibilityGraph(fromNode, toNode, obstacles);

    // Find shortest path through visibility graph
    const path = this.findShortestPath(
      visibilityGraph,
      { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 },
      { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 }
    );

    return path;
  }

  private buildVisibilityGraph(
    startNode: NodeBounds,
    endNode: NodeBounds,
    obstacles: NodeBounds[]
  ): VisibilityGraph {
    const waypoints: Waypoint[] = [];

    // Add start and end center points
    const startCenter = {
      x: startNode.x + startNode.width / 2,
      y: startNode.y + startNode.height / 2
    };
    const endCenter = {
      x: endNode.x + endNode.width / 2,
      y: endNode.y + endNode.height / 2
    };

    waypoints.push({ id: 'start', ...startCenter });
    waypoints.push({ id: 'end', ...endCenter });

    // Add escape points for start and end nodes
    this.addEscapePoints(waypoints, startNode, 'start');
    this.addEscapePoints(waypoints, endNode, 'end');

    // Add all obstacle corner points as potential waypoints
    obstacles.forEach((obstacle, obstacleIndex) => {
      const corners = [
        { key: 'topLeft', x: obstacle.x, y: obstacle.y },
        { key: 'topRight', x: obstacle.x + obstacle.width, y: obstacle.y },
        { key: 'bottomLeft', x: obstacle.x, y: obstacle.y + obstacle.height },
        { key: 'bottomRight', x: obstacle.x + obstacle.width, y: obstacle.y + obstacle.height }
      ];

      corners.forEach(corner => {
        waypoints.push({
          id: `obstacle${obstacleIndex}_${corner.key}`,
          x: corner.x,
          y: corner.y
        });
      });
    });

    // Build adjacency list
    const graph = new Map<string, { target: string; cost: number }[]>();
    waypoints.forEach(wp => graph.set(wp.id, []));

    // Connect start/end to their escape points
    this.connectToEscapePoints(graph, waypoints, 'start');
    this.connectToEscapePoints(graph, waypoints, 'end');

    // Check orthogonal connections between all waypoint pairs
    for (let i = 0; i < waypoints.length; i++) {
      for (let j = i + 1; j < waypoints.length; j++) {
        const wp1 = waypoints[i];
        const wp2 = waypoints[j];

        // Skip start/end to escape connections (already handled)
        if ((wp1.id === 'start' || wp1.id === 'end') && wp2.id.includes('escape')) continue;
        if ((wp2.id === 'start' || wp2.id === 'end') && wp1.id.includes('escape')) continue;

        // Only consider orthogonal connections
        if (Math.abs(wp1.x - wp2.x) < 0.01 || Math.abs(wp1.y - wp2.y) < 0.01) {
          if (this.isOrthogonalPathClear(wp1, wp2, obstacles, startNode, endNode)) {
            const cost = this.orthogonalDistance(wp1, wp2);
            graph.get(wp1.id)!.push({ target: wp2.id, cost });
            graph.get(wp2.id)!.push({ target: wp1.id, cost });
          }
        }
      }
    }

    return {
      graph,
      waypoints: new Map(waypoints.map(wp => [wp.id, wp]))
    };
  }

  private addEscapePoints(waypoints: Waypoint[], node: NodeBounds, nodeType: string): void {
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;

    // Four escape points around the node
    waypoints.push({
      id: `${nodeType}_escape_top`,
      x: centerX,
      y: node.y - this.CLEARANCE
    });
    waypoints.push({
      id: `${nodeType}_escape_right`,
      x: node.x + node.width + this.CLEARANCE,
      y: centerY
    });
    waypoints.push({
      id: `${nodeType}_escape_bottom`,
      x: centerX,
      y: node.y + node.height + this.CLEARANCE
    });
    waypoints.push({
      id: `${nodeType}_escape_left`,
      x: node.x - this.CLEARANCE,
      y: centerY
    });
  }

  private connectToEscapePoints(
    graph: Map<string, { target: string; cost: number }[]>,
    waypoints: Waypoint[],
    nodeType: string
  ): void {
    const escapeIds = [
      `${nodeType}_escape_top`,
      `${nodeType}_escape_right`,
      `${nodeType}_escape_bottom`,
      `${nodeType}_escape_left`
    ];

    const waypointMap = new Map(waypoints.map(wp => [wp.id, wp]));
    const centerPoint = waypointMap.get(nodeType);

    escapeIds.forEach(escapeId => {
      const escapePoint = waypointMap.get(escapeId);
      if (centerPoint && escapePoint) {
        const cost = this.orthogonalDistance(centerPoint, escapePoint);
        graph.get(nodeType)!.push({ target: escapeId, cost });
        graph.get(escapeId)!.push({ target: nodeType, cost });
      }
    });
  }

  private isOrthogonalPathClear(
    point1: Waypoint,
    point2: Waypoint,
    obstacles: NodeBounds[],
    startNode: NodeBounds,
    endNode: NodeBounds
  ): boolean {
    // Special case: allow escape routing from start/end nodes
    const isStartEscape = point1.id === 'start' || point1.id === 'end' ||
                         point2.id === 'start' || point2.id === 'end';

    if (isStartEscape) {
      // Allow paths that only intersect with source or destination nodes
      return !this.pathIntersectsObstaclesExcludingEndpoints(
        [point1, point2], obstacles, startNode, endNode
      );
    }

    // Regular obstacle checking
    return !this.pathIntersectsObstacles([point1, point2], obstacles);
  }

  private pathIntersectsObstacles(path: Point[], obstacles: NodeBounds[]): boolean {
    for (let i = 0; i < path.length - 1; i++) {
      const lineStart = path[i];
      const lineEnd = path[i + 1];

      for (const obstacle of obstacles) {
        if (this.lineIntersectsRectangle(lineStart, lineEnd, obstacle)) {
          return true;
        }
      }
    }
    return false;
  }

  private pathIntersectsObstaclesExcludingEndpoints(
    path: Point[],
    obstacles: NodeBounds[],
    startNode: NodeBounds,
    endNode: NodeBounds
  ): boolean {
    for (let i = 0; i < path.length - 1; i++) {
      const lineStart = path[i];
      const lineEnd = path[i + 1];

      for (const obstacle of obstacles) {
        // Skip collision check for start/end nodes
        if (this.pointIsInNode(lineStart, startNode) ||
            this.pointIsInNode(lineEnd, endNode) ||
            this.pointIsInNode(lineStart, endNode) ||
            this.pointIsInNode(lineEnd, startNode)) {
          continue;
        }

        if (this.lineIntersectsRectangle(lineStart, lineEnd, obstacle)) {
          return true;
        }
      }
    }
    return false;
  }

  private lineIntersectsRectangle(lineStart: Point, lineEnd: Point, node: NodeBounds): boolean {
    const rect = {
      left: node.x,
      right: node.x + node.width,
      top: node.y,
      bottom: node.y + node.height
    };

    if (this.isHorizontalLine(lineStart, lineEnd)) {
      return this.horizontalLineIntersectsRect(lineStart, lineEnd, rect);
    }

    if (this.isVerticalLine(lineStart, lineEnd)) {
      return this.verticalLineIntersectsRect(lineStart, lineEnd, rect);
    }

    return false;
  }

  private isHorizontalLine(start: Point, end: Point): boolean {
    return Math.abs(start.y - end.y) < 0.01;
  }

  private isVerticalLine(start: Point, end: Point): boolean {
    return Math.abs(start.x - end.x) < 0.01;
  }

  private horizontalLineIntersectsRect(
    start: Point,
    end: Point,
    rect: { left: number; right: number; top: number; bottom: number }
  ): boolean {
    const lineY = start.y;
    const lineMinX = Math.min(start.x, end.x);
    const lineMaxX = Math.max(start.x, end.x);

    const yIntersects = lineY >= rect.top && lineY <= rect.bottom;
    const xOverlaps = lineMaxX >= rect.left && lineMinX <= rect.right;

    return yIntersects && xOverlaps;
  }

  private verticalLineIntersectsRect(
    start: Point,
    end: Point,
    rect: { left: number; right: number; top: number; bottom: number }
  ): boolean {
    const lineX = start.x;
    const lineMinY = Math.min(start.y, end.y);
    const lineMaxY = Math.max(start.y, end.y);

    const xIntersects = lineX >= rect.left && lineX <= rect.right;
    const yOverlaps = lineMaxY >= rect.top && lineMinY <= rect.bottom;

    return xIntersects && yOverlaps;
  }

  private pointIsInNode(point: Point, node: NodeBounds): boolean {
    const centerX = node.x + node.width / 2;
    const centerY = node.y + node.height / 2;
    return Math.abs(point.x - centerX) < node.width / 2 + 5 &&
           Math.abs(point.y - centerY) < node.height / 2 + 5;
  }

  private orthogonalDistance(point1: Point, point2: Point): number {
    return Math.abs(point1.x - point2.x) + Math.abs(point1.y - point2.y);
  }

  private findShortestPath(
    visibilityGraph: VisibilityGraph,
    start: Point,
    end: Point
  ): Point[] {
    const { graph, waypoints } = visibilityGraph;
    const distances = new Map<string, number>();
    const previous = new Map<string, string | undefined>();
    const unvisited = new Set<string>();

    // Initialize distances
    const graphKeys = Array.from(graph.keys());
    for (const waypointId of graphKeys) {
      distances.set(waypointId, Infinity);
      unvisited.add(waypointId);
    }
    distances.set('start', 0);

    // Dijkstra's algorithm
    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let currentId: string | null = null;
      let minDistance = Infinity;

      const unvisitedArray = Array.from(unvisited);
      for (const nodeId of unvisitedArray) {
        const distance = distances.get(nodeId)!;
        if (distance < minDistance) {
          minDistance = distance;
          currentId = nodeId;
        }
      }

      if (currentId === null || currentId === 'end') break;

      unvisited.delete(currentId);

      // Update distances to neighbors
      const neighbors = graph.get(currentId) || [];
      for (const neighbor of neighbors) {
        const alt = distances.get(currentId)! + neighbor.cost;
        if (alt < distances.get(neighbor.target)!) {
          distances.set(neighbor.target, alt);
          previous.set(neighbor.target, currentId);
        }
      }
    }

    // Reconstruct path
    const path: Point[] = [];
    let currentId: string | undefined = 'end';

    while (currentId) {
      const waypoint = waypoints.get(currentId);
      if (!waypoint) break;
      path.unshift({ x: waypoint.x, y: waypoint.y });
      currentId = previous.get(currentId);
    }

    // Fallback to L-shape if no path found
    if (path.length < 2) {
      return [
        { x: start.x, y: start.y },
        { x: end.x, y: start.y },
        { x: end.x, y: end.y }
      ];
    }

    return path;
  }
}