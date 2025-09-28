import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { AuthV2Service } from '../../auth/services/auth-v2.service';
import { 
  View, 
  ViewTab, 
  GraphData,
  GraphNode,
  GraphEdge,
  CreateViewRequest, 
  ViewResponse, 
  GraphDataResponse 
} from '../models/view.models';

@Injectable({
  providedIn: 'root'
})
export class ViewsService {
  private readonly API_BASE = '/v2/views';
  
  // State management
  private viewsSubject = new BehaviorSubject<View[]>([]);
  public views$ = this.viewsSubject.asObservable();
  
  private openTabsSubject = new BehaviorSubject<ViewTab[]>([]);
  public openTabs$ = this.openTabsSubject.asObservable();
  
  private selectedTabIndexSubject = new BehaviorSubject<number>(0);
  public selectedTabIndex$ = this.selectedTabIndexSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthV2Service
  ) {
    this.loadViews();
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getAccessToken();
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  // View CRUD operations
  loadViews(): void {
    // For development, use mock views since API requires authentication
    const mockViews: View[] = [
      {
        id: 'view-1',
        name: 'View all nodes',
        description: 'Display all nodes and relationships in the graph',
        query: 'MATCH (n)-[r]->(m) RETURN n, r, m',
        plugin: 'basic-graph',
        ownerId: 'mock-user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'view-2', 
        name: 'User network',
        description: 'Show user connections and relationships',
        query: 'MATCH (u:User)-[r]-(n) RETURN u, r, n',
        plugin: 'basic-graph',
        ownerId: 'mock-user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'view-3',
        name: 'Company hierarchy',
        description: 'Display organizational structure',
        query: 'MATCH (c:Company)-[r:OWNS|EMPLOYS]->(n) RETURN c, r, n',
        plugin: 'hierarchical',
        ownerId: 'mock-user-1',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    
    // Use mock data immediately
    this.viewsSubject.next(mockViews);
    console.log('Loaded mock views:', mockViews);
    
    // TODO: Enable this when authentication is working properly
    /*
    this.http.get<View[]>(this.API_BASE, { headers: this.getHeaders() })
      .pipe(
        catchError(error => {
          console.error('Failed to load views:', error);
          return of(mockViews); // Fallback to mock data
        })
      )
      .subscribe(views => {
        this.viewsSubject.next(views);
      });
    */
  }

  createView(request: CreateViewRequest): Observable<View> {
    return this.http.post<ViewResponse>(this.API_BASE, request, { headers: this.getHeaders() })
      .pipe(
        map(response => {
          if (response.success && response.data) {
            // Add to views list
            const currentViews = this.viewsSubject.value;
            this.viewsSubject.next([...currentViews, response.data]);
            return response.data;
          }
          throw new Error(response.error || 'Failed to create view');
        })
      );
  }

  updateView(id: string, updates: Partial<View>): Observable<View> {
    return this.http.put<ViewResponse>(`${this.API_BASE}/${id}`, updates, { headers: this.getHeaders() })
      .pipe(
        map(response => {
          if (response.success && response.data) {
            // Update in views list
            const currentViews = this.viewsSubject.value;
            const index = currentViews.findIndex(v => v.id === id);
            if (index >= 0) {
              currentViews[index] = response.data;
              this.viewsSubject.next([...currentViews]);
            }
            return response.data;
          }
          throw new Error(response.error || 'Failed to update view');
        })
      );
  }

  deleteView(id: string): Observable<void> {
    return this.http.delete<ViewResponse>(`${this.API_BASE}/${id}`, { headers: this.getHeaders() })
      .pipe(
        map(response => {
          if (response.success) {
            // Remove from views list
            const currentViews = this.viewsSubject.value;
            this.viewsSubject.next(currentViews.filter(v => v.id !== id));
            
            // Close tab if open
            this.closeTab(id);
            return;
          }
          throw new Error(response.error || 'Failed to delete view');
        })
      );
  }

  // Graph data operations
  getViewData(viewId: string, params?: any): Observable<GraphData> {
    const queryParams = params ? `?${new URLSearchParams(params).toString()}` : '';
    return this.http.get<GraphDataResponse>(
      `${this.API_BASE}/${viewId}/data${queryParams}`, 
      { headers: this.getHeaders() }
    ).pipe(
      map(response => {
        if (response.success && response.data) {
          return response.data;
        }
        throw new Error(response.error || 'Failed to load graph data');
      })
    );
  }

  // Tab management
  openView(view: View): void {
    const tabs = this.openTabsSubject.value;
    
    // Check if already open
    const existingIndex = tabs.findIndex(t => t.viewId === view.id);
    if (existingIndex >= 0) {
      this.selectedTabIndexSubject.next(existingIndex);
      return;
    }
    
    // Create new tab
    const newTab: ViewTab = {
      id: `tab-${Date.now()}`,
      viewId: view.id,
      name: view.name,
      description: view.description,
      query: view.query,
      plugin: view.plugin,
      isLoading: true
    };
    
    this.openTabsSubject.next([...tabs, newTab]);
    this.selectedTabIndexSubject.next(tabs.length);
  }

  closeTab(tabId: string): void {
    const tabs = this.openTabsSubject.value;
    const index = tabs.findIndex(t => t.id === tabId || t.viewId === tabId);
    
    if (index >= 0) {
      const newTabs = tabs.filter((_, i) => i !== index);
      this.openTabsSubject.next(newTabs);
      
      // Adjust selected index if needed
      const currentSelected = this.selectedTabIndexSubject.value;
      if (currentSelected >= newTabs.length) {
        this.selectedTabIndexSubject.next(Math.max(0, newTabs.length - 1));
      }
    }
  }

  selectTab(index: number): void {
    this.selectedTabIndexSubject.next(index);
  }

  // Mock data for development
  getMockGraphData(): GraphData {
    const nodes: GraphNode[] = [
      { id: '1', label: 'John Doe', type: 'Person', x: 100, y: 100, properties: { age: 30 } },
      { id: '2', label: 'Acme Corp', type: 'Company', x: 300, y: 100, properties: { industry: 'Tech' } },
      { id: '3', label: 'Jane Smith', type: 'Person', x: 200, y: 250, properties: { age: 28 } },
      { id: '4', label: 'Project X', type: 'Project', x: 400, y: 200, properties: { status: 'Active' } },
    ];
    
    const edges: GraphEdge[] = [
      { id: 'e1', sourceId: '1', targetId: '2', type: 'WORKS_FOR', properties: { since: '2020' } },
      { id: 'e2', sourceId: '3', targetId: '2', type: 'WORKS_FOR', properties: { since: '2021' } },
      { id: 'e3', sourceId: '1', targetId: '3', type: 'KNOWS', properties: {} },
      { id: 'e4', sourceId: '2', targetId: '4', type: 'OWNS', properties: {} },
    ];
    
    // Link nodes to edges for convenience
    edges.forEach(edge => {
      edge.source = nodes.find(n => n.id === edge.sourceId);
      edge.target = nodes.find(n => n.id === edge.targetId);
    });
    
    return { nodes, edges };
  }
}