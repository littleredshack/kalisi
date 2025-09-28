import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { MatBadgeModule } from '@angular/material/badge';
import { ChatService } from '../../core/services/chat.service';
import { RedisSpaService } from '../../core/services/redis-spa.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface ChatMessage {
  type: 'user' | 'agent' | 'output';
  content: string;
  timestamp: Date;
}

interface LogFilter {
  level?: string;
  service?: string;
  keyword?: string;
}

interface UILogEntry {
  id: string;
  timestamp: string;
  level: string;
  service: string;
  category: string;
  message: string;
  correlation_id?: string;
  stream_type: 'historical' | 'realtime';
}

interface LogStreamStatus {
  active: boolean;
  lastUpdate: Date | null;
  error: string | null;
  entryCount: number;
}

@Component({
  selector: 'app-logs-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatOptionModule,
    MatBadgeModule
  ],
  templateUrl: './logs-panel.component.html',
  styleUrls: ['./logs-panel.component.scss']
})
export class LogsPanelComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  @ViewChild('outputContainer') private outputContainer!: ElementRef;
  @ViewChild('logsContainer') private logsContainer!: ElementRef;
  
  private destroy$ = new Subject<void>();
  
  // Chat mode properties
  messages: ChatMessage[] = [];
  currentQuery = '';
  isProcessing = false;
  quickQueries: string[] = [];
  currentOutput = '';
  
  // Streaming mode properties
  isStreamingMode = false;
  streamLogs: UILogEntry[] = [];
  streamStatus: LogStreamStatus = { active: false, lastUpdate: null, error: null, entryCount: 0 };
  currentFilters: LogFilter = {};
  
  // Filter options
  levelOptions = ['all', 'error', 'warn', 'info', 'debug'];
  serviceOptions = ['all', 'security-agent', 'api-gateway', 'agent-runtime'];
  
  private websocket?: WebSocket;

  constructor(
    private chatService: ChatService,
    private redisSpaService: RedisSpaService
  ) {}
  
  ngOnInit() {
    this.quickQueries = [
      'show streaming logs',
      'show me logs for the last 10 minutes',
      'filter logs by error',
      'show errors from today', 
      'show auth logs',
      'show critical errors',
      'show websocket activity',
      'show all warnings',
      'show agent activities',
      'show system logs from the last hour'
    ];
    
    // Subscribe to UI state updates from Redis SPA service
    this.redisSpaService.uiState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(uiState => {
        this.handleAgentUIState(uiState);
      });
    
    // Initialize WebSocket connection for agent message bus
    this.initializeWebSocket();
    
    // Initial greeting
    this.messages.push({
      type: 'agent',
      content: 'Log Analysis Agent ready. Ask me about your logs using natural language. Try "show streaming logs" for real-time monitoring.',
      timestamp: new Date()
    });
  }
  
  ngOnDestroy() {
    if (this.websocket) {
      this.websocket.close();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  ngAfterViewChecked() {
    this.scrollToBottom();
  }
  
  async sendQuery() {
    if (!this.currentQuery.trim() || this.isProcessing) {
      return;
    }
    
    const query = this.currentQuery;
    this.currentQuery = '';
    
    // Add user message
    this.messages.push({
      type: 'user',
      content: query,
      timestamp: new Date()
    });
    
    this.isProcessing = true;
    
    // Process query through unified chat service (Security Agent)
    this.chatService.sendMessage(query).subscribe({
      next: (response) => {
        // Add agent response
        this.messages.push({
          type: 'agent',
          content: response.content,
          timestamp: new Date()
        });
        
        // The raw output will be included in the content
        this.currentOutput = response.content;
        this.isProcessing = false;
      },
      error: (error) => {
        this.messages.push({
          type: 'agent',
          content: 'Error processing your query. Please try again.',
          timestamp: new Date()
        });
        this.isProcessing = false;
      }
    });
  }
  
  useQuickQuery(query: string) {
    this.currentQuery = query;
    this.sendQuery();
  }
  
  clearChat() {
    this.messages = [{
      type: 'agent',
      content: 'Log Monitor Agent ready. Ask me about your logs using natural language.',
      timestamp: new Date()
    }];
    this.currentOutput = '';
  }
  
  private scrollToBottom(): void {
    try {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    } catch(err) {}
  }
  
  onKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendQuery();
    }
  }
  
  // Streaming mode methods (via Log Analysis Agent)
  toggleStreamingMode() {
    this.isStreamingMode = !this.isStreamingMode;
    
    if (this.isStreamingMode) {
      this.startStreaming();
    } else {
      this.stopStreaming();
    }
  }
  
  startStreaming() {
    // Send command to Log Analysis Agent via chat (gets confirmation)
    let command = 'start streaming logs';
    
    if (this.currentFilters.level && this.currentFilters.level !== 'all') {
      command += ` level:${this.currentFilters.level}`;
    }
    if (this.currentFilters.service && this.currentFilters.service !== 'all') {
      command += ` service:${this.currentFilters.service}`;
    }
    if (this.currentFilters.keyword) {
      command += ` keyword:${this.currentFilters.keyword}`;
    }
    
    this.sendChatCommand(command);
    this.streamStatus.active = true;
  }
  
  stopStreaming() {
    this.sendChatCommand('stop log streaming');
    this.streamStatus.active = false;
    this.streamLogs = [];
  }
  
  pauseResumeStream() {
    // Direct WebSocket control - no agent command needed
  }
  
  clearStreamLogs() {
    this.streamLogs = [];
  }
  
  applyFilters() {
    if (this.isStreamingMode) {
      this.startStreaming(); // Restart with new filters
    }
  }
  
  clearFilters() {
    this.currentFilters = {};
    if (this.isStreamingMode) {
      this.startStreaming();
    }
  }
  
  // Send command to Log Analysis Agent via chat interface (confirmations only)
  private sendChatCommand(command: string) {
    this.chatService.sendMessage(command).subscribe({
      next: (response) => {
        // Add ONLY agent confirmation to chat (no log data)
        this.messages.push({
          type: 'agent',
          content: response.content,
          timestamp: new Date()
        });
      },
      error: (error) => {
        this.messages.push({
          type: 'agent',
          content: 'Error: Failed to process streaming command.',
          timestamp: new Date()
        });
      }
    });
  }
  
  getLogLevelClass(level: string): string {
    switch (level.toLowerCase()) {
      case 'error': return 'log-level-error';
      case 'warn': return 'log-level-warn';
      case 'info': return 'log-level-info';
      case 'debug': return 'log-level-debug';
      default: return 'log-level-default';
    }
  }
  
  formatLogTimestamp(timestamp: string): string {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return timestamp;
    }
  }
  
  trackLogEntry(index: number, log: UILogEntry): string {
    return log.id;
  }
  
  // WebSocket for Log Display Agent UI state (self-contained agent approach)
  private initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;
    
    this.websocket = new WebSocket(wsUrl);
    
    this.websocket.onopen = () => {
      // Silent connection - no console logging to prevent loops
      // Subscribe to Log Display Agent UI state
      this.websocket?.send(JSON.stringify({
        type: 'subscribe',
        channel: 'ui:logs_panel'
      }));
    };
    
    this.websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle UI state updates from Log Display Agent (direct or wrapped)
        if (data.type === 'logs_panel_update' || (data.logs && Array.isArray(data.logs))) {
          this.handleAgentUIState(data);
        }
      } catch (error) {
        // Silent error handling to prevent console loops
      }
    };
    
    this.websocket.onclose = () => {
      // Silent disconnect to prevent console loops
    };
    
    this.websocket.onerror = (error) => {
      // Silent error handling to prevent console loops  
      this.streamStatus.error = 'Log Display Agent connection error';
    };
  }
  
  // Handle UI state updates from Log Display Agent (self-contained agent)
  private handleAgentUIState(data: any) {
    if (data.logs && Array.isArray(data.logs)) {
      // Agent provides complete UI state - just display it
      this.streamLogs = data.logs.map((logData: any) => ({
        id: logData.id,
        timestamp: logData.timestamp,
        level: logData.level,
        service: logData.agent_id,
        category: logData.category,
        message: logData.message,
        correlation_id: logData.correlation_id,
        stream_type: 'realtime'
      }));
      
      // Update status from agent
      this.streamStatus = {
        active: data.mode === 'streaming',
        lastUpdate: new Date(data.last_update),
        error: null,
        entryCount: data.count
      };
      
      // Silent UI state handling to prevent console loops
    }
  }
}