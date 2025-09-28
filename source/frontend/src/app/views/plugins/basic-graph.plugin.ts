import { ViewPlugin, PluginMetadata, PluginContext, GraphData, GraphNode, GraphEdge } from '../models/view.models';
import { CanvasRenderer } from '../services/canvas-renderer.service';

export class BasicGraphPlugin implements ViewPlugin {
  metadata: PluginMetadata = {
    id: 'basic-graph',
    name: 'Basic Graph Display',
    version: '1.0.0',
    description: 'Displays all nodes and relationships with force-directed layout',
    author: 'OPEN EDT System',
    category: 'Core'
  };

  private context?: PluginContext;
  private simulation?: any; // Force simulation (to be implemented)

  initialize(context: PluginContext): void {
    this.context = context;
    
    // Initialize force simulation or other setup
    this.setupForceSimulation();
  }

  render(data: GraphData, renderer: CanvasRenderer): void {
    if (!data || !renderer) return;

    // Apply simple force-directed layout if nodes don't have positions
    this.applyLayout(data);

    // Render edges first (behind nodes)
    data.edges.forEach(edge => {
      if (edge.source && edge.target) {
        renderer.drawEdge(edge, {
          strokeColor: '#cccccc',
          strokeWidth: 1,
          directed: true,
          curved: false
        });
      }
    });

    // Render nodes
    data.nodes.forEach(node => {
      renderer.drawNode(node, {
        fillColor: this.getNodeColor(node.type),
        strokeColor: node.selected ? '#3f51b5' : '#ffffff',
        strokeWidth: node.selected ? 3 : 2,
        textColor: '#ffffff'
      });
    });
  }

  destroy(): void {
    this.context = undefined;
    this.simulation = undefined;
  }

  onNodeClick?(node: GraphNode): void {
    node.selected = !node.selected;
  }

  onNodeHover?(node: GraphNode): void {
    // Visual feedback for hover could be implemented here
  }

  onCanvasClick?(point: { x: number; y: number }): void {
    // Could deselect all nodes or create new nodes here
  }

  onNodeDrag?(node: GraphNode, delta: { x: number; y: number }): void {
    // Update node position
    node.x += delta.x;
    node.y += delta.y;
  }

  private setupForceSimulation(): void {
    // Simple force simulation setup
    // In a real implementation, this would use D3's force simulation or similar
  }

  private applyLayout(data: GraphData): void {
    // Simple layout algorithm - circular arrangement if nodes don't have positions
    const needsLayout = data.nodes.some(node => node.x === 0 && node.y === 0);
    
    if (needsLayout && data.nodes.length > 0) {
      const centerX = 400; // Canvas center (should be dynamic)
      const centerY = 300;
      const radius = Math.min(centerX, centerY) * 0.7;
      
      data.nodes.forEach((node, index) => {
        const angle = (2 * Math.PI * index) / data.nodes.length;
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
        node.radius = node.radius || 20;
      });
      
      // Link edges to nodes
      data.edges.forEach(edge => {
        edge.source = data.nodes.find(n => n.id === edge.sourceId);
        edge.target = data.nodes.find(n => n.id === edge.targetId);
      });
    }
  }

  private getNodeColor(nodeType?: string): string {
    const colors: Record<string, string> = {
      'Person': '#4caf50',
      'Company': '#2196f3',
      'Transaction': '#ff9800',
      'Document': '#9c27b0',
      'Project': '#795548',
      'Department': '#607d8b'
    };

    return colors[nodeType || ''] || '#757575';
  }

  // Layout method for plugin interface
  layout?(nodes: GraphNode[], edges: GraphEdge[]): void {
    // Apply force-directed or other layout algorithm
    this.applyLayout({ nodes, edges });
  }
}