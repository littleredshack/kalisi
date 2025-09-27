import { TestBed } from '@angular/core/testing';
import { StateManagerService, StateChangeEvent, EntityChangeEvent } from './state-manager.service';
import { take, skip } from 'rxjs/operators';

describe('StateManagerService - FR-006 Tab State Isolation with Observables', () => {
  let service: StateManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StateManagerService);
  });

  afterEach(() => {
    // Clean up any tabs created during tests
    service.getAllTabIds().forEach(tabId => {
      service.removeTab(tabId);
    });
  });

  it('should create independent STATE instances for each tab', () => {
    // Create states for two tabs
    const state1 = service.createTabState('tab1', true);
    const state2 = service.createTabState('tab2', false);
    
    // Verify they are different instances
    expect(state1).not.toBe(state2);
    expect(state1.entities).not.toBe(state2.entities);
    expect(state1.view).not.toBe(state2.view);
  });

  it('should maintain separate entity collections per tab', () => {
    // Create two tab states
    const state1 = service.createTabState('tab1', true);
    const state2 = service.createTabState('tab2', false);
    
    // Modify entities in tab1
    state1.entities['test-entity'] = { id: 'test-entity', name: 'Test' };
    
    // Verify tab2 is unaffected
    expect(Object.keys(state2.entities).length).toBe(0);
    expect(state2.entities['test-entity']).toBeUndefined();
  });

  it('should switch active tab without affecting other states', () => {
    // Create multiple tabs
    const state1 = service.createTabState('tab1', true);
    const state2 = service.createTabState('tab2', false);
    const state3 = service.createTabState('tab3', false);
    
    // Modify state1
    state1.view.panX = 100;
    state1.view.panY = 200;
    
    // Switch to tab2
    service.setActiveTab('tab2');
    
    // Verify state1 is unchanged
    const retrievedState1 = service.getTabState('tab1');
    expect(retrievedState1.view.panX).toBe(100);
    expect(retrievedState1.view.panY).toBe(200);
    
    // Verify state2 has default values
    const retrievedState2 = service.getTabState('tab2');
    expect(retrievedState2.view.panX).toBe(0);
    expect(retrievedState2.view.panY).toBe(0);
  });

  it('should not share connections between tabs', () => {
    const state1 = service.createTabState('tab1', true);
    const state2 = service.createTabState('tab2', false);
    
    // Add connection to tab1
    state1.connections.push({ from: 1, to: 2, type: 'test' });
    
    // Verify tab2 connections are empty
    expect(state2.connections.length).toBe(0);
  });

  it('should maintain independent entityTypes Sets', () => {
    const state1 = service.createTabState('tab1', true);
    const state2 = service.createTabState('tab2', false);
    
    // Add to tab1 entityTypes
    state1.entityTypes.groups.add('group1');
    state1.entityTypes.items.add('item1');
    
    // Verify tab2 entityTypes are empty
    expect(state2.entityTypes.groups.size).toBe(0);
    expect(state2.entityTypes.items.size).toBe(0);
  });

  it('should clean up resources when tab is removed', () => {
    service.createTabState('tab1', true);
    
    // Register renderer and canvas
    const mockRenderer = { cleanup: jasmine.createSpy('cleanup') };
    const mockCanvas = document.createElement('canvas');
    service.registerTabRenderer('tab1', mockRenderer);
    service.registerTabCanvas('tab1', mockCanvas);
    
    // Remove tab
    service.removeTab('tab1');
    
    // Verify cleanup
    expect(mockRenderer.cleanup).toHaveBeenCalled();
    expect(service.hasTabState('tab1')).toBe(false);
    expect(service.getTabState('tab1')).toBeUndefined();
  });

  describe('Observable STATE Changes', () => {
    it('should emit STATE changes through Observable', (done) => {
      const tabId = 'test-tab';
      const state = service.createTabState(tabId);
      
      service.getTabState$(tabId)
        .pipe(skip(1), take(1))
        .subscribe(newState => {
          expect(newState).toBeTruthy();
          expect(newState.selection.selectedId).toBe('entity1');
          done();
        });
      
      // Simulate STATE change
      state.selection.selectedId = 'entity1';
      service.notifyStateChange(tabId, ['selection', 'selectedId'], 'entity1');
    });

    it('should emit StateChangeEvent when STATE properties change', (done) => {
      const tabId = 'test-tab';
      service.createTabState(tabId);
      
      service.getStateChanges$()
        .pipe(take(1))
        .subscribe((event: StateChangeEvent) => {
          expect(event.tabId).toBe(tabId);
          expect(event.path).toEqual(['view', 'panX']);
          expect(event.value).toBe(100);
          expect(event.timestamp).toBeTruthy();
          done();
        });
      
      // Simulate pan change
      service.notifyStateChange(tabId, ['view', 'panX'], 100);
    });

    it('should emit EntityChangeEvent when entities change', (done) => {
      const tabId = 'test-tab';
      const entityId = 'entity1';
      service.createTabState(tabId);
      
      service.getEntityChanges$(tabId)
        .pipe(take(1))
        .subscribe((event: EntityChangeEvent) => {
          expect(event.tabId).toBe(tabId);
          expect(event.entityId).toBe(entityId);
          expect(event.property).toBe('x');
          expect(event.value).toBe(50);
          done();
        });
      
      // Simulate entity position change
      service.notifyStateChange(tabId, ['entities', entityId, 'x'], 50);
    });

    it('should filter entity changes by tab ID', (done) => {
      const tabId1 = 'test-tab-1';
      const tabId2 = 'test-tab-2';
      
      service.createTabState(tabId1);
      service.createTabState(tabId2);
      
      let eventCount = 0;
      
      service.getEntityChanges$(tabId1)
        .pipe(take(1))
        .subscribe((event: EntityChangeEvent) => {
          expect(event.tabId).toBe(tabId1);
          eventCount++;
          if (eventCount === 1) {
            done();
          }
        });
      
      // Emit change for tab2 (should not trigger subscription)
      service.notifyStateChange(tabId2, ['entities', 'entity1', 'x'], 100);
      
      // Emit change for tab1 (should trigger subscription)
      setTimeout(() => {
        service.notifyStateChange(tabId1, ['entities', 'entity1', 'x'], 50);
      }, 10);
    });
  });

  describe('Active Tab Management', () => {
    it('should emit active tab changes', (done) => {
      const tabId = 'test-tab';
      const canvas = document.createElement('canvas');
      
      service.createTabState(tabId);
      service.registerTabCanvas(tabId, canvas);
      
      service.getActiveTabState$()
        .pipe(take(1))
        .subscribe(state => {
          expect(state).toBeTruthy();
          expect(state.view).toBeTruthy();
          done();
        });
      
      service.setActiveTab(tabId);
    });

    it('should update window.STATE when switching tabs', () => {
      const tabId1 = 'test-tab-1';
      const tabId2 = 'test-tab-2';
      
      service.createTabState(tabId1);
      service.createTabState(tabId2);
      
      service.setActiveTab(tabId1);
      expect((window as any).STATE).toBeTruthy();
      
      service.setActiveTab(tabId2);
      expect((window as any).STATE).toBeTruthy();
    });
  });

  describe('WASM Bridge Integration', () => {
    it('should set up notifyStateChange function on window', () => {
      const tabId = 'test-tab';
      service.createTabState(tabId);
      service.setActiveTab(tabId);
      
      expect((window as any).notifyStateChange).toBeTruthy();
      expect(typeof (window as any).notifyStateChange).toBe('function');
    });

    it('should handle STATE changes from WASM renderer', (done) => {
      const tabId = 'test-tab';
      service.createTabState(tabId);
      service.setActiveTab(tabId);
      
      service.getStateChanges$()
        .pipe(take(1))
        .subscribe((event: StateChangeEvent) => {
          expect(event.path).toEqual(['selection', 'selectedId']);
          expect(event.value).toBe('entity1');
          done();
        });
      
      // Simulate WASM renderer calling notifyStateChange
      (window as any).notifyStateChange(['selection', 'selectedId'], 'entity1');
    });
  });

  describe('STATE Proxy', () => {
    it('should track nested property changes', (done) => {
      const tabId = 'test-tab';
      const state = service.createTabState(tabId);
      
      service.getStateChanges$()
        .pipe(take(1))
        .subscribe((event: StateChangeEvent) => {
          expect(event.path).toEqual(['view', 'zoom']);
          expect(event.value).toBe(2);
          done();
        });
      
      // Direct property change should be tracked
      state.view.zoom = 2;
    });

    it('should handle entity property changes', (done) => {
      const tabId = 'test-tab';
      const state = service.createTabState(tabId);
      
      // Add an entity
      state.entities['entity1'] = {
        id: 'entity1',
        x: 0,
        y: 0,
        label: 'Test Entity'
      };
      
      service.getEntityChanges$(tabId)
        .pipe(skip(1), take(1))
        .subscribe((event: EntityChangeEvent) => {
          expect(event.entityId).toBe('entity1');
          expect(event.property).toBe('x');
          expect(event.value).toBe(100);
          done();
        });
      
      // Change entity position
      state.entities['entity1'].x = 100;
    });
  });

  describe('Error Handling', () => {
    it('should handle getting Observable for non-existent tab', (done) => {
      service.getTabState$('non-existent')
        .pipe(take(1))
        .subscribe(state => {
          expect(state).toBeNull();
          done();
        });
    });

    it('should handle notifying changes for non-existent tab', () => {
      // Should not throw
      expect(() => {
        service.notifyStateChange('non-existent', ['test'], 'value');
      }).not.toThrow();
    });
  });
});
