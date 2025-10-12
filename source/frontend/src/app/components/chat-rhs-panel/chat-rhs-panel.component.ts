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
import { CanvasControlService, LayoutEngineOption } from '../../core/services/canvas-control.service';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { CanvasEventHistoryComponent } from '../canvas-event-history/canvas-event-history.component';
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
    TagModule,
    CanvasEventHistoryComponent
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

  isVisible = false;
  messages: ChatMessage[] = [];
  currentMessage = '';
  isTyping = false;
  isStreaming = false;
  
  // Configuration from environment
  cypherReadOnly = true;
  enableWriteFlow = false;
  allowDestructive = false;
  
  // Panel sizing and dragging
  panelWidth = 340; // Default width
  private isResizing = false;
  private startX = 0;
  private startWidth = 0;

  constructor(
    private safetyGuard: SafetyGuardService,
    private gptChat: GptChatService,
    private http: HttpClient,
    private canvasControlService: CanvasControlService,
    // Neo4j parsing now handled internally in Neo4jDataService
  ) {
    this.layoutEngines$ = this.canvasControlService.layoutEngines$;
    this.activeLayoutEngine$ = this.canvasControlService.activeLayoutEngine$;

    this.layoutQuickActions$ = combineLatest([this.layoutEngines$, this.activeLayoutEngine$]).pipe(
      map(([engines, active]) =>
        engines.map(engine => ({
          engineName: engine.id,
          label: engine.label,
          active: engine.id === (active?.id ?? null)
        }))
      )
    );
  }

  ngOnInit(): void {
    // Load safety configuration from environment
    // This will be populated from backend configuration
    this.loadSafetyConfig();
    
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
    
    // Load saved width from localStorage
    this.loadPanelWidth();
    
    // Set up resize drag handlers
    this.setupResizeHandlers();
  }

  ngOnDestroy(): void {
    // Cleanup event listeners
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
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

  private setupResizeHandlers(): void {
    // Add global mouse event listeners for dragging
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isResizing = true;
    this.startX = event.clientX;
    this.startWidth = this.panelWidth;
    
    // Add resizing class for visual feedback
    const panelElement = document.querySelector('.chat-rhs-panel') as HTMLElement;
    if (panelElement) {
      panelElement.classList.add('resizing');
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    if (!this.isResizing) return;
    
    event.preventDefault();
    
    // Calculate new width (drag left = wider, drag right = narrower)
    const deltaX = this.startX - event.clientX;
    let newWidth = this.startWidth + deltaX;
    
    // Constrain width
    newWidth = Math.max(280, Math.min(600, newWidth));
    
    this.panelWidth = newWidth;
    
    // Apply new width
    const panelElement = document.querySelector('.chat-rhs-panel') as HTMLElement;
    if (panelElement) {
      panelElement.style.width = this.panelWidth + 'px';
    }
  }

  private onMouseUp = () => {
    if (this.isResizing) {
      this.isResizing = false;
      
      // Remove resizing class
      const panelElement = document.querySelector('.chat-rhs-panel') as HTMLElement;
      if (panelElement) {
        panelElement.classList.remove('resizing');
      }
      
      // Save the new width
      this.savePanelWidth();
    }
  }

  private loadPanelWidth(): void {
    const savedWidth = localStorage.getItem('chat-rhs-panel-width');
    if (savedWidth) {
      this.panelWidth = parseInt(savedWidth, 10);
      // Apply immediately if panel exists
      setTimeout(() => {
        const panelElement = document.querySelector('.chat-rhs-panel') as HTMLElement;
        if (panelElement) {
          panelElement.style.width = this.panelWidth + 'px';
        }
      }, 0);
    }
  }

  private savePanelWidth(): void {
    localStorage.setItem('chat-rhs-panel-width', this.panelWidth.toString());
  }
}
