import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';

import { TabCanvasComponent } from './tab-canvas.component';
import { TabManagerService, Tab } from '../../core/services/tab-manager.service';
import { CanvasService } from '../../core/services/canvas.service';
import { MatSnackBarModule } from '@angular/material/snack-bar';

describe('TabCanvasComponent', () => {
  let component: TabCanvasComponent;
  let fixture: ComponentFixture<TabCanvasComponent>;
  let mockTabManager: jasmine.SpyObj<TabManagerService>;
  let mockCanvasService: jasmine.SpyObj<CanvasService>;
  let tabStateSubject: Subject<any>;

  const mockTab: Tab = {
    id: 'test-tab-1',
    name: 'Test Tab',
    canvasType: 'default',
    data: {
      nodes: [
        { id: 'node1', x: 200, y: 200, label: 'Test Node', type: 'test', properties: { name: 'Test' } }
      ],
      edges: [],
      transform: { x: 0, y: 0, scale: 1 }
    },
    isActive: true,
    createdAt: new Date(),
    lastModified: new Date()
  };

  beforeEach(async () => {
    tabStateSubject = new Subject();

    mockTabManager = jasmine.createSpyObj('TabManagerService', [
      'updateTabData'
    ], {
      tabState$: tabStateSubject.asObservable()
    });

    mockCanvasService = jasmine.createSpyObj('CanvasService', [
      'loadCanvas',
      'saveOrUpdateCanvas'
    ]);

    mockCanvasService.loadCanvas.and.returnValue(of({
      id: 'canvas-1',
      tab_id: 'test-tab-1',
      user_id: 'user-1',
      name: 'Test Canvas',
      canvas_type: 'default',
      data: mockTab.data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    mockCanvasService.saveOrUpdateCanvas.and.returnValue(of({
      id: 'canvas-1',
      message: 'Canvas saved successfully'
    }));

    await TestBed.configureTestingModule({
      imports: [
        TabCanvasComponent,
        BrowserAnimationsModule,
        HttpClientTestingModule,
        MatSnackBarModule
      ],
      providers: [
        { provide: TabManagerService, useValue: mockTabManager },
        { provide: CanvasService, useValue: mockCanvasService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TabCanvasComponent);
    component = fixture.componentInstance;
    component.tabId = 'test-tab-1';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize canvas on AfterViewInit', () => {
    spyOn(component as any, 'initCanvas');
    spyOn(component as any, 'startRenderLoop');
    spyOn(component as any, 'resizeCanvas');

    component.ngAfterViewInit();

    expect((component as any).initCanvas).toHaveBeenCalled();
    expect((component as any).startRenderLoop).toHaveBeenCalled();
    expect((component as any).resizeCanvas).toHaveBeenCalled();
  });

  it('should load tab data on init', () => {
    spyOn(component as any, 'loadTabData');

    component.ngOnInit();
    tabStateSubject.next({
      tabs: [mockTab],
      activeTabId: 'test-tab-1'
    });

    expect((component as any).loadTabData).toHaveBeenCalled();
    expect(component.currentTab).toEqual(mockTab);
  });

  it('should emit node selection on mouse down', () => {
    spyOn(component.nodeSelected, 'emit');
    spyOn(component as any, 'saveTabData');

    component['canvasData'] = mockTab.data;
    component.canvasRef = {
      nativeElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0 })
      }
    } as any;

    const mouseEvent = new MouseEvent('mousedown', {
      clientX: 200,
      clientY: 200
    });

    component.onMouseDown(mouseEvent);

    expect(component.nodeSelected.emit).toHaveBeenCalledWith(
      jasmine.objectContaining({ id: 'node1' })
    );
  });

  it('should create new node on double click', () => {
    spyOn(component as any, 'saveTabData');

    component['canvasData'] = { nodes: [], edges: [], transform: { x: 0, y: 0, scale: 1 } };
    component.canvasRef = {
      nativeElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0 })
      }
    } as any;

    const mouseEvent = new MouseEvent('dblclick', {
      clientX: 300,
      clientY: 300
    });

    component.onDoubleClick(mouseEvent);

    expect(component['canvasData'].nodes.length).toBe(1);
    expect(component['canvasData'].nodes[0].x).toBe(300);
    expect(component['canvasData'].nodes[0].y).toBe(300);
    expect((component as any).saveTabData).toHaveBeenCalled();
  });

  it('should handle zoom in/out operations', () => {
    component['canvasData'] = { nodes: [], edges: [], transform: { x: 0, y: 0, scale: 1 } };
    spyOn(component as any, 'saveTabData');

    // Test zoom in
    component.zoomIn();
    expect(component['canvasData'].transform.scale).toBeCloseTo(1.2);

    // Test zoom out
    component.zoomOut();
    expect(component['canvasData'].transform.scale).toBeCloseTo(1.0);

    expect((component as any).saveTabData).toHaveBeenCalledTimes(2);
  });

  it('should clear canvas when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    spyOn(component as any, 'saveTabData');

    component['canvasData'] = mockTab.data;
    component.clearCanvas();

    expect(component['canvasData'].nodes.length).toBe(0);
    expect(component['canvasData'].edges.length).toBe(0);
    expect((component as any).saveTabData).toHaveBeenCalled();
  });

  it('should not clear canvas when not confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    spyOn(component as any, 'saveTabData');

    const originalData = { ...component['canvasData'] };
    component['canvasData'] = mockTab.data;
    component.clearCanvas();

    expect((component as any).saveTabData).not.toHaveBeenCalled();
  });

  it('should update node label', () => {
    component.selectedNode = { id: 'node1', label: 'Old Label' } as any;
    spyOn(component as any, 'saveTabData');

    component.updateNodeLabel();

    expect((component as any).saveTabData).toHaveBeenCalled();
  });

  it('should delete selected node', () => {
    component['canvasData'] = mockTab.data;
    component.selectedNode = component['canvasData'].nodes[0];
    spyOn(component as any, 'saveTabData');

    component.deleteNode();

    expect(component['canvasData'].nodes.length).toBe(0);
    expect(component.selectedNode).toBeNull();
    expect((component as any).saveTabData).toHaveBeenCalled();
  });

  it('should handle mouse move for panning', () => {
    component['isDragging'] = true;
    component['lastMousePos'] = { x: 100, y: 100 };
    component['canvasData'] = { nodes: [], edges: [], transform: { x: 0, y: 0, scale: 1 } };
    spyOn(component as any, 'saveTabData');

    const mouseEvent = new MouseEvent('mousemove', {
      clientX: 110,
      clientY: 105
    });

    component.onMouseMove(mouseEvent);

    expect(component['canvasData'].transform.x).toBe(10);
    expect(component['canvasData'].transform.y).toBe(5);
    expect((component as any).saveTabData).toHaveBeenCalled();
  });

  it('should handle wheel events for zooming', () => {
    component['canvasData'] = { nodes: [], edges: [], transform: { x: 0, y: 0, scale: 1 } };
    component.canvasRef = {
      nativeElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0 })
      }
    } as any;
    spyOn(component as any, 'saveTabData');

    const wheelEvent = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: 400,
      clientY: 300
    });
    wheelEvent.preventDefault = jasmine.createSpy();

    component.onWheel(wheelEvent);

    expect(component['canvasData'].transform.scale).toBeGreaterThan(1);
    expect(wheelEvent.preventDefault).toHaveBeenCalled();
    expect((component as any).saveTabData).toHaveBeenCalled();
  });

  it('should fit canvas to screen with nodes', () => {
    component['canvasData'] = {
      nodes: [
        { id: 'node1', x: 100, y: 100, label: 'Node 1', type: 'test' },
        { id: 'node2', x: 500, y: 300, label: 'Node 2', type: 'test' }
      ],
      edges: [],
      transform: { x: 0, y: 0, scale: 1 }
    };
    component['canvasWidth'] = 800;
    component['canvasHeight'] = 600;
    spyOn(component as any, 'saveTabData');

    component.fitToScreen();

    expect(component['canvasData'].transform.scale).toBeGreaterThan(0);
    expect((component as any).saveTabData).toHaveBeenCalled();
  });

  it('should persist canvas to Neo4j after debounce', (done) => {
    component.currentTab = mockTab;
    component['canvasData'] = mockTab.data;

    component.ngOnInit();

    // Trigger save
    (component as any).saveDebounce$.next();

    // Wait for debounce
    setTimeout(() => {
      expect(mockCanvasService.saveOrUpdateCanvas).toHaveBeenCalledWith(
        mockTab.id,
        mockTab.name,
        mockTab.canvasType,
        mockTab.data
      );
      done();
    }, 2100);
  });

  it('should load canvas data from Neo4j', () => {
    component.currentTab = mockTab;
    
    component.ngOnInit();
    tabStateSubject.next({
      tabs: [mockTab],
      activeTabId: 'test-tab-1'
    });

    expect(mockCanvasService.loadCanvas).toHaveBeenCalledWith('test-tab-1');
  });
});