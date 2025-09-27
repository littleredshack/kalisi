/**
 * Kalisi Hierarchical Canvas - Transform System
 * 
 * Manages hierarchical transform inheritance using DOMMatrix for optimal performance.
 * Implements dirty flag system for efficient matrix updates.
 */

import { Transform, SceneNode, Point } from './scene-graph';

/**
 * Transform system manages hierarchical matrix inheritance
 * Uses dirty flags to minimize expensive matrix computations
 */
export class TransformSystem {
  private dirtyNodes = new Set<SceneNode>();
  
  /**
   * Mark a node's transform as dirty and propagate to children
   */
  markDirty(node: SceneNode): void {
    if (!node.transform.isDirty) {
      node.transform.isDirty = true;
      this.dirtyNodes.add(node);
      
      // Propagate dirty flag to all children
      this.propagateDirtyToChildren(node);
    }
  }
  
  /**
   * Update transforms for all dirty nodes in the scene graph
   */
  updateTransforms(root: SceneNode): void {
    if (this.dirtyNodes.size === 0) return;
    
    // Update transforms in hierarchy order (parents before children)
    this.updateNodeTransforms(root);
    
    // Clear dirty nodes set
    this.dirtyNodes.clear();
  }
  
  /**
   * Recursively update transforms for a node and its children
   */
  private updateNodeTransforms(node: SceneNode): void {
    if (node.transform.isDirty) {
      this.computeTransformMatrices(node);
      node.transform.isDirty = false;
      this.dirtyNodes.delete(node);
    }
    
    // Update children (they may also be dirty)
    for (const child of node.children) {
      this.updateNodeTransforms(child);
    }
  }
  
  /**
   * Compute local and world matrices for a node
   */
  private computeTransformMatrices(node: SceneNode): void {
    const transform = node.transform;
    
    // Compute local matrix from transform properties
    transform.localMatrix = this.createLocalMatrix(transform);
    
    // Compute world matrix by inheriting parent transform
    if (node.parent) {
      // Ensure parent transform is up to date
      if (node.parent.transform.isDirty) {
        this.updateNodeTransforms(node.parent);
      }
      
      // World matrix = parent world matrix * local matrix
      transform.worldMatrix = new DOMMatrix()
        .multiplySelf(node.parent.transform.worldMatrix)
        .multiplySelf(transform.localMatrix);
    } else {
      // Root node: world matrix equals local matrix
      transform.worldMatrix = new DOMMatrix(transform.localMatrix);
    }
  }
  
  /**
   * Create local transformation matrix from transform properties
   */
  private createLocalMatrix(transform: Transform): DOMMatrix {
    const matrix = new DOMMatrix();
    
    // Apply transformations in correct order: translate -> rotate -> scale
    matrix.translateSelf(transform.x, transform.y);
    
    if (transform.rotation !== 0) {
      matrix.rotateSelf(transform.rotation * 180 / Math.PI); // DOMMatrix uses degrees
    }
    
    if (transform.scaleX !== 1 || transform.scaleY !== 1) {
      matrix.scaleSelf(transform.scaleX, transform.scaleY);
    }
    
    return matrix;
  }
  
  /**
   * Propagate dirty flag to all descendants
   */
  private propagateDirtyToChildren(node: SceneNode): void {
    for (const child of node.children) {
      if (!child.transform.isDirty) {
        child.transform.isDirty = true;
        this.dirtyNodes.add(child);
        this.propagateDirtyToChildren(child);
      }
    }
  }
  
  /**
   * Transform a point from local space to world space
   */
  localToWorld(node: SceneNode, localPoint: Point): Point {
    // Ensure transform is up to date
    if (node.transform.isDirty) {
      this.updateNodeTransforms(node);
    }
    
    const transformed = node.transform.worldMatrix.transformPoint(localPoint);
    return { x: transformed.x, y: transformed.y };
  }
  
  /**
   * Transform a point from world space to local space
   */
  worldToLocal(node: SceneNode, worldPoint: Point): Point {
    // Ensure transform is up to date
    if (node.transform.isDirty) {
      this.updateNodeTransforms(node);
    }
    
    const inverse = node.transform.worldMatrix.inverse();
    const transformed = inverse.transformPoint(worldPoint);
    return { x: transformed.x, y: transformed.y };
  }
  
  /**
   * Get the world transform matrix for a node
   */
  getWorldMatrix(node: SceneNode): DOMMatrix {
    if (node.transform.isDirty) {
      this.updateNodeTransforms(node);
    }
    return new DOMMatrix(node.transform.worldMatrix);
  }
  
  /**
   * Get the local transform matrix for a node
   */
  getLocalMatrix(node: SceneNode): DOMMatrix {
    if (node.transform.isDirty) {
      this.computeTransformMatrices(node);
      node.transform.isDirty = false;
    }
    return new DOMMatrix(node.transform.localMatrix);
  }
  
  /**
   * Apply a transform to move a node
   */
  translateNode(node: SceneNode, deltaX: number, deltaY: number): void {
    node.transform.x += deltaX;
    node.transform.y += deltaY;
    this.markDirty(node);
  }
  
  /**
   * Apply a transform to scale a node
   */
  scaleNode(node: SceneNode, scaleX: number, scaleY: number, origin?: Point): void {
    if (origin) {
      // Scale around a specific point (not the node's origin)
      const localOrigin = this.worldToLocal(node, origin);
      
      // Translate to origin, scale, translate back
      node.transform.x += localOrigin.x * (1 - scaleX);
      node.transform.y += localOrigin.y * (1 - scaleY);
    }
    
    node.transform.scaleX *= scaleX;
    node.transform.scaleY *= scaleY;
    this.markDirty(node);
  }
  
  /**
   * Apply a transform to rotate a node
   */
  rotateNode(node: SceneNode, deltaRotation: number, origin?: Point): void {
    if (origin) {
      // Rotate around a specific point (not the node's origin)
      const localOrigin = this.worldToLocal(node, origin);
      
      // Convert to matrix operations for complex rotation around point
      const cos = Math.cos(deltaRotation);
      const sin = Math.sin(deltaRotation);
      
      const dx = localOrigin.x * (1 - cos) + localOrigin.y * sin;
      const dy = localOrigin.y * (1 - cos) - localOrigin.x * sin;
      
      node.transform.x += dx;
      node.transform.y += dy;
    }
    
    node.transform.rotation += deltaRotation;
    this.markDirty(node);
  }
  
  /**
   * Set absolute position for a node
   */
  setPosition(node: SceneNode, x: number, y: number): void {
    node.transform.x = x;
    node.transform.y = y;
    this.markDirty(node);
  }
  
  /**
   * Set absolute scale for a node
   */
  setScale(node: SceneNode, scaleX: number, scaleY: number): void {
    node.transform.scaleX = scaleX;
    node.transform.scaleY = scaleY;
    this.markDirty(node);
  }
  
  /**
   * Set absolute rotation for a node
   */
  setRotation(node: SceneNode, rotation: number): void {
    node.transform.rotation = rotation;
    this.markDirty(node);
  }
  
  /**
   * Reset transform to identity
   */
  resetTransform(node: SceneNode): void {
    node.transform.x = 0;
    node.transform.y = 0;
    node.transform.scaleX = 1;
    node.transform.scaleY = 1;
    node.transform.rotation = 0;
    this.markDirty(node);
  }
  
  /**
   * Clone transform from another node
   */
  copyTransform(target: SceneNode, source: SceneNode): void {
    target.transform.x = source.transform.x;
    target.transform.y = source.transform.y;
    target.transform.scaleX = source.transform.scaleX;
    target.transform.scaleY = source.transform.scaleY;
    target.transform.rotation = source.transform.rotation;
    this.markDirty(target);
  }
  
  /**
   * Get statistics about transform system performance
   */
  getDebugInfo(): {
    dirtyNodesCount: number;
    totalTransformUpdates: number;
  } {
    return {
      dirtyNodesCount: this.dirtyNodes.size,
      totalTransformUpdates: 0 // Could track this for performance monitoring
    };
  }
}