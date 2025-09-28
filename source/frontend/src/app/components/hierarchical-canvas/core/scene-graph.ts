/**
 * Kalisi Hierarchical Canvas - Scene Graph Data Structures
 * 
 * Core data structures for hierarchical canvas rendering with true parent-child
 * relationships and transform inheritance.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

/**
 * Transform represents the local transformation of a scene node
 * All transforms are relative to the parent node
 */
export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // in radians
  
  // Computed matrices (cached for performance)
  localMatrix: DOMMatrix;
  worldMatrix: DOMMatrix;
  isDirty: boolean;
}

/**
 * Style properties for visual appearance
 */
export interface NodeStyle {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  
  // Text-specific styles
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  textBaseline?: 'top' | 'middle' | 'bottom';
}

/**
 * Node types supported by the hierarchical canvas
 */
export type NodeType = 'group' | 'rectangle' | 'text';

/**
 * Base interface for all scene nodes
 * Implements hierarchical parent-child relationships with transform inheritance
 */
export interface SceneNode {
  // Identity
  readonly id: string;
  readonly type: NodeType;
  name?: string;
  
  // Hierarchy - true parent-child relationships
  parent: SceneNode | null;
  children: SceneNode[];
  
  // Local transform (relative to parent)
  transform: Transform;
  
  // Visual properties
  bounds: Size; // Local bounds (before transform)
  style: NodeStyle;
  
  // Interaction properties
  selectable: boolean;
  visible: boolean;
  interactive: boolean;
  
  // User data
  userData: Record<string, any>;
  
  // Lifecycle hooks for custom rendering and behavior
  onRender?(ctx: CanvasRenderingContext2D, worldMatrix: DOMMatrix): void;
  onUpdate?(deltaTime: number): void;
  onHitTest?(localPoint: Point): boolean;
  
  // Node manipulation methods
  addChild(child: SceneNode): void;
  removeChild(child: SceneNode): void;
  removeFromParent(): void;
  
  // Transform utilities
  markTransformDirty(): void;
  getWorldBounds(): Bounds;
  localToWorld(point: Point): Point;
  worldToLocal(point: Point): Point;
  
  // Hierarchy traversal
  traverse(callback: (node: SceneNode) => boolean | void): void;
  findChild(predicate: (node: SceneNode) => boolean): SceneNode | null;
  findChildren(predicate: (node: SceneNode) => boolean): SceneNode[];
}

/**
 * Rectangle-specific properties
 */
export interface RectangleNode extends SceneNode {
  type: 'rectangle';
  cornerRadius?: number;
}

/**
 * Text-specific properties
 */
export interface TextNode extends SceneNode {
  type: 'text';
  text: string;
  maxWidth?: number;
  lineHeight?: number;
}

/**
 * Group node for organizing children without visual representation
 */
export interface GroupNode extends SceneNode {
  type: 'group';
  clipChildren?: boolean; // Whether to clip children to group bounds
}

/**
 * Selection state for interactive nodes
 */
export interface Selection {
  nodes: SceneNode[];
  bounds: Bounds | null;
  
  // Selection manipulation
  add(node: SceneNode): void;
  remove(node: SceneNode): void;
  clear(): void;
  contains(node: SceneNode): boolean;
  
  // Multi-selection operations
  move(delta: Point): void;
  scale(factor: number, origin?: Point): void;
  rotate(angle: number, origin?: Point): void;
}

/**
 * Main hierarchical canvas interface
 * Manages the scene graph, viewport, and rendering pipeline
 */
export interface HierarchicalCanvas {
  // Canvas properties
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  
  // Scene graph
  readonly root: GroupNode;
  viewport: Viewport;
  selection: Selection;
  
  // Core operations
  addNode(node: SceneNode, parent?: SceneNode): void;
  removeNode(node: SceneNode): void;
  createNode<T extends SceneNode>(type: NodeType, properties?: Partial<T>): T;
  
  // Hit testing
  hitTest(screenPoint: Point): SceneNode | null;
  hitTestAll(screenPoint: Point): SceneNode[];
  
  // Coordinate transformations
  screenToWorld(screenPoint: Point): Point;
  worldToScreen(worldPoint: Point): Point;
  
  // Rendering
  render(): void;
  requestRender(): void; // Schedule render on next frame
  
  // View manipulation
  zoomToFit(nodes?: SceneNode[]): void;
  panTo(worldPoint: Point): void;
  setZoom(zoom: number, screenCenter?: Point): void;
  
  // State management
  saveState(): string; // JSON serialization
  loadState(state: string): void;
  
  // Event handling
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
}

/**
 * Event types emitted by the hierarchical canvas
 */
export interface CanvasEvents {
  'node:added': (node: SceneNode, parent: SceneNode | null) => void;
  'node:removed': (node: SceneNode) => void;
  'node:selected': (node: SceneNode) => void;
  'node:deselected': (node: SceneNode) => void;
  'selection:changed': (selection: SceneNode[]) => void;
  'viewport:changed': (viewport: Viewport) => void;
  'render:before': () => void;
  'render:after': () => void;
}

/**
 * Performance optimization options
 */
export interface CanvasOptions {
  // Performance
  enableSpatialIndex: boolean;
  enableRenderCulling: boolean;
  enableDirtyRegions: boolean;
  maxRenderFPS: number;
  
  // Interaction
  enableMultiSelect: boolean;
  selectOnMouseDown: boolean;
  
  // Grid and guides
  showGrid: boolean;
  gridSpacing: number;
  snapToGrid: boolean;
  
  // Debug
  showDebugInfo: boolean;
  highlightSelection: boolean;
}

/**
 * Factory for creating default transforms
 */
export function createTransform(
  x = 0, 
  y = 0, 
  scaleX = 1, 
  scaleY = 1, 
  rotation = 0
): Transform {
  return {
    x,
    y,
    scaleX,
    scaleY,
    rotation,
    localMatrix: new DOMMatrix(),
    worldMatrix: new DOMMatrix(),
    isDirty: true
  };
}

/**
 * Factory for creating default styles
 */
export function createStyle(overrides?: Partial<NodeStyle>): NodeStyle {
  return {
    fillColor: '#4A90E2',
    strokeColor: '#5BA3F5',
    strokeWidth: 2,
    opacity: 1.0,
    fontSize: 14,
    fontFamily: 'Roboto, sans-serif',
    fontWeight: 'normal',
    textAlign: 'center',
    textBaseline: 'middle',
    ...overrides
  };
}

/**
 * Utility for generating unique node IDs
 */
export function generateNodeId(prefix = 'node'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}