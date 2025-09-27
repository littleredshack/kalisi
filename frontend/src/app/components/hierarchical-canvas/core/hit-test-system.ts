/**
 * Kalisi Hierarchical Canvas - Hit Testing System
 * 
 * Implements hierarchical hit testing where children take precedence over parents.
 * Uses spatial indexing for performance optimization with many objects.
 */

import { SceneNode, Point, Bounds, Viewport } from './scene-graph';
import { TransformSystem } from './transform-system';

/**
 * Hit test result with additional context information
 */
export interface HitTestResult {
  node: SceneNode;
  localPoint: Point;
  worldPoint: Point;
  distance: number; // Distance from hit point for sorting multiple hits
}

/**
 * Spatial index node for QuadTree implementation
 */
interface QuadTreeNode {
  bounds: Bounds;
  objects: SceneNode[];
  children: QuadTreeNode[] | null;
  maxObjects: number;
  maxLevels: number;
  level: number;
}

/**
 * QuadTree spatial index for efficient hit testing
 */
class QuadTree {
  private root: QuadTreeNode;
  private readonly maxObjects = 10;
  private readonly maxLevels = 5;
  
  constructor(bounds: Bounds) {
    this.root = {
      bounds,
      objects: [],
      children: null,
      maxObjects: this.maxObjects,
      maxLevels: this.maxLevels,
      level: 0
    };
  }
  
  /**
   * Insert a scene node into the spatial index
   */
  insert(node: SceneNode): void {
    const worldBounds = this.getNodeWorldBounds(node);
    this.insertIntoNode(this.root, node, worldBounds);
  }
  
  /**
   * Query nodes that intersect with a point
   */
  queryPoint(point: Point): SceneNode[] {
    const results: SceneNode[] = [];
    this.queryPointInNode(this.root, point, results);
    return results;
  }
  
  /**
   * Query nodes that intersect with a bounds rectangle
   */
  queryBounds(bounds: Bounds): SceneNode[] {
    const results: SceneNode[] = [];
    this.queryBoundsInNode(this.root, bounds, results);
    return results;
  }
  
  /**
   * Clear the spatial index
   */
  clear(): void {
    this.clearNode(this.root);
  }
  
  private insertIntoNode(node: QuadTreeNode, object: SceneNode, bounds: Bounds): void {
    if (node.children !== null) {
      // Node is subdivided, insert into appropriate child
      const indices = this.getQuadrantIndices(node, bounds);
      for (const index of indices) {
        this.insertIntoNode(node.children[index], object, bounds);
      }
      return;
    }
    
    // Add to current node
    node.objects.push(object);
    
    // Check if subdivision is needed
    if (node.objects.length > node.maxObjects && node.level < node.maxLevels) {
      this.subdivide(node);
      
      // Redistribute objects to children
      let i = 0;
      while (i < node.objects.length) {
        const obj = node.objects[i];
        const objBounds = this.getNodeWorldBounds(obj);
        const indices = this.getQuadrantIndices(node, objBounds);
        
        if (indices.length === 1) {
          // Object fits entirely in one quadrant
          this.insertIntoNode(node.children![indices[0]], obj, objBounds);
          node.objects.splice(i, 1);
        } else {
          // Object spans multiple quadrants, keep in parent
          i++;
        }
      }
    }
  }
  
  private subdivide(node: QuadTreeNode): void {
    const { bounds } = node;
    const halfWidth = bounds.width / 2;
    const halfHeight = bounds.height / 2;
    
    node.children = [
      // Top-left
      {
        bounds: { x: bounds.x, y: bounds.y, width: halfWidth, height: halfHeight },
        objects: [],
        children: null,
        maxObjects: this.maxObjects,
        maxLevels: this.maxLevels,
        level: node.level + 1
      },
      // Top-right
      {
        bounds: { x: bounds.x + halfWidth, y: bounds.y, width: halfWidth, height: halfHeight },
        objects: [],
        children: null,
        maxObjects: this.maxObjects,
        maxLevels: this.maxLevels,
        level: node.level + 1
      },
      // Bottom-left
      {
        bounds: { x: bounds.x, y: bounds.y + halfHeight, width: halfWidth, height: halfHeight },
        objects: [],
        children: null,
        maxObjects: this.maxObjects,
        maxLevels: this.maxLevels,
        level: node.level + 1
      },
      // Bottom-right
      {
        bounds: { x: bounds.x + halfWidth, y: bounds.y + halfHeight, width: halfWidth, height: halfHeight },
        objects: [],
        children: null,
        maxObjects: this.maxObjects,
        maxLevels: this.maxLevels,
        level: node.level + 1
      }
    ];
  }
  
  private getQuadrantIndices(node: QuadTreeNode, bounds: Bounds): number[] {
    const indices: number[] = [];
    
    if (!node.children) return indices;
    
    for (let i = 0; i < 4; i++) {
      if (this.boundsIntersect(bounds, node.children[i].bounds)) {
        indices.push(i);
      }
    }
    
    return indices;
  }
  
  private queryPointInNode(node: QuadTreeNode, point: Point, results: SceneNode[]): void {
    // Check objects in current node
    for (const obj of node.objects) {
      if (this.pointInNodeBounds(point, obj)) {
        results.push(obj);
      }
    }
    
    // Check children if subdivided
    if (node.children) {
      for (const child of node.children) {
        if (this.pointInBounds(point, child.bounds)) {
          this.queryPointInNode(child, point, results);
        }
      }
    }
  }
  
  private queryBoundsInNode(node: QuadTreeNode, bounds: Bounds, results: SceneNode[]): void {
    // Check objects in current node
    for (const obj of node.objects) {
      const objBounds = this.getNodeWorldBounds(obj);
      if (this.boundsIntersect(bounds, objBounds)) {
        results.push(obj);
      }
    }
    
    // Check children if subdivided
    if (node.children) {
      for (const child of node.children) {
        if (this.boundsIntersect(bounds, child.bounds)) {
          this.queryBoundsInNode(child, bounds, results);
        }
      }
    }
  }
  
  private clearNode(node: QuadTreeNode): void {
    node.objects = [];
    if (node.children) {
      for (const child of node.children) {
        this.clearNode(child);
      }
      node.children = null;
    }
  }
  
  private getNodeWorldBounds(node: SceneNode): Bounds {
    // This would need access to transform system
    // For now, return local bounds (this should be improved)
    return {
      x: node.transform.x,
      y: node.transform.y,
      width: node.bounds.width,
      height: node.bounds.height
    };
  }
  
  private boundsIntersect(a: Bounds, b: Bounds): boolean {
    return !(a.x + a.width < b.x || b.x + b.width < a.x ||
             a.y + a.height < b.y || b.y + b.height < a.y);
  }
  
  private pointInBounds(point: Point, bounds: Bounds): boolean {
    return point.x >= bounds.x && point.x <= bounds.x + bounds.width &&
           point.y >= bounds.y && point.y <= bounds.y + bounds.height;
  }
  
  private pointInNodeBounds(point: Point, node: SceneNode): boolean {
    const bounds = this.getNodeWorldBounds(node);
    return this.pointInBounds(point, bounds);
  }
}

/**
 * Hierarchical hit testing system
 * Implements proper parent-child precedence and spatial optimization
 */
export class HitTestSystem {
  private transformSystem: TransformSystem;
  private spatialIndex: QuadTree | null = null;
  private enableSpatialIndex = false;
  
  constructor(transformSystem: TransformSystem) {
    this.transformSystem = transformSystem;
  }
  
  /**
   * Enable spatial indexing for performance optimization
   */
  enableSpatialIndexing(viewport: Viewport): void {
    this.enableSpatialIndex = true;
    const indexBounds = {
      x: viewport.x - viewport.width,
      y: viewport.y - viewport.height,
      width: viewport.width * 3,
      height: viewport.height * 3
    };
    this.spatialIndex = new QuadTree(indexBounds);
  }
  
  /**
   * Disable spatial indexing (use brute force hit testing)
   */
  disableSpatialIndexing(): void {
    this.enableSpatialIndex = false;
    this.spatialIndex = null;
  }
  
  /**
   * Perform hierarchical hit test at a world point
   * Returns the topmost (front-most) node that contains the point
   */
  hitTest(root: SceneNode, worldPoint: Point): SceneNode | null {
    // Update transforms before hit testing
    this.transformSystem.updateTransforms(root);
    
    if (this.enableSpatialIndex && this.spatialIndex) {
      return this.hitTestWithSpatialIndex(worldPoint);
    } else {
      return this.hitTestHierarchical(root, worldPoint);
    }
  }
  
  /**
   * Perform hit test and return all nodes at the point (front to back)
   */
  hitTestAll(root: SceneNode, worldPoint: Point): SceneNode[] {
    this.transformSystem.updateTransforms(root);
    
    const results: HitTestResult[] = [];
    this.collectAllHits(root, worldPoint, results);
    
    // Sort by hierarchy depth (front to back)
    results.sort((a, b) => this.compareHitDepth(a.node, b.node));
    
    return results.map(result => result.node);
  }
  
  /**
   * Hit test using spatial index for performance
   */
  private hitTestWithSpatialIndex(worldPoint: Point): SceneNode | null {
    if (!this.spatialIndex) return null;
    
    const candidates = this.spatialIndex.queryPoint(worldPoint);
    
    // Test candidates in hierarchy order
    let bestHit: SceneNode | null = null;
    let bestDepth = -1;
    
    for (const candidate of candidates) {
      if (this.testNodeHit(candidate, worldPoint)) {
        const depth = this.getNodeDepth(candidate);
        if (depth > bestDepth) {
          bestHit = candidate;
          bestDepth = depth;
        }
      }
    }
    
    return bestHit;
  }
  
  /**
   * Hierarchical hit test (depth-first, children before parents)
   */
  private hitTestHierarchical(node: SceneNode, worldPoint: Point): SceneNode | null {
    if (!node.visible || !node.interactive) {
      return null;
    }
    
    // Test children first (front to back in hierarchy)
    for (let i = node.children.length - 1; i >= 0; i--) {
      const hitChild = this.hitTestHierarchical(node.children[i], worldPoint);
      if (hitChild) {
        return hitChild; // Child hit takes precedence
      }
    }
    
    // Test this node if no children were hit
    if (node.selectable && this.testNodeHit(node, worldPoint)) {
      return node;
    }
    
    return null;
  }
  
  /**
   * Test if a specific node contains the world point
   */
  private testNodeHit(node: SceneNode, worldPoint: Point): boolean {
    // Transform world point to node's local space
    const localPoint = this.transformSystem.worldToLocal(node, worldPoint);
    
    // Use custom hit test if provided
    if (node.onHitTest) {
      return node.onHitTest(localPoint);
    }
    
    // Default hit test: point in bounds
    return this.pointInLocalBounds(localPoint, node);
  }
  
  /**
   * Test if a point is within a node's local bounds
   */
  private pointInLocalBounds(localPoint: Point, node: SceneNode): boolean {
    const { bounds } = node;
    return localPoint.x >= 0 && localPoint.x <= bounds.width &&
           localPoint.y >= 0 && localPoint.y <= bounds.height;
  }
  
  /**
   * Collect all nodes that hit the world point
   */
  private collectAllHits(node: SceneNode, worldPoint: Point, results: HitTestResult[]): void {
    if (!node.visible || !node.interactive) {
      return;
    }
    
    // Test this node
    if (node.selectable && this.testNodeHit(node, worldPoint)) {
      const localPoint = this.transformSystem.worldToLocal(node, worldPoint);
      results.push({
        node,
        localPoint,
        worldPoint,
        distance: this.calculateHitDistance(localPoint, node)
      });
    }
    
    // Test all children
    for (const child of node.children) {
      this.collectAllHits(child, worldPoint, results);
    }
  }
  
  /**
   * Calculate distance from hit point to node center (for sorting)
   */
  private calculateHitDistance(localPoint: Point, node: SceneNode): number {
    const centerX = node.bounds.width / 2;
    const centerY = node.bounds.height / 2;
    const dx = localPoint.x - centerX;
    const dy = localPoint.y - centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Compare two nodes by hierarchy depth (deeper = higher priority)
   */
  private compareHitDepth(a: SceneNode, b: SceneNode): number {
    return this.getNodeDepth(b) - this.getNodeDepth(a);
  }
  
  /**
   * Get the depth of a node in the hierarchy
   */
  private getNodeDepth(node: SceneNode): number {
    let depth = 0;
    let current = node.parent;
    while (current) {
      depth++;
      current = current.parent;
    }
    return depth;
  }
  
  /**
   * Update spatial index with current scene state
   */
  updateSpatialIndex(root: SceneNode): void {
    if (!this.enableSpatialIndex || !this.spatialIndex) {
      return;
    }
    
    this.spatialIndex.clear();
    this.addNodeToSpatialIndex(root);
  }
  
  /**
   * Recursively add nodes to spatial index
   */
  private addNodeToSpatialIndex(node: SceneNode): void {
    if (!this.spatialIndex) return;
    
    if (node.visible && node.interactive && node.selectable) {
      this.spatialIndex.insert(node);
    }
    
    for (const child of node.children) {
      this.addNodeToSpatialIndex(child);
    }
  }
  
  /**
   * Hit test within a bounds rectangle
   */
  hitTestBounds(root: SceneNode, worldBounds: Bounds): SceneNode[] {
    this.transformSystem.updateTransforms(root);
    
    if (this.enableSpatialIndex && this.spatialIndex) {
      return this.spatialIndex.queryBounds(worldBounds);
    } else {
      const results: SceneNode[] = [];
      this.collectBoundsHits(root, worldBounds, results);
      return results;
    }
  }
  
  /**
   * Collect all nodes that intersect with bounds
   */
  private collectBoundsHits(node: SceneNode, worldBounds: Bounds, results: SceneNode[]): void {
    if (!node.visible || !node.interactive) {
      return;
    }
    
    // Test this node
    if (node.selectable && this.nodeIntersectsBounds(node, worldBounds)) {
      results.push(node);
    }
    
    // Test children
    for (const child of node.children) {
      this.collectBoundsHits(child, worldBounds, results);
    }
  }
  
  /**
   * Test if a node intersects with world bounds
   */
  private nodeIntersectsBounds(node: SceneNode, worldBounds: Bounds): boolean {
    // Get node's world bounds
    const worldMatrix = this.transformSystem.getWorldMatrix(node);
    
    // Transform node's local bounds to world space
    const corners = [
      { x: 0, y: 0 },
      { x: node.bounds.width, y: 0 },
      { x: node.bounds.width, y: node.bounds.height },
      { x: 0, y: node.bounds.height }
    ];
    
    const worldCorners = corners.map(corner => worldMatrix.transformPoint(corner));
    
    // Simple AABB intersection test
    let minX = worldCorners[0].x;
    let maxX = worldCorners[0].x;
    let minY = worldCorners[0].y;
    let maxY = worldCorners[0].y;
    
    for (const corner of worldCorners) {
      minX = Math.min(minX, corner.x);
      maxX = Math.max(maxX, corner.x);
      minY = Math.min(minY, corner.y);
      maxY = Math.max(maxY, corner.y);
    }
    
    return !(maxX < worldBounds.x || minX > worldBounds.x + worldBounds.width ||
             maxY < worldBounds.y || minY > worldBounds.y + worldBounds.height);
  }
}