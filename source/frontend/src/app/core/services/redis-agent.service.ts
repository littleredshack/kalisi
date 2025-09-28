import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, interval } from 'rxjs';
import { map, switchMap, filter } from 'rxjs/operators';

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
export class RedisAgentService {
  private pendingRequests = new Map<string, BehaviorSubject<AgentResponse>>();
  private polling = false;
  private lastResponseId = '0';

  constructor(private http: HttpClient) {
    this.startResponsePolling();
  }

  /**
   * Send request to agent via Redis message bus
   */
  sendAgentRequest(agentType: string, message: string): Observable<AgentResponse> {
    const requestId = this.generateRequestId();
    const request: AgentRequest = {
      request_id: requestId,
      agent_type: agentType,
      message: message,
      timestamp: new Date().toISOString()
    };

    // Create response observable for this request
    const responseSubject = new BehaviorSubject<AgentResponse | null>(null);
    this.pendingRequests.set(requestId, responseSubject);

    // Send request via Redis
    this.http.post('/api/agent/request', request).subscribe({
      next: () => {
        console.log(`📤 Sent request ${requestId} to ${agentType}`);
      },
      error: (error) => {
        console.error('Failed to send agent request:', error);
        responseSubject.error(error);
        this.pendingRequests.delete(requestId);
      }
    });

    // Return observable that will emit when response arrives
    return responseSubject.asObservable().pipe(
      filter(response => response !== null),
      map(response => response!)
    );
  }

  /**
   * Start polling for agent responses
   */
  private startResponsePolling(): void {
    if (this.polling) return;
    
    this.polling = true;
    
    // Poll every 500ms for responses
    interval(500).pipe(
      switchMap(() => this.fetchAgentResponses())
    ).subscribe({
      next: (responses) => this.processAgentResponses(responses),
      error: (error) => console.error('Response polling error:', error)
    });
  }

  /**
   * Fetch agent responses from Redis
   */
  private fetchAgentResponses(): Observable<any> {
    return this.http.get(`/api/agent/responses?since=${this.lastResponseId}&limit=50`);
  }

  /**
   * Process incoming agent responses
   */
  private processAgentResponses(data: any): void {
    if (!data.responses || !Array.isArray(data.responses)) return;

    for (const responseData of data.responses) {
      try {
        const response: AgentResponse = {
          request_id: responseData.request_id,
          agent_type: responseData.agent_type,
          response: responseData.response,
          success: responseData.success,
          timestamp: responseData.timestamp
        };

        // Find pending request and emit response
        const pendingRequest = this.pendingRequests.get(response.request_id);
        if (pendingRequest) {
          pendingRequest.next(response);
          pendingRequest.complete();
          this.pendingRequests.delete(response.request_id);
        }

        // Update last response ID
        if (responseData.id > this.lastResponseId) {
          this.lastResponseId = responseData.id;
        }

      } catch (error) {
        console.error('Failed to process agent response:', error);
      }
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up pending requests on destroy
   */
  ngOnDestroy(): void {
    this.polling = false;
    for (const [requestId, subject] of this.pendingRequests) {
      subject.error('Service destroyed');
    }
    this.pendingRequests.clear();
  }
}