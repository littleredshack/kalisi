import { TestBed } from '@angular/core/testing';
import { DataMappingService, KalisiCanvasData, WasmWebGLData } from './data-mapping.service';

describe('DataMappingService', () => {
  let service: DataMappingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DataMappingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Kalisi to WASM mapping', () => {
    it('should convert Kalisi canvas data to WASM format', () => {
      const kalisiData: KalisiCanvasData = {
        nodes: [
          { id: 'node1', x: 100, y: 150, label: 'Test Node', type: 'task' },
          { id: 'node2', x: 200, y: 250, label: 'Node 2', type: 'container' }
        ],
        edges: [
          { id: 'edge1', source: 'node1', target: 'node2', label: 'connects' }
        ],
        transform: { x: 10, y: 20, scale: 1.5 }
      };

      const wasmData = service.mapKalisiToWasmWebGL(kalisiData);

      expect(wasmData.entities).toBeDefined();
      expect(wasmData.connections).toBeDefined();
      expect(wasmData.view).toBeDefined();

      // Check entity conversion
      expect(wasmData.entities['node1']).toBeDefined();
      expect(wasmData.entities['node1'].text).toBe('Test Node');
      expect(wasmData.entities['node1'].position.x).toBe(100);
      expect(wasmData.entities['node1'].position.y).toBe(150);
      expect(wasmData.entities['node1'].groupType).toBe('item'); // task -> item

      expect(wasmData.entities['node2'].groupType).toBe('container'); // container -> container

      // Check connection conversion
      expect(wasmData.connections.length).toBe(1);
      expect(wasmData.connections[0].fromId).toBe('node1');
      expect(wasmData.connections[0].toId).toBe('node2');
      expect(wasmData.connections[0].type).toBe('orthogonalCurved');

      // Check view conversion
      expect(wasmData.view.panX).toBe(10);
      expect(wasmData.view.panY).toBe(20);
      expect(wasmData.view.zoom).toBe(1.5);
    });

    it('should handle empty Kalisi data', () => {
      const kalisiData: KalisiCanvasData = {
        nodes: [],
        edges: [],
        transform: { x: 0, y: 0, scale: 1 }
      };

      const wasmData = service.mapKalisiToWasmWebGL(kalisiData);

      expect(Object.keys(wasmData.entities).length).toBe(0);
      expect(wasmData.connections.length).toBe(0);
      expect(wasmData.view.zoom).toBe(1);
    });
  });

  describe('WASM to Kalisi mapping', () => {
    it('should convert WASM data back to Kalisi format', () => {
      const wasmData: WasmWebGLData = {
        entities: {
          'ent1': {
            id: 'ent1',
            groupType: 'item',
            text: 'WASM Entity',
            position: { x: 300, y: 400 },
            size: { x: 80, y: 60 },
            parentId: null,
            children: [],
            expanded: true,
            visible: true,
            icon: 'star',
            color: '#4CAF50'
          }
        },
        connections: [
          {
            id: 'conn1',
            fromId: 'ent1',
            toId: 'ent2',
            type: 'orthogonalCurved',
            label: 'wasm connection'
          }
        ],
        view: {
          panX: 50,
          panY: 75,
          zoom: 2.0
        }
      };

      const kalisiData = service.mapWasmWebGLToKalisi(wasmData);

      expect(kalisiData.nodes.length).toBe(1);
      expect(kalisiData.edges.length).toBe(1);

      // Check node conversion
      const node = kalisiData.nodes[0];
      expect(node.id).toBe('ent1');
      expect(node.label).toBe('WASM Entity');
      expect(node.x).toBe(300);
      expect(node.y).toBe(400);
      expect(node.type).toBe('task'); // item -> task

      // Check edge conversion
      const edge = kalisiData.edges[0];
      expect(edge.id).toBe('conn1');
      expect(edge.source).toBe('ent1');
      expect(edge.target).toBe('ent2');
      expect(edge.label).toBe('wasm connection');

      // Check transform conversion
      expect(kalisiData.transform.x).toBe(50);
      expect(kalisiData.transform.y).toBe(75);
      expect(kalisiData.transform.scale).toBe(2.0);
    });
  });

  describe('Entity and connection creation', () => {
    it('should create WASM entity with defaults', () => {
      const entity = service.createWasmEntity({ 
        text: 'New Entity',
        position: { x: 10, y: 20 }
      });

      expect(entity.id).toBeDefined();
      expect(entity.text).toBe('New Entity');
      expect(entity.position.x).toBe(10);
      expect(entity.position.y).toBe(20);
      expect(entity.groupType).toBe('item'); // default
      expect(entity.expanded).toBe(true); // default
      expect(entity.visible).toBe(true); // default
      expect(entity.children).toEqual([]); // default
    });

    it('should create WASM connection with defaults', () => {
      const connection = service.createWasmConnection('from1', 'to1', { 
        label: 'test connection' 
      });

      expect(connection.id).toBeDefined();
      expect(connection.fromId).toBe('from1');
      expect(connection.toId).toBe('to1');
      expect(connection.label).toBe('test connection');
      expect(connection.type).toBe('orthogonalCurved'); // default
      expect(connection.color).toBe('#666666'); // default
      expect(connection.lineWidth).toBe(2); // default
      expect(connection.style).toBe('solid'); // default
    });
  });

  describe('Validation', () => {
    it('should validate valid WASM data', () => {
      const validWasmData: WasmWebGLData = {
        entities: {},
        connections: [],
        view: { panX: 0, panY: 0, zoom: 1 }
      };

      expect(service.validateWasmData(validWasmData)).toBe(true);
    });

    it('should reject invalid WASM data', () => {
      expect(service.validateWasmData(null)).toBe(false);
      expect(service.validateWasmData({})).toBe(false);
      expect(service.validateWasmData({ entities: {} })).toBe(false); // missing connections and view
      expect(service.validateWasmData({ 
        entities: {}, 
        connections: [], 
        view: {} // missing required view properties
      })).toBe(false);
    });

    it('should validate valid Kalisi data', () => {
      const validEdt2Data: KalisiCanvasData = {
        nodes: [],
        edges: [],
        transform: { x: 0, y: 0, scale: 1 }
      };

      expect(service.validateKalisiData(validEdt2Data)).toBe(true);
    });

    it('should reject invalid Kalisi data', () => {
      expect(service.validateKalisiData(null)).toBe(false);
      expect(service.validateKalisiData({})).toBe(false);
      expect(service.validateKalisiData({ nodes: [] })).toBe(false); // missing edges and transform
    });
  });

  describe('Helper methods', () => {
    it('should determine correct group types', () => {
      const containerNode = { id: '1', x: 0, y: 0, label: 'Container', type: 'container' };
      const groupNode = { id: '2', x: 0, y: 0, label: 'Group', type: 'group' };
      const taskNode = { id: '3', x: 0, y: 0, label: 'Task', type: 'task' };

      const containerWasm = service.mapKalisiToWasmWebGL({ 
        nodes: [containerNode], 
        edges: [], 
        transform: { x: 0, y: 0, scale: 1 } 
      });
      expect(containerWasm.entities['1'].groupType).toBe('container');

      const groupWasm = service.mapKalisiToWasmWebGL({ 
        nodes: [groupNode], 
        edges: [], 
        transform: { x: 0, y: 0, scale: 1 } 
      });
      expect(groupWasm.entities['2'].groupType).toBe('container');

      const taskWasm = service.mapKalisiToWasmWebGL({ 
        nodes: [taskNode], 
        edges: [], 
        transform: { x: 0, y: 0, scale: 1 } 
      });
      expect(taskWasm.entities['3'].groupType).toBe('item');
    });

    it('should generate unique IDs', () => {
      const entity1 = service.createWasmEntity({ text: 'Entity 1' });
      const entity2 = service.createWasmEntity({ text: 'Entity 2' });
      const conn1 = service.createWasmConnection('a', 'b');
      const conn2 = service.createWasmConnection('c', 'd');

      expect(entity1.id).toBeDefined();
      expect(entity2.id).toBeDefined();
      expect(entity1.id).not.toBe(entity2.id);

      expect(conn1.id).toBeDefined();
      expect(conn2.id).toBeDefined();
      expect(conn1.id).not.toBe(conn2.id);
    });
  });
});