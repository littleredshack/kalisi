import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface AgentRequest {
  request_id: string;
  agent_type: string;
  message: string;
  timestamp: string;
}

export interface AgentResponse {
  request_id: string;
  agent_type: string;
  response: string;
  success: boolean;
  timestamp: string;
}

@Injectable({
  providedIn: 'root'
})
export class RedisSpaService {
  private websocket?: WebSocket;
  private pendingRequests = new Map<string, Subject<AgentResponse>>();
  private connectionSubject = new BehaviorSubject<boolean>(false);
  private uiStateSubject = new Subject<any>();
  
  connection$ = this.connectionSubject.asObservable();
  uiState$ = this.uiStateSubject.asObservable();

  constructor() {
    this.initializeRedisConnection();
  }

  /**
   * Send request directly to agent runtime via Redis
   */
  sendAgentRequest(agentType: string, message: string): Observable<AgentResponse> {
    const requestId = this.generateRequestId();
    const responseSubject = new Subject<AgentResponse>();
    
    this.pendingRequests.set(requestId, responseSubject);
    
    // Set timeout to prevent hanging requests when agents don't exist
    const timeout = setTimeout(() => {
      this.pendingRequests.delete(requestId);
      responseSubject.error(`Agent '${agentType}' did not respond within 10 seconds - agent may not exist`);
    }, 10000);
    
    const request: AgentRequest = {
      request_id: requestId,
      agent_type: agentType,
      message: message,
      timestamp: new Date().toISOString()
    };
    
    // Send via WebSocket to Redis agent:requests
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      try {
        this.websocket.send(JSON.stringify({
          type: 'agent_request',
          data: request
        }));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        responseSubject.error(`Failed to send request to agent '${agentType}': ${error}`);
      }
    } else {
      clearTimeout(timeout);
      responseSubject.error('Redis connection not available');
    }
    
    // Clear timeout when response is received
    const originalNext = responseSubject.next.bind(responseSubject);
    responseSubject.next = (value: AgentResponse) => {
      clearTimeout(timeout);
      originalNext(value);
    };
    
    return responseSubject.asObservable();
  }

  /**
   * Subscribe to agent UI state (for Log Display Agent, etc.)
   */
  subscribeToAgentUI(channel: string): Observable<any> {
    const uiSubject = new Subject<any>();
    
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'subscribe_ui',
        channel: channel
      }));
      
      // Store subscription for this channel
      // Will receive data via WebSocket onmessage
    }
    
    return uiSubject.asObservable();
  }

  private initializeRedisConnection(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/redis-ws`;
    
    this.websocket = new WebSocket(wsUrl);
    
    this.websocket.onopen = () => {
      console.log('🔌 Redis SPA connection established');
      this.connectionSubject.next(true);
    };
    
    this.websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'agent_response') {
          this.handleAgentResponse(data.data);
        } else if (data.type === 'agent_ui_state') {
          this.handleAgentUIState(data);
        } else if (data.type === 'agent_error') {
          this.handleAgentError(data);
        }
      } catch (error) {
        console.error('Failed to parse Redis message:', error);
      }
    };
    
    this.websocket.onclose = () => {
      console.log('🔌 Redis SPA connection closed');
      this.connectionSubject.next(false);
      
      // Auto-reconnect
      setTimeout(() => this.initializeRedisConnection(), 5000);
    };
    
    this.websocket.onerror = (error) => {
      console.error('Redis SPA connection error:', error);
    };
  }

  private handleAgentResponse(data: any): void {
    try {
      // Parse the JSON string in data.data
      const response: AgentResponse = JSON.parse(data.data);
      
      const pendingRequest = this.pendingRequests.get(response.request_id);
      if (pendingRequest) {
        pendingRequest.next(response);
        pendingRequest.complete();
        this.pendingRequests.delete(response.request_id);
      }
    } catch (error) {
      // Silent error handling to prevent console loops
    }
  }

  private handleAgentUIState(data: any): void {
    // Handle UI state updates from frontend-facing agents (no console logging to prevent loops)
    try {
      // Parse the JSON string in data.data
      const uiStateData = JSON.parse(data.data);
      
      // Forward to subject for components to handle
      this.uiStateSubject.next(uiStateData);
    } catch (error) {
      // Silent error handling to prevent console loops
    }
  }

  private handleAgentError(data: any): void {
    // Handle agent errors gracefully without crashing
    try {
      const errorMessage = data.error || 'Unknown agent error';
      console.warn('Agent request failed:', errorMessage);
      
      // Find and notify any pending requests
      this.pendingRequests.forEach((subject, requestId) => {
        subject.error(errorMessage);
        this.pendingRequests.delete(requestId);
      });
    } catch (error) {
      console.error('Error handling agent error:', error);
    }
  }

  private generateRequestId(): string {
    return `spa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  ngOnDestroy(): void {
    if (this.websocket) {
      this.websocket.close();
    }
  }
}