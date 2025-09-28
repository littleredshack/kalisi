import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CanvasService, SaveCanvasRequest, TabCanvas } from './canvas.service';

describe('CanvasService', () => {
  let service: CanvasService;
  let httpMock: HttpTestingController;

  const mockCanvas: TabCanvas = {
    id: 'canvas-1',
    tab_id: 'test-tab-1',
    user_id: 'user-1',
    name: 'Test Canvas',
    canvas_type: 'default',
    data: {
      nodes: [
        { id: 'node1', x: 200, y: 200, label: 'Test Node', type: 'test', properties: { name: 'Test' } }
      ],
      edges: [],
      transform: { x: 0, y: 0, scale: 1 }
    },
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  };

  const mockSaveRequest: SaveCanvasRequest = {
    tab_id: 'test-tab-1',
    name: 'Test Canvas',
    canvas_type: 'default',
    data: mockCanvas.data
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CanvasService]
    });
    service = TestBed.inject(CanvasService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('saveCanvas', () => {
    it('should save canvas data', () => {
      const mockResponse = { id: 'canvas-1', message: 'Canvas saved successfully' };

      service.saveCanvas(mockSaveRequest).subscribe(response => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne('/v2/canvas');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(mockSaveRequest);
      req.flush(mockResponse);
    });

    it('should handle save errors gracefully', () => {
      service.saveCanvas(mockSaveRequest).subscribe(response => {
        expect(response.message).toBe('Failed to save canvas');
        expect(response.id).toBe('');
      });

      const req = httpMock.expectOne('/v2/canvas');
      req.error(new ErrorEvent('Network error'));
    });
  });

  describe('loadCanvas', () => {
    it('should load canvas data', () => {
      service.loadCanvas('test-tab-1').subscribe(canvas => {
        expect(canvas).toEqual(mockCanvas);
      });

      const req = httpMock.expectOne('/v2/canvas/test-tab-1');
      expect(req.request.method).toBe('GET');
      req.flush(mockCanvas);
    });

    it('should handle load errors gracefully', () => {
      service.loadCanvas('test-tab-1').subscribe(canvas => {
        expect(canvas).toBeNull();
      });

      const req = httpMock.expectOne('/v2/canvas/test-tab-1');
      req.error(new ErrorEvent('Network error'));
    });

    it('should return null for non-existent canvas', () => {
      service.loadCanvas('non-existent').subscribe(canvas => {
        expect(canvas).toBeNull();
      });

      const req = httpMock.expectOne('/v2/canvas/non-existent');
      req.flush(null);
    });
  });

  describe('updateCanvas', () => {
    it('should update canvas data', () => {
      const mockResponse = { id: 'canvas-1', message: 'Canvas updated successfully' };

      service.updateCanvas('test-tab-1', mockSaveRequest).subscribe(response => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne('/v2/canvas/test-tab-1');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(mockSaveRequest);
      req.flush(mockResponse);
    });

    it('should handle update errors gracefully', () => {
      service.updateCanvas('test-tab-1', mockSaveRequest).subscribe(response => {
        expect(response.message).toBe('Failed to update canvas');
        expect(response.id).toBe('');
      });

      const req = httpMock.expectOne('/v2/canvas/test-tab-1');
      req.error(new ErrorEvent('Network error'));
    });
  });

  describe('deleteCanvas', () => {
    it('should delete canvas', () => {
      service.deleteCanvas('test-tab-1').subscribe(success => {
        expect(success).toBe(true);
      });

      const req = httpMock.expectOne('/v2/canvas/test-tab-1');
      expect(req.request.method).toBe('DELETE');
      req.flush('', { status: 204, statusText: 'No Content' });
    });

    it('should handle delete errors gracefully', () => {
      service.deleteCanvas('test-tab-1').subscribe(success => {
        expect(success).toBe(false);
      });

      const req = httpMock.expectOne('/v2/canvas/test-tab-1');
      req.error(new ErrorEvent('Network error'));
    });
  });

  describe('listCanvases', () => {
    it('should list all canvases', () => {
      const mockCanvases = [mockCanvas];

      service.listCanvases().subscribe(canvases => {
        expect(canvases).toEqual(mockCanvases);
      });

      const req = httpMock.expectOne('/v2/canvas');
      expect(req.request.method).toBe('GET');
      req.flush(mockCanvases);
    });

    it('should handle list errors gracefully', () => {
      service.listCanvases().subscribe(canvases => {
        expect(canvases).toEqual([]);
      });

      const req = httpMock.expectOne('/v2/canvas');
      req.error(new ErrorEvent('Network error'));
    });
  });

  describe('saveOrUpdateCanvas', () => {
    it('should try update first, then save', () => {
      const mockResponse = { id: 'canvas-1', message: 'Canvas updated successfully' };

      service.saveOrUpdateCanvas('test-tab-1', 'Test Canvas', 'default', mockCanvas.data)
        .subscribe(response => {
          expect(response).toEqual(mockResponse);
        });

      // Should first try update
      const updateReq = httpMock.expectOne('/v2/canvas/test-tab-1');
      expect(updateReq.request.method).toBe('PUT');
      updateReq.flush(mockResponse);
    });

    it('should fallback to save if update fails', () => {
      const saveResponse = { id: 'canvas-1', message: 'Canvas saved successfully' };

      service.saveOrUpdateCanvas('test-tab-1', 'Test Canvas', 'default', mockCanvas.data)
        .subscribe(response => {
          expect(response).toEqual(saveResponse);
        });

      // First try update (fails)
      const updateReq = httpMock.expectOne('/v2/canvas/test-tab-1');
      expect(updateReq.request.method).toBe('PUT');
      updateReq.error(new ErrorEvent('Not found'));

      // Then fallback to save
      const saveReq = httpMock.expectOne('/v2/canvas');
      expect(saveReq.request.method).toBe('POST');
      saveReq.flush(saveResponse);
    });
  });
});