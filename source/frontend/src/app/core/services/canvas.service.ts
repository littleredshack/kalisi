import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { DataMappingService, WasmWebGLData } from './data-mapping.service';

export interface CanvasNode {
  id: string;
  x: number;
  y: number;
  label: string;
  type: string;
  properties?: any;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  transform: Transform;
}

export interface TabCanvas {
  id: string;
  tab_id: string;
  user_id: string;
  name: string;
  canvas_type: string;
  data: CanvasData;
  created_at: string;
  updated_at: string;
}

export interface SaveCanvasRequest {
  tab_id: string;
  name: string;
  canvas_type: string;
  data: CanvasData;
}

export interface SaveCanvasResponse {
  id: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class CanvasService {
  private apiUrl = '/v2/canvas';

  constructor(
    private http: HttpClient,
    private dataMappingService: DataMappingService
  ) {}

  /**
   * Save canvas data to Neo4j
   */
  saveCanvas(request: SaveCanvasRequest): Observable<SaveCanvasResponse> {
    return this.http.post<SaveCanvasResponse>(this.apiUrl, request).pipe(
      catchError(error => {
        console.error('Error saving canvas:', error);
        return of({ id: '', message: 'Failed to save canvas' });
      })
    );
  }

  /**
   * Load canvas data from Neo4j
   */
  loadCanvas(tabId: string): Observable<TabCanvas | null> {
    return this.http.get<TabCanvas | null>(`${this.apiUrl}/${tabId}`).pipe(
      catchError(error => {
        console.error('Error loading canvas:', error);
        return of(null);
      })
    );
  }

  /**
   * Update existing canvas data
   */
  updateCanvas(tabId: string, request: SaveCanvasRequest): Observable<SaveCanvasResponse> {
    return this.http.put<SaveCanvasResponse>(`${this.apiUrl}/${tabId}`, request).pipe(
      catchError(error => {
        console.error('Error updating canvas:', error);
        return of({ id: '', message: 'Failed to update canvas' });
      })
    );
  }

  /**
   * Delete canvas data
   */
  deleteCanvas(tabId: string): Observable<boolean> {
    return this.http.delete(`${this.apiUrl}/${tabId}`, { observe: 'response' }).pipe(
      map(response => response.status === 204),
      catchError(error => {
        console.error('Error deleting canvas:', error);
        return of(false);
      })
    );
  }

  /**
   * List all canvases for the current user
   */
  listCanvases(): Observable<TabCanvas[]> {
    return this.http.get<TabCanvas[]>(this.apiUrl).pipe(
      catchError(error => {
        console.error('Error listing canvases:', error);
        return of([]);
      })
    );
  }

  /**
   * Save or update canvas (auto-detect based on existing data)
   */
  saveOrUpdateCanvas(tabId: string, name: string, canvasType: string, data: CanvasData): Observable<SaveCanvasResponse> {
    const request: SaveCanvasRequest = {
      tab_id: tabId,
      name,
      canvas_type: canvasType,
      data
    };

    // Try to update first, if not found then save new
    return this.updateCanvas(tabId, request).pipe(
      catchError(() => this.saveCanvas(request))
    );
  }

  /**
   * WASM-WebGL Integration Methods
   */

  /**
   * Save WASM canvas data (converts to Kalisi format)
   */
  saveWasmCanvas(tabId: string, name: string, canvasType: string, wasmData: WasmWebGLData): Observable<SaveCanvasResponse> {
    // Convert WASM data to Kalisi format for backend compatibility
    const kalisiData = this.dataMappingService.mapWasmWebGLToKalisi(wasmData);
    
    const request: SaveCanvasRequest = {
      tab_id: tabId,
      name,
      canvas_type: canvasType + '_wasm', // Mark as WASM variant
      data: kalisiData
    };

    return this.saveOrUpdateCanvas(tabId, name, canvasType + '_wasm', kalisiData);
  }

  /**
   * Load canvas data and convert to WASM format
   */
  loadWasmCanvas(tabId: string): Observable<WasmWebGLData | null> {
    return this.loadCanvas(tabId).pipe(
      map(canvas => {
        if (!canvas || !canvas.data) {
          return null;
        }
        
        // Convert Kalisi data to WASM format
        return this.dataMappingService.mapKalisiToWasmWebGL(canvas.data);
      }),
      catchError(error => {
        console.error('Error loading WASM canvas:', error);
        return of(null);
      })
    );
  }

  /**
   * Create a new canvas with WASM-optimized default data
   */
  createWasmCanvas(tabId: string, name: string): Observable<SaveCanvasResponse> {
    // Create sample WASM data
    const wasmData: WasmWebGLData = {
      entities: {
        'welcome_entity': this.dataMappingService.createWasmEntity({
          id: 'welcome_entity',
          text: 'Welcome to WASM-WebGL Canvas',
          position: { x: 100, y: 100 },
          size: { x: 200, y: 80 },
          color: '#4CAF50',
          icon: 'star'
        })
      },
      connections: [],
      view: {
        panX: 0,
        panY: 0,
        zoom: 1,
        panSensitivity: 1.0,
        zoomSensitivity: 3.0
      },
      render: {
        mode: 'clipart',
        backgroundColor: '#1a1a2e',
        showGrid: true,
        selectionColor: '#4CAF50'
      }
    };

    return this.saveWasmCanvas(tabId, name, 'wasm_default', wasmData);
  }

  /**
   * Validate and migrate existing canvas to WASM format
   */
  migrateToWasmCanvas(tabId: string): Observable<WasmWebGLData | null> {
    return this.loadCanvas(tabId).pipe(
      map(canvas => {
        if (!canvas || !canvas.data) {
          console.warn(`No canvas data found for tab ${tabId}, creating default WASM data`);
          return null;
        }

        // Validate Kalisi data structure
        if (!this.dataMappingService.validateKalisiData(canvas.data)) {
          console.error(`Invalid Kalisi data structure for tab ${tabId}`);
          return null;
        }

        // Convert to WASM format
        const wasmData = this.dataMappingService.mapKalisiToWasmWebGL(canvas.data);
        
        // Validate converted data
        if (!this.dataMappingService.validateWasmData(wasmData)) {
          console.error(`Failed to create valid WASM data for tab ${tabId}`);
          return null;
        }

        console.log(`Successfully migrated canvas data for tab ${tabId} to WASM format`);
        return wasmData;
      }),
      catchError(error => {
        console.error('Error migrating canvas to WASM format:', error);
        return of(null);
      })
    );
  }
}