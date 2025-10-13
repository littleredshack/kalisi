// Worker-safe type definitions that exclude DOM-dependent interfaces

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface HierarchicalNode {
  id: string;
  GUID: string;
  name?: string;
  nodeType?: string;
  position: Position;
  width?: number;
  height?: number;
  visible?: boolean;
  collapsed?: boolean;
  children?: HierarchicalNode[];
  parent?: HierarchicalNode;
  metadata?: Record<string, any>;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  edgeType?: string;
  visible?: boolean;
  metadata?: Record<string, any>;
}

export interface CanvasData {
  nodes: HierarchicalNode[];
  edges: Edge[];
  camera?: Camera;
}