/**
 * Data Mapping Service for WASM-WebGL Integration
 * 
 * This service provides conversion functions between Kalisi's canvas data format
 * and the WASM-WebGL library's expected data structures.
 */

import { Injectable } from '@angular/core';

export interface KalisiCanvasNode {
  id: string;
  x: number;
  y: number;
  label: string;
  type: string;
  properties?: any;
}

export interface KalisiCanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface KalisiCanvasData {
  nodes: KalisiCanvasNode[];
  edges: KalisiCanvasEdge[];
  transform: { x: number; y: number; scale: number };
}

export interface WasmWebGLEntity {
  id: string;
  groupType: 'container' | 'item';
  text: string;
  position: { x: number; y: number };
  size: { x: number; y: number };
  parentId?: string | null;
  children: string[];
  expanded: boolean;
  visible: boolean;
  icon: string;
  color: string;
  properties?: any;
}

export interface WasmWebGLConnection {
  id: string;
  fromId: string;
  toId: string;
  type: 'straight' | 'curved' | 'orthogonal' | 'orthogonalCurved';
  label?: string;
  color?: string;
  lineWidth?: number;
  style?: 'solid' | 'dashed';
}

export interface WasmWebGLData {
  entities: { [id: string]: WasmWebGLEntity };
  connections: WasmWebGLConnection[];
  view: {
    panX: number;
    panY: number;
    zoom: number;
    smoothPanX?: number;
    smoothPanY?: number;
    smoothZoom?: number;
    panSensitivity?: number;
    zoomSensitivity?: number;
  };
  render?: {
    mode?: 'clipart' | 'linedraw';
    backgroundColor?: string;
    gridColor?: string;
    showGrid?: boolean;
    selectionColor?: string;
    font?: string;
    fontSize?: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class DataMappingService {

  /**
   * Convert Kalisi canvas data to WASM-WebGL format
   */
  mapKalisiToWasmWebGL(canvasData: KalisiCanvasData): WasmWebGLData {
    const entities: { [id: string]: WasmWebGLEntity } = {};
    
    // Map nodes to entities
    canvasData.nodes.forEach(node => {
      entities[node.id] = {
        id: node.id,
        groupType: this.determineGroupType(node),
        text: node.label || node.id,
        position: { x: node.x, y: node.y },
        size: this.determineNodeSize(node),
        parentId: null,
        children: [],
        expanded: true,
        visible: true,
        icon: this.determineIcon(node.type),
        color: this.determineColor(node),
        properties: node.properties
      };
    });

    // Map edges to connections
    const connections: WasmWebGLConnection[] = canvasData.edges.map(edge => ({
      id: edge.id,
      fromId: edge.source,
      toId: edge.target,
      type: 'orthogonalCurved',
      label: edge.label,
      color: '#666666',
      lineWidth: 2,
      style: 'solid'
    }));

    return {
      entities,
      connections,
      view: {
        panX: canvasData.transform?.x || 0,
        panY: canvasData.transform?.y || 0,
        zoom: canvasData.transform?.scale || 1,
        smoothPanX: canvasData.transform?.x || 0,
        smoothPanY: canvasData.transform?.y || 0,
        smoothZoom: canvasData.transform?.scale || 1,
        panSensitivity: 1.0,
        zoomSensitivity: 3.0
      },
      render: {
        mode: 'clipart',
        backgroundColor: '#1a1a2e',
        gridColor: 'rgba(255,255,255,0.1)',
        showGrid: true,
        selectionColor: '#4CAF50',
        font: 'Inter',
        fontSize: 2.5
      }
    };
  }

  /**
   * Convert WASM-WebGL data back to Kalisi format
   */
  mapWasmWebGLToKalisi(wasmData: WasmWebGLData): KalisiCanvasData {
    // Map entities to nodes
    const nodes: KalisiCanvasNode[] = Object.values(wasmData.entities).map(entity => ({
      id: entity.id,
      x: entity.position.x,
      y: entity.position.y,
      label: entity.text,
      type: this.wasmGroupTypeToKalisiType(entity.groupType),
      properties: entity.properties
    }));

    // Map connections to edges
    const edges: KalisiCanvasEdge[] = wasmData.connections.map(conn => ({
      id: conn.id,
      source: conn.fromId,
      target: conn.toId,
      label: conn.label
    }));

    return {
      nodes,
      edges,
      transform: {
        x: wasmData.view.panX,
        y: wasmData.view.panY,
        scale: wasmData.view.zoom
      }
    };
  }

  /**
   * Create a new WASM-WebGL entity from partial data
   */
  createWasmEntity(partial: Partial<WasmWebGLEntity>): WasmWebGLEntity {
    return {
      id: partial.id || this.generateEntityId(),
      groupType: partial.groupType || 'item',
      text: partial.text || 'New Entity',
      position: partial.position || { x: 0, y: 0 },
      size: partial.size || { x: 80, y: 60 },
      parentId: partial.parentId || null,
      children: partial.children || [],
      expanded: partial.expanded !== undefined ? partial.expanded : true,
      visible: partial.visible !== undefined ? partial.visible : true,
      icon: partial.icon || 'default',
      color: partial.color || '#2196F3',
      properties: partial.properties || {}
    };
  }

  /**
   * Create a new WASM-WebGL connection
   */
  createWasmConnection(fromId: string, toId: string, options: Partial<WasmWebGLConnection> = {}): WasmWebGLConnection {
    return {
      id: options.id || this.generateConnectionId(),
      fromId,
      toId,
      type: options.type || 'orthogonalCurved',
      label: options.label,
      color: options.color || '#666666',
      lineWidth: options.lineWidth || 2,
      style: options.style || 'solid'
    };
  }

  /**
   * Validate WASM-WebGL data structure
   */
  validateWasmData(data: any): data is WasmWebGLData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check required properties
    if (!data.entities || !data.connections || !data.view) {
      return false;
    }

    // Check entities structure
    if (typeof data.entities !== 'object') {
      return false;
    }

    // Check connections array
    if (!Array.isArray(data.connections)) {
      return false;
    }

    // Check view object
    if (typeof data.view.panX !== 'number' || 
        typeof data.view.panY !== 'number' || 
        typeof data.view.zoom !== 'number') {
      return false;
    }

    return true;
  }

  /**
   * Validate Kalisi canvas data structure
   */
  validateKalisiData(data: any): data is KalisiCanvasData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check required arrays
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
      return false;
    }

    // Check transform object
    if (!data.transform || typeof data.transform !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * Private helper methods
   */
  private determineGroupType(node: KalisiCanvasNode): 'container' | 'item' {
    // Logic to determine if a node should be a container or item
    // This could be based on node type, properties, or other criteria
    if (node.type === 'group' || node.type === 'container') {
      return 'container';
    }
    return 'item';
  }

  private determineNodeSize(node: KalisiCanvasNode): { x: number; y: number } {
    // Determine node size based on type or default values
    const sizeMap: { [type: string]: { x: number; y: number } } = {
      'container': { x: 120, y: 80 },
      'group': { x: 120, y: 80 },
      'task': { x: 80, y: 60 },
      'default': { x: 80, y: 60 }
    };

    return sizeMap[node.type] || sizeMap['default'];
  }

  private determineIcon(nodeType: string): string {
    const iconMap: { [type: string]: string } = {
      'container': 'folder',
      'group': 'folder',
      'task': 'task',
      'process': 'cog',
      'data': 'database',
      'decision': 'diamond',
      'default': 'circle'
    };

    return iconMap[nodeType] || iconMap['default'];
  }

  private determineColor(node: KalisiCanvasNode): string {
    // Determine color based on node type or properties
    const colorMap: { [type: string]: string } = {
      'container': '#4a90e2',
      'group': '#4a90e2',
      'task': '#7ed321',
      'process': '#f5a623',
      'data': '#50e3c2',
      'decision': '#d0021b',
      'default': '#2196F3'
    };

    return colorMap[node.type] || colorMap['default'];
  }

  private wasmGroupTypeToKalisiType(groupType: 'container' | 'item'): string {
    return groupType === 'container' ? 'group' : 'task';
  }

  private generateEntityId(): string {
    return 'entity_' + Math.random().toString(36).substr(2, 9);
  }

  private generateConnectionId(): string {
    return 'conn_' + Math.random().toString(36).substr(2, 9);
  }
}