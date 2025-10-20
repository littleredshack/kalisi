import { Component, EventEmitter, Output, Input, OnInit, OnDestroy, OnChanges, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { SafetyGuardService, QueryClassification } from '../../core/services/safety-guard.service';
import { GptChatService } from '../../core/services/gpt-chat.service';
import { CanvasControlService, LayoutEngineOption, GraphLensOption } from '../../core/services/canvas-control.service';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
// Neo4j parsing now handled in Neo4jDataService

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  cypherQuery?: string;
  queryClassification?: QueryClassification;
  results?: any;
}

export interface CypherProposal {
  query: string;
  classification: QueryClassification;
  description: string;
  canExecute: boolean;
}

interface LayoutQuickAction {
  readonly engineName: string;
  readonly label: string;
  readonly active: boolean;
}

interface LensQuickAction {
  readonly lensId: string;
  readonly label: string;
  readonly active: boolean;
}

@Component({
  selector: 'app-chat-rhs-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    ScrollPanelModule,
    TooltipModule,
    TagModule
  ],
  templateUrl: './chat-rhs-panel.component.html',
  styleUrls: ['./chat-rhs-panel.component.scss']
})
export class ChatRhsPanelComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit {
  @Input() isOpen = false;
  @Output() panelToggled = new EventEmitter<boolean>();
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;

  readonly layoutEngines$: Observable<LayoutEngineOption[]>;
  readonly activeLayoutEngine$: Observable<LayoutEngineOption | null>;
  readonly layoutQuickActions$: Observable<LayoutQuickAction[]>;
  readonly lensOptions$: Observable<GraphLensOption[]>;
  readonly activeLens$: Observable<GraphLensOption | null>;
  readonly lensQuickActions$: Observable<LensQuickAction[]>;

  isVisible = false;
  messages: ChatMessage[] = [];
  currentMessage = '';
  isTyping = false;
  isStreaming = false;

  // Configuration from environment
  cypherReadOnly = true;
  enableWriteFlow = false;
  allowDestructive = false;

  // Panel state - floating panel
  panelWidth = 400;
  panelHeight = 700;
  panelX = window.innerWidth - 420;
  panelY = 100;

  dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  resizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private resizeHandle = '';

  private readonly STORAGE_KEY = 'chat-panel-state';

  constructor(
    private safetyGuard: SafetyGuardService,
    private gptChat: GptChatService,
    private http: HttpClient,
    private canvasControlService: CanvasControlService
    // Neo4j parsing now handled internally in Neo4jDataService
  ) {
    this.layoutEngines$ = this.canvasControlService.layoutEngines$;
    this.activeLayoutEngine$ = this.canvasControlService.activeLayoutEngine$;
    this.lensOptions$ = this.canvasControlService.graphLensOptions$;
    this.activeLens$ = this.canvasControlService.activeGraphLens$;

    this.layoutQuickActions$ = combineLatest([this.layoutEngines$, this.activeLayoutEngine$]).pipe(
      map(([engines, active]) =>
        engines.map(engine => ({
          engineName: engine.id,
          label: engine.label,
          active: engine.id === (active?.id ?? null)
        }))
      )
    );

    this.lensQuickActions$ = combineLatest([this.lensOptions$, this.activeLens$]).pipe(
      map(([lenses, active]) =>
        lenses.map(lens => ({
          lensId: lens.id,
          label: lens.label,
          active: lens.id === (active?.id ?? null)
        }))
      )
    );
  }

  ngOnInit(): void {
    // Load safety configuration from environment
    this.loadSafetyConfig();

    // Load panel state from localStorage
    this.loadPanelState();

    // Add global mouse event listeners
    document.addEventListener('mousemove', this.onGlobalMouseMove);
    document.addEventListener('mouseup', this.onGlobalMouseUp);
    document.addEventListener('keydown', this.onGlobalKeyDown);

    // Add welcome message
    this.addMessage({
      id: this.generateId(),
      type: 'assistant',
      content: 'Hello! I can help you craft Neo4j Cypher queries safely. Ask me anything about your graph database.',
      timestamp: new Date()
    });
  }

  ngAfterViewInit(): void {
    // Focus input when panel opens
    if (this.isVisible) {
      this.focusInput();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.onGlobalMouseMove);
    document.removeEventListener('mouseup', this.onGlobalMouseUp);
    document.removeEventListener('keydown', this.onGlobalKeyDown);
  }

  ngOnChanges(): void {
    // Sync with parent component state
    if (this.isOpen !== this.isVisible) {
      this.isVisible = this.isOpen;
      if (this.isVisible) {
        setTimeout(() => this.focusInput(), 300);
      }
    }
  }

  togglePanel(): void {
    this.isVisible = !this.isVisible;
    this.panelToggled.emit(this.isVisible);
    
    if (this.isVisible) {
      // Focus input after panel animation
      setTimeout(() => this.focusInput(), 300);
    }
  }

  closePanel(): void {
    this.isVisible = false;
    this.panelToggled.emit(false);
  }

  onSendMessage(): void {
    if (!this.currentMessage.trim() || this.isTyping) {
      return;
    }

    const userMessage = this.currentMessage.trim();
    this.currentMessage = '';


    // Add user message
    this.addMessage({
      id: this.generateId(),
      type: 'user',
      content: userMessage,
      timestamp: new Date()
    });

    // Start typing indicator
    this.isTyping = true;
    
    // Process with real ChatGPT
    this.processGptResponse(userMessage);
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.onSendMessage();
    }
  }

  clearConversation(): void {
    this.messages = [];
    this.gptChat.clearConversation();
    this.addMessage({
      id: this.generateId(),
      type: 'assistant',
      content: 'Conversation cleared. How can I help you with Neo4j queries?',
      timestamp: new Date()
    });
  }

  copyCypherQuery(query: string): void {
    navigator.clipboard.writeText(query).then(() => {
      // Could show a toast notification here
      console.log('Query copied to clipboard');
    });
  }

  applyLayout(engineName: string): void {
    if (!engineName) {
      return;
    }
    this.canvasControlService.changeLayoutEngine(engineName);
  }

  applyLens(lensId: string): void {
    if (!lensId) {
      return;
    }
    this.canvasControlService.changeGraphLens(lensId);
  }

  executeCypherQuery(proposal: CypherProposal): void {
    
    if (!proposal.canExecute) {
      console.log('🔴 EXECUTION BLOCKED - UNSAFE QUERY');
      this.addMessage({
        id: this.generateId(),
        type: 'assistant',
        content: `❌ Cannot execute query: ${this.getSafetyMessage(proposal.classification)}`,
        timestamp: new Date()
      });
      return;
    }

    
    // Execute read-only query via existing Neo4j gateway
    const startTime = Date.now();
    
    this.addMessage({
      id: this.generateId(),
      type: 'assistant',
      content: '🔄 Executing query...',
      timestamp: new Date()
    });

    const requestBody = {
      query: proposal.query,
      parameters: {}
    };


    this.http.post<any>('/v0/cypher/unified', requestBody).subscribe({
      next: (response) => {
        const executionTime = Date.now() - startTime;
        
        if (response.success && response.data) {
          const resultMessage = this.formatQueryResults(response, executionTime);
          this.addMessage({
            id: this.generateId(),
            type: 'assistant',
            content: resultMessage,
            timestamp: new Date(),
            results: response.data
          });
        } else {
          this.addMessage({
            id: this.generateId(),
            type: 'assistant',
            content: `❌ Query failed: ${response.message || 'Unknown error'}`,
            timestamp: new Date()
          });
        }
      },
      error: (error) => {
        const executionTime = Date.now() - startTime;
        
        this.addMessage({
          id: this.generateId(),
          type: 'assistant',
          content: `❌ Query execution failed after ${executionTime}ms: ${error.message || 'Network error'}`,
          timestamp: new Date()
        });
      }
    });
  }

  private formatQueryResults(response: any, executionTime: number): string {
    // Handle neo4rs unified endpoint response format
    const { data, execution_time_ms } = response;
    const actualExecutionTime = execution_time_ms || executionTime;
    
    let resultText = `✅ Query executed successfully in ${actualExecutionTime}ms\n`;
    
    if (data && data.results && Array.isArray(data.results)) {
      const resultCount = data.results.length;
      resultText += `📊 Results: ${resultCount} records\n`;
      
      if (data.columns && data.columns.length > 0) {
        resultText += `🏷️ Columns: ${data.columns.join(', ')}\n\n`;
      }
      
      if (resultCount > 0) {
        resultText += `**Sample Results** (first ${Math.min(3, resultCount)} records):\n`;
        
        data.results.slice(0, 3).forEach((record: any, index: number) => {
          // Simple raw data display without complex parsing
          resultText += `${index + 1}. `;
          for (const [colName, colValue] of Object.entries(record)) {
            resultText += `${colName}: ${JSON.stringify(colValue)} `;
          }
          resultText += '\n';
        });
        
        if (resultCount > 3) {
          resultText += `... and ${resultCount - 3} more records\n`;
        }
      } else {
        resultText += 'No records returned by query.';
      }
      
      // Show stats if available
      if (data.stats) {
        resultText += `\n📈 Stats: ${data.stats.rows} rows`;
        if (data.stats.counters && data.stats.counters.containsUpdates) {
          const c = data.stats.counters;
          if (c.nodesCreated > 0) resultText += `, ${c.nodesCreated} nodes created`;
          if (c.relationshipsCreated > 0) resultText += `, ${c.relationshipsCreated} rels created`;
        }
      }
    } else if (data && data.count !== undefined) {
      resultText += `📊 Results: ${data.count} records\n`;
      if (data.count === 0) {
        resultText += 'No records returned by query.';
      }
    } else {
      resultText += 'Query executed but no data format detected.';
    }
    
    return resultText;
  }

  getSafetyMessage(classification: QueryClassification): string {
    return this.safetyGuard.getSafetyMessage(classification, {
      cypherReadOnly: this.cypherReadOnly,
      enableWriteFlow: this.enableWriteFlow,
      allowDestructive: this.allowDestructive
    });
  }

  getRiskLevelClass(riskLevel: string): string {
    return this.safetyGuard.getRiskLevelClass(riskLevel as any);
  }

  getSeverityFromRisk(riskLevel: string): 'success' | 'info' | 'warn' | 'danger' {
    switch (riskLevel) {
      case 'critical': return 'danger';
      case 'high': return 'warn';
      case 'moderate': return 'info';
      default: return 'success';
    }
  }

  canExecuteQuery(classification: QueryClassification | undefined): boolean {
    if (!classification) return false;
    return classification.isReadOnly && this.cypherReadOnly;
  }

  getExecuteTooltip(classification: QueryClassification | undefined): string {
    if (!classification) return 'No query classification available';
    if (!this.canExecuteQuery(classification)) {
      return 'Query execution disabled - ' + this.getSafetyMessage(classification);
    }
    return 'Execute this query';
  }

  createProposal(message: ChatMessage): CypherProposal {
    return {
      query: message.cypherQuery || '',
      classification: message.queryClassification!,
      description: 'Query from conversation',
      canExecute: this.canExecuteQuery(message.queryClassification)
    };
  }

  getQueryDescription(message: ChatMessage): string | null {
    if (message.cypherQuery && message.queryClassification) {
      return this.generateQueryDescription(message.cypherQuery, message.queryClassification);
    }
    return null;
  }

  private addMessage(message: ChatMessage): void {
    this.messages.push(message);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }

  private focusInput(): void {
    if (this.messageInput) {
      this.messageInput.nativeElement.focus();
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private loadSafetyConfig(): void {
    // This will load from backend configuration service in Phase 2
    // For now, using defaults from .env values
    this.cypherReadOnly = true;
    this.enableWriteFlow = false;
    this.allowDestructive = false;
  }

  private processGptResponse(userMessage: string): void {
    // Real ChatGPT integration
    this.gptChat.sendMessage(userMessage).subscribe({
      next: (streamResponse) => {
        if (streamResponse.error) {
          this.isTyping = false;
          this.addMessage({
            id: this.generateId(),
            type: 'assistant',
            content: `❌ Error: ${streamResponse.error}`,
            timestamp: new Date()
          });
          return;
        }

        if (streamResponse.done) {
          this.isTyping = false;
          
          // Parse response for Cypher queries
          const cypherProposal = this.extractCypherFromResponse(streamResponse.content);
          
          const assistantMessage: ChatMessage = {
            id: this.generateId(),
            type: 'assistant',
            content: streamResponse.content,
            timestamp: new Date()
          };

          if (cypherProposal) {
            assistantMessage.cypherQuery = cypherProposal.query;
            assistantMessage.queryClassification = cypherProposal.classification;
          }

          this.addMessage(assistantMessage);
        } else {
          // Handle streaming updates if needed in future
          // For now, just wait for the complete response
        }
      },
      error: (error) => {
        this.isTyping = false;
        console.error('ChatGPT error:', error);
        this.addMessage({
          id: this.generateId(),
          type: 'assistant',
          content: '❌ Sorry, I encountered an error while processing your request. Please try again.',
          timestamp: new Date()
        });
      }
    });
  }

  private extractCypherFromResponse(content: string): CypherProposal | null {
    // Enhanced Cypher extraction - look for multiple patterns
    
    // Pattern 1: Standard code blocks with cypher/neo4j labels
    const labeledCypherRegex = /```(?:cypher|neo4j)\s*([\s\S]*?)```/gi;
    let match = labeledCypherRegex.exec(content);
    
    if (!match) {
      // Pattern 2: Generic code blocks that contain Cypher keywords
      const genericCodeRegex = /```(?:sql)?\s*([\s\S]*?)```/gi;
      const codeMatches = content.matchAll(genericCodeRegex);
      
      for (const codeMatch of codeMatches) {
        const codeContent = codeMatch[1].trim();
        // Check if it looks like Cypher (contains MATCH, RETURN, CREATE, etc.)
        if (/\b(MATCH|RETURN|CREATE|MERGE|DELETE|SET|REMOVE|WITH|WHERE)\b/i.test(codeContent)) {
          match = codeMatch;
          break;
        }
      }
    }
    
    if (!match) {
      // Pattern 3: Inline queries (look for Cypher keywords in regular text)
      const inlineRegex = /(?:query|cypher):\s*([^.!?\n]+(?:MATCH|RETURN|CREATE|MERGE)[^.!?\n]*)/gi;
      match = inlineRegex.exec(content);
    }
    
    if (match && match[1]) {
      let query = match[1].trim();
      
      // Clean up common artifacts
      query = query.replace(/^['"`]|['"`]$/g, ''); // Remove quotes
      query = query.replace(/\s+/g, ' '); // Normalize whitespace
      
      // Only process if it looks like a valid Cypher query
      if (query.length > 5 && /\b(MATCH|RETURN|CREATE|MERGE|DELETE|SET|REMOVE|WITH|WHERE)\b/i.test(query)) {
        const classification = this.safetyGuard.classifyQuery(query);
        
        return {
          query,
          classification,
          description: this.generateQueryDescription(query, classification),
          canExecute: this.canExecuteQuery(classification)
        };
      }
    }
    
    return null;
  }

  private generateQueryDescription(query: string, classification: QueryClassification): string {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('match') && queryLower.includes('return')) {
      if (queryLower.includes('limit')) {
        const limitMatch = query.match(/limit\s+(\d+)/i);
        const limit = limitMatch ? limitMatch[1] : 'some';
        return `Retrieves ${limit} records from the graph database`;
      }
      return 'Retrieves data from the graph database';
    }
    
    if (queryLower.includes('create')) {
      return 'Creates new nodes or relationships';
    }
    
    if (queryLower.includes('merge')) {
      return 'Creates or updates nodes/relationships';
    }
    
    if (queryLower.includes('delete')) {
      return 'Deletes data from the database';
    }
    
    if (queryLower.includes('set')) {
      return 'Updates properties of existing data';
    }
    
    return `${classification.riskLevel.toUpperCase()} risk query`;
  }

  private onGlobalKeyDown = (event: KeyboardEvent): void => {
    // Option-C (Alt-C) to toggle the panel
    if ((event.altKey || event.metaKey) && event.code === 'KeyC') {
      event.preventDefault();
      this.isVisible = !this.isVisible;
      this.panelToggled.emit(this.isVisible);
    }
  };

  // Drag functionality
  onHeaderDragStart(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.control-btn')) {
      return;
    }

    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragOffsetX = event.clientX - this.panelX;
    this.dragOffsetY = event.clientY - this.panelY;
    event.preventDefault();
  }

  // Resize functionality
  onResizeStart(event: MouseEvent, handle: string): void {
    this.resizing = true;
    this.resizeHandle = handle;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;
    this.resizeStartWidth = this.panelWidth;
    this.resizeStartHeight = this.panelHeight;
    event.preventDefault();
  }

  private onGlobalMouseMove = (event: MouseEvent): void => {
    if (this.dragging) {
      this.panelX = event.clientX - this.dragOffsetX;
      this.panelY = event.clientY - this.dragOffsetY;

      const maxX = window.innerWidth - 100;
      const maxY = window.innerHeight - 60;
      this.panelX = Math.max(0, Math.min(maxX, this.panelX));
      this.panelY = Math.max(0, Math.min(maxY, this.panelY));
    } else if (this.resizing) {
      const deltaX = event.clientX - this.resizeStartX;
      const deltaY = event.clientY - this.resizeStartY;

      switch (this.resizeHandle) {
        case 'right':
          this.panelWidth = Math.max(320, Math.min(700, this.resizeStartWidth + deltaX));
          break;
        case 'bottom':
          this.panelHeight = Math.max(400, Math.min(1000, this.resizeStartHeight + deltaY));
          break;
        case 'bottom-right':
          this.panelWidth = Math.max(320, Math.min(700, this.resizeStartWidth + deltaX));
          this.panelHeight = Math.max(400, Math.min(1000, this.resizeStartHeight + deltaY));
          break;
      }
    }
  };

  private onGlobalMouseUp = (): void => {
    if (this.resizing || this.dragging) {
      this.savePanelState();
    }
    this.resizing = false;
    this.dragging = false;
    this.resizeHandle = '';
  };

  private loadPanelState(): void {
    const savedState = localStorage.getItem(this.STORAGE_KEY);
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        if (state.width >= 320 && state.width <= 700) {
          this.panelWidth = state.width;
        }
        if (state.height >= 400 && state.height <= 1000) {
          this.panelHeight = state.height;
        }
        if (state.x !== undefined && state.y !== undefined) {
          this.panelX = Math.max(0, Math.min(window.innerWidth - 100, state.x));
          this.panelY = Math.max(0, Math.min(window.innerHeight - 60, state.y));
        }
      } catch (e) {
        console.warn('Failed to parse saved chat panel state', e);
      }
    }
  }

  private savePanelState(): void {
    const state = {
      x: this.panelX,
      y: this.panelY,
      width: this.panelWidth,
      height: this.panelHeight
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  }
}
