// View Models for EDT Views Engine

export interface View {
  id: string;
  name: string;
  description?: string;
  query: string;
  plugin: string;
  config?: any;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  shared?: ViewShare[];
}

export interface ViewShare {
  userId: string;
  permission: 'read' | 'write' | 'admin';
  sharedAt: Date;
}

export interface ViewTab {
  id: string;
  viewId: string;
  name: string;
  description?: string;
  query: string;
  plugin: string;
  isDirty?: boolean;
  isLoading?: boolean;
}

export interface GraphNode {
  id: string;
  label?: string;
  type?: string;
  properties: Record<string, any>;
  x: number;
  y: number;
  radius?: number;
  selected?: boolean;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  properties: Record<string, any>;
  source?: GraphNode;
  target?: GraphNode;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export interface NodeStyle {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  textColor?: string;
  font?: string;
}

export interface EdgeStyle {
  strokeColor?: string;
  strokeWidth?: number;
  curved?: boolean;
  directed?: boolean;
  dashed?: boolean;
}

// Plugin related models
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  category?: string;
}

export interface PluginContext {
  canvas: HTMLCanvasElement;
  viewId: string;
  theme: any; // Will use Angular Material theme
  dataService: any; // Will be injected
  eventBus: any; // Event emitter
  user: any; // User context
  permissions: any; // View permissions
}

export interface ViewPlugin {
  // Metadata
  metadata: PluginMetadata;
  
  // Lifecycle
  initialize(context: PluginContext): void;
  render(data: GraphData, renderer: any): void;
  destroy(): void;
  
  // Optional handlers
  onNodeClick?(node: GraphNode): void;
  onNodeHover?(node: GraphNode): void;
  onNodeDrag?(node: GraphNode, delta: Point): void;
  onCanvasClick?(point: Point): void;
  onCanvasDrag?(delta: Point): void;
  
  // Optional layout
  layout?(nodes: GraphNode[], edges: GraphEdge[]): void;
}

// Events
export interface ViewEvent {
  type: 'node-click' | 'node-hover' | 'canvas-click' | 'zoom' | 'pan';
  data: any;
}

// API Models
export interface CreateViewRequest {
  name: string;
  description?: string;
  query: string;
  plugin: string;
  config?: any;
}

export interface ViewResponse {
  success: boolean;
  data?: View;
  error?: string;
}

export interface GraphDataResponse {
  success: boolean;
  data?: GraphData;
  error?: string;
}