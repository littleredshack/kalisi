import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

/**
 * Graph delta interface aligned with backend GraphDelta
 */
export interface GraphDelta {
  type: 'graph_delta';
  viewNodeId: string;
  timestamp: number;
  nodesCreated?: Array<any>;
  nodesUpdated?: Array<{ guid: string; properties: Record<string, any> }>;
  nodesDeleted?: Array<string>;
  relationshipsCreated?: Array<any>;
  relationshipsDeleted?: Array<string>;
}

/**
 * Connection status for the realtime service
 */
export enum RealtimeConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Subscribed = 'subscribed',
  Error = 'error'
}

/**
 * Neo4j Realtime Service
 *
 * Manages WebSocket connection to the backend for real-time graph delta updates.
 * Implements exponential backoff for reconnection and provides observables for
 * delta updates and connection status.
 */
@Injectable({
  providedIn: 'root'
})
export class Neo4jRealtimeService {
  private websocket: WebSocket | null = null;
  private currentViewNodeId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // 1 second
  private reconnectTimer: any = null;

  // Observables
  private delta$ = new Subject<GraphDelta>();
  private status$ = new BehaviorSubject<RealtimeConnectionStatus>(
    RealtimeConnectionStatus.Disconnected
  );

  constructor() {
    console.log('[Neo4jRealtimeService] Service initialized');
  }

  /**
   * Get observable for graph delta updates
   */
  public getDelta$(): Observable<GraphDelta> {
    return this.delta$.asObservable();
  }

  /**
   * Get observable for connection status
   */
  public getStatus$(): Observable<RealtimeConnectionStatus> {
    return this.status$.asObservable();
  }

  /**
   * Connect to WebSocket and subscribe to graph changes for a ViewNode
   */
  public connect(viewNodeId: string): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      console.log('[Neo4jRealtimeService] Already connected, updating subscription');
      this.subscribe(viewNodeId);
      return;
    }

    this.currentViewNodeId = viewNodeId;
    this.setupWebSocket();
  }

  /**
   * Disconnect from WebSocket
   */
  public disconnect(): void {
    console.log('[Neo4jRealtimeService] Disconnecting');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    this.currentViewNodeId = null;
    this.reconnectAttempts = 0;
    this.status$.next(RealtimeConnectionStatus.Disconnected);
  }

  /**
   * Setup WebSocket connection
   */
  private setupWebSocket(): void {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port;
      const wsUrl = `${protocol}//${host}:${port}/ws`;

      console.log(`[Neo4jRealtimeService] Connecting to ${wsUrl}`);
      this.status$.next(RealtimeConnectionStatus.Connecting);

      this.websocket = new WebSocket(wsUrl);

      this.websocket.onopen = () => {
        console.log('[Neo4jRealtimeService] WebSocket connected');
        this.status$.next(RealtimeConnectionStatus.Connected);
        this.reconnectAttempts = 0;

        // Subscribe to graph changes if we have a view node ID
        if (this.currentViewNodeId) {
          this.subscribe(this.currentViewNodeId);
        }
      };

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.error('[Neo4jRealtimeService] Error parsing WebSocket message:', e);
        }
      };

      this.websocket.onclose = (event) => {
        console.log('[Neo4jRealtimeService] WebSocket closed', event);
        this.websocket = null;

        if (this.currentViewNodeId) {
          this.scheduleReconnect();
        } else {
          this.status$.next(RealtimeConnectionStatus.Disconnected);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('[Neo4jRealtimeService] WebSocket error:', error);
        this.status$.next(RealtimeConnectionStatus.Error);
      };

    } catch (error) {
      console.error('[Neo4jRealtimeService] Error setting up WebSocket:', error);
      this.status$.next(RealtimeConnectionStatus.Error);
      this.scheduleReconnect();
    }
  }

  /**
   * Send subscription message to backend
   */
  private subscribe(viewNodeId: string): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('[Neo4jRealtimeService] Cannot subscribe: WebSocket not open');
      return;
    }

    this.currentViewNodeId = viewNodeId;

    const subscriptionMessage = {
      type: 'subscribe_graph_changes',
      viewNodeId: viewNodeId
    };

    console.log('[Neo4jRealtimeService] Subscribing to graph changes:', viewNodeId);
    this.websocket.send(JSON.stringify(subscriptionMessage));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: any): void {
    if (!data.type) {
      return;
    }

    switch (data.type) {
      case 'graph_subscription_ack':
        console.log('[Neo4jRealtimeService] Subscription acknowledged:', data.viewNodeId);
        this.status$.next(RealtimeConnectionStatus.Subscribed);
        break;

      case 'graph_subscription_error':
        console.error('[Neo4jRealtimeService] Subscription error:', data.error);
        this.status$.next(RealtimeConnectionStatus.Error);
        break;

      case 'graph_delta':
        // [TIMING T4] Delta received via WebSocket
        const delta = data as GraphDelta;
        // Try to extract trace_id from node properties
        let traceId = '';
        if (delta.nodesUpdated && delta.nodesUpdated.length > 0) {
          traceId = delta.nodesUpdated[0].properties?.['trace_id'] as string || '';
        }
        if (traceId) {
          const t4 = Date.now();
          console.log(`[TIMING:${traceId}:T4:${t4}] Delta received via WebSocket`);
        }
        console.log('[Neo4jRealtimeService] Received graph delta:', data);
        this.delta$.next(delta);
        break;

      default:
        // Ignore other message types (security updates, pong, etc.)
        break;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Neo4jRealtimeService] Max reconnection attempts reached');
      this.status$.next(RealtimeConnectionStatus.Error);
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 64s, ...
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
    const totalDelay = delay + jitter;

    console.log(
      `[Neo4jRealtimeService] Scheduling reconnect in ${Math.round(totalDelay / 1000)}s (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    );

    this.reconnectAttempts++;
    this.status$.next(RealtimeConnectionStatus.Disconnected);

    this.reconnectTimer = setTimeout(() => {
      this.setupWebSocket();
    }, totalDelay);
  }
}
