// Core data types for hierarchical canvas system

import { NodeLayoutConfig } from './node-config-manager';

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

  // Cascading layout configuration
  layoutConfig?: NodeLayoutConfig;
  _resolvedConfig?: any; // Cache for resolved config
  _configDirty?: boolean; // Dirty flag for config resolution
}

export interface Edge {
  id: string;
  fromGUID: string; // Source node GUID - ONLY identifier to use
  toGUID: string;   // Target node GUID - ONLY identifier to use
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
  metadata?: Record<string, unknown>;
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

export type NodeShape = 'rounded' | 'rectangle' | 'circle' | 'triangle';

export interface NodeStyleOverrides {
  fill?: string;
  stroke?: string;
  icon?: string;
  badges?: Array<{ text: string; color?: string }>;
  cornerRadius?: number;
  shape?: NodeShape;
  labelVisible?: boolean;
}

export interface EdgeStyleOverrides {
  stroke?: string;
  strokeWidth?: number;
  strokeDashArray?: number[] | null;
  label?: string;
  labelVisible?: boolean;
}

export type StyleApplicationScope = 'node' | 'type';

export interface NodeStyleSnapshot {
  readonly fill: string;
  readonly stroke: string;
  readonly icon?: string;
  readonly shape: NodeShape;
  readonly cornerRadius: number;
  readonly labelVisible: boolean;
}

export interface NodeSelectionSnapshot {
  readonly kind: 'node';
  readonly id: string;
  readonly guid?: string;
  readonly text?: string;
  readonly label: string;
  readonly type: string;
  readonly style: NodeStyleSnapshot;
  readonly overrides: NodeStyleOverrides;
  readonly layoutConfig?: {
    layoutStrategy?: string;
    renderStyle?: {
      nodeMode?: string;
    };
  };
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
