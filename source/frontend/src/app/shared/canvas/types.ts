// Core data types for hierarchical canvas system

export interface HierarchicalNode {
  id: string;
  GUID?: string; // The ONLY reliable identifier for nodes
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  style: {
    fill: string;
    stroke: string;
    icon?: string;
  };
  children: HierarchicalNode[];
  // Runtime state properties
  selected?: boolean;
  visible?: boolean;
  collapsed?: boolean;
  dragging?: boolean;
  metadata?: Record<string, any>; // For renderer-specific data

  // Fold/unfold state
  inheritedEdges?: Edge[]; // Edges inherited from collapsed children
}

export interface Edge {
  id: string;
  from: string;  // Should be GUID
  to: string;    // Should be GUID
  fromGUID?: string; // Explicit GUID reference
  toGUID?: string;   // Explicit GUID reference
  label: string;
  style: {
    stroke: string;
    strokeWidth: number;
    strokeDashArray?: number[] | null;
  };
  waypoints?: Point[]; // Optional orthogonal routing waypoints
  metadata?: Record<string, any>; // For renderer-specific data
}

export interface CanvasData {
  nodes: HierarchicalNode[];
  edges: Edge[];
  originalEdges: Edge[];
  camera?: Camera;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

// Events for interaction system
export interface NodeEvent {
  node: HierarchicalNode;
  worldPosition: Point;
  screenPosition: Point;
  path: HierarchicalNode[];
}

export interface InteractionEvent extends NodeEvent {
  originalEvent: CanvasPointerEvent;
  handled: boolean;
}

/**
 * Minimal subset of pointer/mouse event data that works in both DOM and worker environments.
 * Workers do not have DOM typings such as MouseEvent, so we model the properties we actually consume.
 */
export type CanvasPointerEvent = Event & {
  clientX?: number;
  clientY?: number;
  movementX?: number;
  movementY?: number;
  button?: number;
  buttons?: number;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  deltaX?: number;
  deltaY?: number;
  deltaMode?: number;
  [key: string]: unknown;
};
