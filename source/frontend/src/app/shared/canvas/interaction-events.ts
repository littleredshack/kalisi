import { HierarchicalNode, Point } from './types';

/**
 * Standardized interaction event types for canvas operations
 * Provides clean separation between event handling and computational logic
 */

export type InteractionEventType =
  | 'select'
  | 'drag-start'
  | 'drag-update'
  | 'drag-stop'
  | 'resize-start'
  | 'resize-update'
  | 'resize-stop'
  | 'hit-test-resize'
  | 'double-click';

export interface BaseInteractionEvent {
  type: InteractionEventType;
  worldPos: Point;
  screenPos?: Point;
}

export interface SelectEvent extends BaseInteractionEvent {
  type: 'select';
}

export interface DragStartEvent extends BaseInteractionEvent {
  type: 'drag-start';
  screenPos: Point;
}

export interface DragUpdateEvent extends BaseInteractionEvent {
  type: 'drag-update';
}

export interface DragStopEvent extends BaseInteractionEvent {
  type: 'drag-stop';
}

export interface ResizeStartEvent extends BaseInteractionEvent {
  type: 'resize-start';
  node: HierarchicalNode;
  handle: string;
  screenPos: Point;
}

export interface ResizeUpdateEvent extends BaseInteractionEvent {
  type: 'resize-update';
  node: HierarchicalNode;
  handle: string;
  screenPos: Point;
}

export interface ResizeStopEvent extends BaseInteractionEvent {
  type: 'resize-stop';
}

export interface HitTestResizeEvent extends BaseInteractionEvent {
  type: 'hit-test-resize';
  node: HierarchicalNode;
  screenPos: Point;
}

export interface DoubleClickEvent extends BaseInteractionEvent {
  type: 'double-click';
  nodeGuid: string;
  timeSinceLastClick: number;
}

export type InteractionEvent =
  | SelectEvent
  | DragStartEvent
  | DragUpdateEvent
  | DragStopEvent
  | ResizeStartEvent
  | ResizeUpdateEvent
  | ResizeStopEvent
  | HitTestResizeEvent
  | DoubleClickEvent;

/**
 * Result types for interaction events
 */
export interface SelectResult {
  selectedNode: HierarchicalNode | null;
}

export interface DragStartResult {
  draggedNode: HierarchicalNode | null;
}

export interface DragUpdateResult {
  dragHandled: boolean;
}

export interface HitTestResizeResult {
  handle: string;
}

export interface DoubleClickResult {
  handled: boolean;
  nodeGuid: string;
}

export type InteractionEventResult =
  | SelectResult
  | DragStartResult
  | DragUpdateResult
  | HitTestResizeResult
  | DoubleClickResult
  | void;