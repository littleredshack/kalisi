import { Component, ElementRef, ViewChild, AfterViewInit, OnInit, OnDestroy, ChangeDetectorRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Neo4jDataService } from '../../core/services/neo4j-data.service';
import { ViewNodeStateService } from '../../core/services/view-node-state.service';
import { DynamicLayoutService } from '../../core/services/dynamic-layout.service';
import { MessageService } from 'primeng/api';
import { ComposableHierarchicalCanvasEngine } from '../../shared/canvas/composable-hierarchical-canvas-engine';
import { HierarchicalNode, Edge, CanvasData, Camera } from '../../shared/canvas/types';
import { GridLayoutEngine } from '../../shared/layouts/grid-layout';
import { ComponentFactory } from '../../shared/canvas/component-factory';
import { CanvasControlService, CanvasController, CameraInfo } from '../../core/services/canvas-control.service';
import { CanvasViewStateService } from '../../shared/canvas/state/canvas-view-state.service';

@Component({
  selector: 'app-modular-canvas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="canvas-interface">
      <canvas #canvas class="full-canvas"
              (mousedown)="onMouseDown($event)"
              (mousemove)="onMouseMove($event)"
              (mouseup)="onMouseUp($event)"
              (wheel)="onWheel($event)"></canvas>
    </div>
  `,
  styles: [`
    .canvas-interface {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      background: #0b0f14;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }

    .full-canvas {
      width: 100%;
      height: 100%;
      border: 1px solid #4b5563;
      background: #0b0f14;
      display: block;
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
  `]
})
export class ModularCanvasComponent implements OnInit, AfterViewInit, OnDestroy, CanvasController {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() engineDataChanged = new EventEmitter<void>();
  
  // FR-030: Input to receive selected ViewNode from parent
  selectedViewNode: any | null = null;
  private pendingViewNodeLayout: CanvasData | null = null;
  private rawViewNodeData: {entities: any[], relationships: any[]} | null = null;
  private canvasId = 'modular-canvas';

  // Level selector state
  availableLevels: number[] = [];
  
  constructor(
    private cdr: ChangeDetectorRef,
    private neo4jDataService: Neo4jDataService,
    private viewNodeState: ViewNodeStateService,
    private dynamicLayoutService: DynamicLayoutService,
    private messageService: MessageService,
    private http: HttpClient,
    private canvasControlService: CanvasControlService,
    private canvasViewStateService: CanvasViewStateService
  ) {
    // Engine-only mode - no reactive effects
  }
  
  public engine: ComposableHierarchicalCanvasEngine | null = null;
  data: CanvasData | null = null;
  cameraInfo = { x: 0, y: 0, zoom: 1.0 };
  
  // Component state

  ngAfterViewInit(): void {
    // Canvas is ready - but wait for data to be loaded before creating engine
    this.resizeCanvas();
    // Register this canvas with the control service
    this.canvasControlService.registerCanvas(this);
  }

  ngOnDestroy(): void {
    // No automatic saving - layout persistence handled by explicit Save button
    // Unregister from control service
    this.canvasControlService.unregisterCanvas();
    this.engine?.destroy();
  }

  async ngOnInit(): Promise<void> {
    // Subscribe to ViewNode selection from service
    this.viewNodeState.selectedViewNode.subscribe(viewNode => {
      if (viewNode) {
        this.selectedViewNode = viewNode;
        this.loadViewNodeData(viewNode.id);
      }
    });
  }
  
  // Panel width methods removed - no longer needed

  // Load data from Neo4j with fallback to hardcoded
  private async loadData(): Promise<void> {
    try {
      // FR-030: For ViewNodes, the data loading is handled in setViewNode()
      // For non-ViewNode cases, load normally
      const selectedEntityId = this.getSelectedEntityId();
      
      if (selectedEntityId && this.isViewNodeId(selectedEntityId)) {
        // ViewNode data loading is handled separately in setViewNode()
        this.data = this.createDefaultData(); // Temporary data
        return; // Exit early, don't create engine yet
      } else {
        // Fallback to original test-modular loading
        const neo4jData = await this.neo4jDataService.getViewGraph('test-modular');
          
        if (neo4jData.entities.length > 0) {
          this.data = this.convertToHierarchicalFormat(neo4jData);
        } else {
          this.data = this.createDefaultData();
        }
      }
      
      // Create engine NOW that data is ready
      this.createEngineWithData();
    } catch (error) {
      console.error('Neo4j query failed:', error);
      this.data = this.createDefaultData();
      
      // Create engine with fallback data
      this.createEngineWithData();
    }
  }

  // FR-030: Get selected entity ID from parent component
  private getSelectedEntityId(): string | null {
    // Access the selected entity from the parent component context
    // This is a temporary solution - we need to pass this via Input
    
    // Check browser URL or other indicators for now
    // In a proper implementation, this would be an @Input() property
    return null; // Will be enhanced when we integrate fully
  }

  // FR-030: Check if ID looks like a ViewNode UUID
  private isViewNodeId(id: string): boolean {
    // UUIDs have specific format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  // FR-030: Load data from ViewNode and recreate engine
  private async loadViewNodeData(viewNodeId: string): Promise<void> {
    try {
      // Get all ViewNodes and find the one we need
      const viewNodes = await this.neo4jDataService.getAllViewNodes();
      const viewNode = viewNodes.find(vn => vn.id === viewNodeId);


      if (!viewNode) {
        console.error('🔍 DEBUG: ViewNode not found for id:', viewNodeId);
        return;
      }
      // Store the viewNode for createEngineWithData to use
      this.selectedViewNode = viewNode;
      this.canvasId = viewNode.id || 'modular-canvas';

      if (viewNode.layout_engine === 'tree-table') {
        const treeTableData = await this.neo4jDataService.fetchTreeTable(viewNode);
        this.rawViewNodeData = {
          entities: [{ treeTableData }],
          relationships: []
        } as any;
        this.createEngineWithData();
        return;
      }

      // Execute ViewNode query for canvas-based views
      const result = await this.neo4jDataService.executeViewNodeQuery(viewNode);


      if (result.entities.length > 0) {
        // Store raw data for layout engine processing during engine creation
        this.rawViewNodeData = result;
        
        // If ViewNode has saved layout, use it directly
        if (viewNode.layout) {
          try {
            const savedLayoutData = JSON.parse(viewNode.layout);
            if (savedLayoutData.nodes && savedLayoutData.nodes.length > 0) {
              this.normaliseCanvasData(savedLayoutData);
              this.data = savedLayoutData;
              this.rawViewNodeData = null; // Don't process with strategy
            } else {
              this.data = this.createDefaultData(); // Temporary placeholder
            }
          } catch (error) {
            this.data = this.createDefaultData(); // Temporary placeholder
          }
        } else {
          this.data = this.createDefaultData(); // Temporary placeholder
        }

        // After loading layout data, also load Auto Layout settings
        const autoLayoutState = viewNode.autoLayoutSettings
          ? JSON.parse(viewNode.autoLayoutSettings)
          : { collapseBehavior: 'full-size', reflowBehavior: 'static' };

        try {
          this.viewNodeState.setCollapseBehavior(autoLayoutState.collapseBehavior);
          this.viewNodeState.setReflowBehavior(autoLayoutState.reflowBehavior);
        } catch (error) {
          // Use defaults if parsing fails
          this.viewNodeState.setCollapseBehavior('full-size');
          this.viewNodeState.setReflowBehavior('static');
        }
        
        // Create engine with ViewNode data
        this.createEngineWithData();
      } else {
        // No data from query, use default data but still create engine with ViewNode settings
        this.data = this.createDefaultData();
        this.createEngineWithData();
      }

    } catch (error) {
      console.error('ViewNode data loading failed:', error);
      // On error, still create engine with default data
      this.data = this.createDefaultData();
      this.createEngineWithData();
    }
  }

  // FR-030: Apply saved layout from ViewNode
  private applyViewNodeLayout(layoutJson: string): void {
    try {
      const layout = JSON.parse(layoutJson);
      this.normaliseCanvasData(layout);
      // Apply layout directly to engine if it exists, otherwise store for later
      if (this.engine) {
        this.canvasViewStateService.initialize(this.canvasId, layout, 'external');
        this.engine.setData(layout);
      } else {
        // Engine not ready yet, store temporarily for createEngineWithData
        this.pendingViewNodeLayout = layout;
      }
    } catch (error) {
      console.error('Failed to apply ViewNode layout:', error);
    }
  }

  private convertToHierarchicalFormat(neo4jData: {entities: any[], relationships: any[]}): CanvasData {
    // Use layout engine for positioning - no hardcoded coordinates
    const layoutEngine = new GridLayoutEngine();
    const layoutResult = layoutEngine.applyLayout(neo4jData.entities, neo4jData.relationships);
    const rootNodes = layoutResult.nodes;

    // Build nodeMap for edge creation
    const nodeMap = new Map<string, HierarchicalNode>();
    const addToMap = (nodes: HierarchicalNode[]) => {
      nodes.forEach(node => {
        // Find entity by name to get GUID
        const entity = neo4jData.entities.find(e => e.name === node.id);
        if (entity) {
          if (!node.GUID) {
            node.GUID = entity.id;
          }
          nodeMap.set(entity.id, node);
        }
        addToMap(node.children);
      });
    };
    addToMap(rootNodes);

    // Create edges from ALL non-CONTAINS relationships
    const edges: Edge[] = [];
    neo4jData.relationships.forEach(rel => {
      if (rel.type !== 'CONTAINS') {
        const fromNode = nodeMap.get(rel.source);
        const toNode = nodeMap.get(rel.target);
        if (fromNode && toNode) {
          const edgeObj = {
            id: rel.id,
            from: fromNode.text,
            to: toNode.text,
            style: {
              stroke: '#6ea8fe',
              strokeWidth: 2,
              strokeDashArray: null
            },
            ...rel
          };
          edges.push(edgeObj);
        }
      }
    });

    const data: CanvasData = {
      nodes: rootNodes,
      edges,
      originalEdges: edges,
      camera: layoutResult.camera
    };

    return this.normaliseCanvasData(data);
  }

  private createDefaultData(): CanvasData {
    const defaultEdges: Edge[] = [
      {
        id: "Link 1",
        from: "guid-node-1-1",
        to: "guid-node-2-1", 
        label: "Link 1",
        style: {
          stroke: "#6ea8fe",
          strokeWidth: 2,
          strokeDashArray: null
        }
      }
    ];

    const data: CanvasData = {
      nodes: [
        {
          id: "Node 1",
          type: "container",
          x: 50, y: 50,
          width: 400, height: 300,
          text: "Node 1",
          style: { fill: "#1f2937", stroke: "#4b5563" },
          selected: false,
          visible: true,
          collapsed: false,
          dragging: false,
          children: [
            {
              id: "Node 1-1",
              GUID: "guid-node-1-1",
              type: "node",
              x: 40, y: 60,
              width: 200, height: 120,
              text: "Node 1-1",
              style: { fill: "#22384f", stroke: "#5b7287" },
              selected: false,
              visible: true,
              collapsed: false,
              dragging: false,
              children: [
                {
                  id: "Node 1-1-1",
                  type: "component",
                  x: 20, y: 30,
                  width: 120, height: 60,
                  text: "Node 1-1-1",
                  style: { fill: "#2d4f22", stroke: "#5b8729" },
                  selected: false,
                  visible: true,
                  collapsed: false,
                  dragging: false,
                  children: []
                }
              ]
            }
          ]
        },
        {
          id: "Node 2", 
          type: "container",
          x: 500, y: 50,
          width: 350, height: 250,
          text: "Node 2",
          style: { fill: "#2d1f37", stroke: "#635b63" },
          selected: false,
          visible: true,
          collapsed: false,
          dragging: false,
          children: [
            {
              id: "Node 2-1",
              GUID: "guid-node-2-1",
              type: "node",
              x: 30, y: 50,
              width: 180, height: 100, 
              text: "Node 2-1",
              style: { fill: "#384f22", stroke: "#72875b" },
              selected: false,
              visible: true,
              collapsed: false,
              dragging: false,
              children: [
                {
                  id: "Node 2-1-1",
                  type: "component", 
                  x: 15, y: 25,
                  width: 100, height: 50,
                  text: "Node 2-1-1",
                  style: { fill: "#4f2d22", stroke: "#87725b" },
                  selected: false,
                  visible: true,
                  collapsed: false,
                  dragging: false,
                  children: []
                }
              ]
            }
          ]
        }
      ],
      edges: defaultEdges,
      originalEdges: defaultEdges
    };

    return this.normaliseCanvasData(data);
  }

  private createEngineWithData(): void {
    if (!this.canvasRef?.nativeElement) {
      setTimeout(() => this.createEngineWithData(), 50);
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    
    // Set initial canvas size
    this.resizeCanvas();
    
    // Create engine with factory-based components using ViewNode properties
    let layoutEngine, renderer;

    if (this.selectedViewNode) {
      // Use ViewNode properties to determine components
      const components = ComponentFactory.createFromViewNode(this.selectedViewNode);
      layoutEngine = components.layoutEngine;
      renderer = components.renderer;
    } else {
      // Default components for non-ViewNode cases
      const components = ComponentFactory.createComponents('hierarchical', 'composable-flat');
      layoutEngine = components.layoutEngine;
      renderer = components.renderer;
    }

    // Inject ViewNodeStateService into containment-orthogonal renderer
    if (renderer && 'setViewNodeStateService' in renderer) {
      (renderer as any).setViewNodeStateService(this.viewNodeState);
    }

    // Set viewport bounds for layout services to prevent huge initial containers
    const viewportBounds = { width: canvas.width, height: canvas.height };
    if (layoutEngine && 'setViewportBounds' in layoutEngine) {
      (layoutEngine as any).setViewportBounds(viewportBounds);
    }
    
    // If we have raw ViewNode data, process it with the selected layout engine
    if (this.rawViewNodeData && this.selectedViewNode) {
      const viewportBounds = {
        width: canvas.width,
        height: canvas.height,
      };
      if (layoutEngine && 'setViewportBounds' in layoutEngine) {
        (layoutEngine as any).setViewportBounds(viewportBounds);
      }
      const processedData = this.convertDataWithLayoutEngine(
        this.rawViewNodeData,
        layoutEngine
      );
      this.data = processedData;
    }
    
    // Always use ComposableHierarchicalCanvasEngine
    if (this.data) {
      this.normaliseCanvasData(this.data);
      this.canvasViewStateService.initialize(this.canvasId, this.data!, 'engine');
    }

    this.engine = new ComposableHierarchicalCanvasEngine(canvas, renderer, layoutEngine, this.data!, this.canvasId);

    // Inject services for dynamic layout behavior
    this.engine.setServices(this.viewNodeState, this.dynamicLayoutService);
    this.engine.setCanvasViewStateService(this.canvasViewStateService);

    const defaultCollapseLevel = this.selectedViewNode?.defaultCollapseLevel;
    const hasSavedLayout = !!this.selectedViewNode?.layout;
    if (this.engine && typeof defaultCollapseLevel === 'number' && !hasSavedLayout) {
      this.engine.collapseToLevel(defaultCollapseLevel);
    }

    this.centerOnInitialNode();

    // Update available levels for the dropdown
    this.updateAvailableLevels();

    // Apply pending ViewNode layout if available - NO localStorage usage
    if (this.pendingViewNodeLayout) {
      this.canvasViewStateService.initialize(this.canvasId, this.pendingViewNodeLayout, 'external');
      this.engine.setData(this.pendingViewNodeLayout);
      this.pendingViewNodeLayout = null;
    }
    
    // Setup callbacks for camera updates and notify parent
    this.engine.setOnDataChanged((data) => {
      this.updateCameraInfo();
      // Notify parent component that engine data changed
      this.notifyDataChanged();
    });
    
    // Watch for canvas container size changes
    const resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    resizeObserver.observe(canvas.parentElement!);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const container = canvas.parentElement!;
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    if (this.engine) {
      this.engine.updateCanvasSize(canvas.width, canvas.height);
    }
  }

  private updateCameraInfo(): void {
    if (this.engine) {
      const camera = this.engine.getCamera();
      this.cameraInfo = {
        x: Math.round(camera.x),
        y: Math.round(camera.y),
        zoom: Math.round(camera.zoom * 100) / 100 // Round to 2 decimal places
      };
      // Notify the control service of camera changes
      this.canvasControlService.updateCameraInfo(this.cameraInfo);
    }
  }

  onJsonChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    try {
      const newData = JSON.parse(target.value);
      if (this.engine) {
        this.canvasViewStateService.initialize(this.canvasId, newData, 'external');
        this.engine.setData(newData);
      }
    } catch (error) {
      // Invalid JSON - ignore
    }
  }

  onResetClick(): void {
    if (this.engine) {
      // Reload fresh data from Neo4j with default layout
      this.loadData();
      
      // Reset camera to origin
      this.engine.setCamera({ x: 0, y: 0, zoom: 1.0 });
      
      this.updateCameraInfo();
    }
  }

  async onSaveClick(): Promise<void> {
    if (this.engine) {
      // If we have a ViewNode, save layout directly to database
      if (this.selectedViewNode) {
        try {
          const currentData = this.engine.getData();
          const layoutJson = JSON.stringify(currentData);

          // Create separate Auto Layout settings JSON
          const autoLayoutSettings = {
            collapseBehavior: this.viewNodeState.getCollapseBehaviorValue(),
            reflowBehavior: this.viewNodeState.getReflowBehaviorValue()
          };
          const autoLayoutJson = JSON.stringify(autoLayoutSettings);

          // Update ViewNode layout in Neo4j using cypher endpoint
          const updateQuery = `
            MATCH (vn:ViewNode {id: "${this.selectedViewNode.id}"})
            SET vn.layout = "${layoutJson.replace(/"/g, '\\"')}",
                vn.autoLayoutSettings = "${autoLayoutJson.replace(/"/g, '\\"')}",
                vn.updatedAt = datetime()
            RETURN vn
          `;
          
          const result: any = await firstValueFrom(
            this.http.post('/v0/cypher/unified', { 
              query: updateQuery,
              parameters: {}
            })
          );
          
          if (result.success) {
            this.messageService.add({
              severity: 'success',
              summary: 'Layout Saved',
              detail: `Canvas layout saved to database for ${this.selectedViewNode.name}`
            });
          } else {
            console.error('Database save failed:', result.error);
            this.messageService.add({
              severity: 'error',
              summary: 'Save Failed',
              detail: 'Failed to save layout to database'
            });
          }
        } catch (error) {
          console.error('Error saving to database:', error);
          this.messageService.add({
            severity: 'error',
            summary: 'Save Failed', 
            detail: 'Failed to save layout to database'
          });
        }
      } else {
        this.messageService.add({
          severity: 'warn',
          summary: 'No ViewNode',
          detail: 'Cannot save - no ViewNode selected'
        });
      }
    }
  }

  onToggleCollapseBehavior(): void {
    const currentCollapse = this.viewNodeState.getCollapseBehaviorValue();

    if (currentCollapse === 'full-size') {
      // Enable both shrink and dynamic reflow together
      this.viewNodeState.setCollapseBehavior('shrink');
      this.viewNodeState.setReflowBehavior('dynamic');
    } else {
      // Disable both - return to static full-size mode
      this.viewNodeState.setCollapseBehavior('full-size');
      this.viewNodeState.setReflowBehavior('static');
    }

    // Force re-render if engine exists
    if (this.engine) {
      this.engine.render();
    }

    const newBehavior = this.viewNodeState.getCollapseBehaviorValue();
    this.messageService.add({
      severity: 'info',
      summary: 'Auto Layout Mode',
      detail: newBehavior === 'shrink' ? 'Collapsed nodes will shrink and reflow dynamically' : 'Collapsed nodes will maintain full size with static layout'
    });
  }

  getCollapseBehaviorLabel(): string {
    const behavior = this.viewNodeState.getCollapseBehaviorValue();
    return behavior === 'shrink' ? 'Auto Layout: ON' : 'Auto Layout: OFF';
  }

  getCollapseBehaviorTooltip(): string {
    const behavior = this.viewNodeState.getCollapseBehaviorValue();
    return behavior === 'shrink'
      ? 'Auto Layout ON: Nodes shrink and reflow dynamically when collapsed. Click to disable.'
      : 'Auto Layout OFF: Nodes maintain full size when collapsed. Click to enable shrinking and dynamic reflow.';
  }

  updateAvailableLevels(): void {
    if (this.engine) {
      this.availableLevels = this.engine.getAvailableDepthLevels();
      // Notify the control service of available levels
      this.canvasControlService.updateAvailableLevels(this.availableLevels);
    }
  }

  onLevelSelect(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const selectedLevel = parseInt(target.value);

    if (!isNaN(selectedLevel) && this.engine) {
      this.engine.collapseToLevel(selectedLevel);

      this.messageService.add({
        severity: 'info',
        summary: 'Collapsed to Level',
        detail: `All nodes collapsed to level ${selectedLevel}`
      });

      // Reset dropdown to placeholder
      target.value = '';
    }
  }

  // Complete mouse events copied from monolithic system
  private isPanning = false;
  private isResizing = false;
  private resizeHandle = '';
  private panStart = { x: 0, y: 0 };
  
  // JSON tracking for auto-scroll
  private lastSelectedNodeId: string | null = null;
  
  // Drag detection for auto-deselect
  private hasDragged = false;
  
  // Double-click detection for fold/unfold
  private lastClickTime = 0;
  private lastClickNodeGuid: string | null = null;

  onMouseDown(event: MouseEvent): void {
    if (!this.engine) return;
    
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const screenX = (event.clientX - rect.left) * scaleX;
    const screenY = (event.clientY - rect.top) * scaleY;
    
    // Convert to world coordinates
    const camera = this.engine.getCamera();
    const worldX = screenX / camera.zoom + camera.x;
    const worldY = screenY / camera.zoom + camera.y;
    
    // COPIED EXACT RESIZE HANDLE DETECTION FROM MONOLITHIC SYSTEM
    const selectedNode = this.engine.getSelectedNode();
    if (selectedNode) {
      const handle = this.engine.hitTestResizeHandle(screenX, screenY, selectedNode);
      if (handle) {
        this.isResizing = true;
        this.resizeHandle = handle;
        this.panStart = { x: screenX, y: screenY };
        return;
      }
    }

    // Check for double-click before starting drag
    const currentTime = Date.now();
    const clickedNode = this.engine.selectNode(worldX, worldY);

    const clickedGuid = clickedNode?.GUID;

    if (clickedGuid && this.lastClickNodeGuid === clickedGuid && currentTime - this.lastClickTime < 300) {
      // Double-click detected - toggle fold/unfold in engine directly using GUID
      this.engine.toggleNodeCollapsed(clickedGuid);
      this.updateCameraInfo();

      this.lastClickTime = 0; // Reset to prevent triple-click
      this.lastClickNodeGuid = null;
      return;
    }

    // Update click tracking
    this.lastClickTime = currentTime;
    this.lastClickNodeGuid = clickedGuid || null;

    // Try to start dragging a node (pass both world and screen coordinates)
    const draggedNode = this.engine.startDrag(worldX, worldY, screenX, screenY);
    
    if (draggedNode) {
      // Reset drag flag when starting new drag
      this.hasDragged = false;
    } else {
      // COPIED EXACT DESELECTION LOGIC FROM MONOLITHIC SYSTEM
      // If no node hit, start panning the canvas
      this.isPanning = true;
      this.panStart = { x: screenX, y: screenY };
      
      // Clear selection when clicking empty canvas
      this.engine.clearSelection();
    }
    
    this.updateCameraInfo();
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.engine) return;
    
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const screenX = (event.clientX - rect.left) * scaleX;
    const screenY = (event.clientY - rect.top) * scaleY;
    
    // Convert to world coordinates
    const camera = this.engine.getCamera();
    const worldX = screenX / camera.zoom + camera.x;
    const worldY = screenY / camera.zoom + camera.y;
    
    // COPIED EXACT RESIZE HANDLING FROM MONOLITHIC SYSTEM
    if (this.isResizing && this.engine) {
      const selectedNode = this.engine.getSelectedNode();
      if (selectedNode) {
        this.engine.handleResize(selectedNode, this.resizeHandle, screenX, screenY);
        return;
      }
    }

    // Handle dragging
    const dragHandled = this.engine.updateDrag(worldX, worldY);
    
    if (dragHandled) {
      // Mark that dragging has occurred
      this.hasDragged = true;
    }
    
    if (!dragHandled && this.isPanning) {
      // Handle panning
      const deltaX = screenX - this.panStart.x;
      const deltaY = screenY - this.panStart.y;
      
      this.engine.pan(-deltaX, -deltaY);
      this.panStart = { x: screenX, y: screenY };
    }
    
    this.updateCameraInfo();
  }

  onMouseUp(event: MouseEvent): void {
    // COPIED EXACT MOUSE UP LOGIC FROM MONOLITHIC SYSTEM
    this.isPanning = false;
    this.isResizing = false;
    
    if (this.engine) {
      this.engine.stopDrag();
      
      // Auto-deselect after drag completion
      if (this.hasDragged) {
        this.engine.clearSelection();
        this.hasDragged = false;
      }
    }
  }

  onWheel(event: WheelEvent): void {
    if (!this.engine) return;
    
    event.preventDefault();
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const screenX = (event.clientX - rect.left) * scaleX;
    const screenY = (event.clientY - rect.top) * scaleY;
    
    this.engine.zoom(screenX, screenY, event.deltaY);
    this.updateCameraInfo();
  }

  // JSON and panel resizing methods removed - moved to floating debug panel

  private findSelectedInHierarchy(node: HierarchicalNode): boolean {
    if (node.selected) return true;
    return node.children.some(child => this.findSelectedInHierarchy(child));
  }

  private notifyDataChanged(): void {
    this.engineDataChanged.emit();
  }

  private centerOnInitialNode(): void {
    if (!this.engine || !this.data?.nodes?.length) {
      return;
    }

    const rootNode = this.findWorkspaceRoot(this.data.nodes) ?? this.data.nodes[0];
    this.engine.centerOnNode(rootNode);
    this.updateCameraInfo();
  }

  // Process raw ViewNode data with dynamically selected layout strategy
  private convertDataWithLayoutEngine(rawData: {entities: any[], relationships: any[]}, layoutEngine: any): CanvasData {
    // Check if this is the new adapter (doesn't have layoutStrategy) or old engine
    if (layoutEngine.layoutStrategy) {
      // Old layout engine path
      const strategy = layoutEngine.layoutStrategy;
      const canvasData = strategy.processEntities(rawData.entities, rawData.relationships);
      return canvasData;
    } else {
      // New adapter path - use applyLayout and construct CanvasData
      const layoutResult = layoutEngine.applyLayout(rawData.entities, rawData.relationships);
      const nodes = layoutResult.nodes;
      console.log('[Canvas] Layout nodes', nodes.length);

      const nodeByGuid = new Map<string, HierarchicalNode>();
      const collectNodes = (nodeList: HierarchicalNode[]) => {
        nodeList.forEach(node => {
          if (node.GUID) {
            nodeByGuid.set(node.GUID, node);
          }
          if (node.children?.length) {
            collectNodes(node.children);
          }
        });
      };
      collectNodes(nodes);

      const edges: Edge[] = [];
      rawData.relationships.forEach(rel => {
        if (rel.type !== 'CONTAINS') {
          const fromNode = nodeByGuid.get(rel.fromGUID || rel.source);
          const toNode = nodeByGuid.get(rel.toGUID || rel.target);
          if (fromNode && toNode) {
            edges.push({
              id: rel.GUID || rel.id,
              from: fromNode.GUID!,
              to: toNode.GUID!,
              fromGUID: fromNode.GUID!,
              toGUID: toNode.GUID!,
              label: rel.label || rel.type,
              style: {
                stroke: '#6ea8fe',
                strokeWidth: 2,
                strokeDashArray: null
              }
            });
          }
        }
      });

      const canvasData = {
        nodes,
        edges,
        originalEdges: edges,
        camera: layoutResult.camera
      };

      return this.normaliseCanvasData(canvasData);
    }
  }

  private normaliseCanvasData(data: CanvasData): CanvasData {
    if (!data) {
      return data;
    }

    const nodesByGuid = new Map<string, HierarchicalNode>();
    const nodesById = new Map<string, HierarchicalNode>();

    const ensureNode = (node: HierarchicalNode) => {
      const nodeAny = node as any;
      if (!node.GUID && nodeAny.guid) {
        node.GUID = nodeAny.guid;
      }
      if (nodeAny.guid !== undefined) {
        delete nodeAny.guid;
      }
      if (!node.GUID) {
        node.GUID = this.generateGuid();
      }
      nodesByGuid.set(node.GUID, node);
      nodesById.set(node.id, node);
      if (!node.children) {
        node.children = [];
      }
      node.children.forEach(ensureNode);
    };

    data.nodes = data.nodes || [];
    data.nodes.forEach(ensureNode);

    const ensureEdge = (edge: Edge) => {
      const edgeAny = edge as any;
      if (edgeAny.guid && !edgeAny.GUID) {
        edgeAny.GUID = edgeAny.guid;
      }
      if (edgeAny.guid !== undefined) {
        delete edgeAny.guid;
      }

      const sourceNode = this.resolveEdgeNode(edge.fromGUID ?? edge.from, nodesByGuid, nodesById);
      if (sourceNode?.GUID) {
        edge.fromGUID = sourceNode.GUID;
        edge.from = sourceNode.GUID;
      }

      const targetNode = this.resolveEdgeNode(edge.toGUID ?? edge.to, nodesByGuid, nodesById);
      if (targetNode?.GUID) {
        edge.toGUID = targetNode.GUID;
        edge.to = targetNode.GUID;
      }
    };

    data.edges = data.edges || [];
    data.edges.forEach(ensureEdge);

    if (!data.originalEdges || data.originalEdges.length === 0) {
      data.originalEdges = [...data.edges];
    } else {
      data.originalEdges.forEach(ensureEdge);
    }

    return data;
  }

  private resolveEdgeNode(
    identifier: string | undefined,
    nodesByGuid: Map<string, HierarchicalNode>,
    nodesById: Map<string, HierarchicalNode>
  ): HierarchicalNode | undefined {
    if (!identifier) return undefined;
    return nodesByGuid.get(identifier) ?? nodesById.get(identifier);
  }

  private generateGuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private findWorkspaceRoot(nodes: HierarchicalNode[]): HierarchicalNode | null {
    for (const node of nodes) {
      if (node.text?.toLowerCase().includes('workspace')) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = this.findWorkspaceRoot(node.children);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  // Public methods for CanvasController interface
  getAvailableLevels(): number[] {
    return this.availableLevels;
  }

  getCameraInfo(): CameraInfo {
    return this.cameraInfo;
  }

  // FR-030: ViewNode is now set via ViewNodeStateService subscription
  // No longer need public setViewNode method
}
