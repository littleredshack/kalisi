import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { RedisSpaService } from './redis-spa.service';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'log-output';
  content: string;
  timestamp: Date;
  isLogOutput?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();
  
  private typingSubject = new BehaviorSubject<boolean>(false);
  public typing$ = this.typingSubject.asObservable();

  private readonly API_ENDPOINT = '/api/chat'; // Will proxy to Claude API through backend

  constructor(
    private redisSpa: RedisSpaService
  ) {}

  sendMessage(content: string): Observable<ChatMessage> {
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    // Add user message immediately
    this.addMessage(userMessage);
    
    // Frontend logging removed for financial services compliance
    
    // Show typing indicator
    this.typingSubject.next(true);

    // Send directly to Chat Agent via Redis (pure SPA)
    return this.redisSpa.sendAgentRequest('chat-agent', content).pipe(
      map(response => {
        const assistantMessage: ChatMessage = {
          id: this.generateId(),
          role: 'assistant',
          content: response.response || 'I apologize, but I encountered an error processing your request.',
          timestamp: new Date()
        };
        
        this.typingSubject.next(false);
        this.addMessage(assistantMessage);
        
        // Check if this is log output that should be displayed in main panel
        if (this.isLogQuery(content) && response.response) {
          // Add raw log output as a special message for main panel display
          const outputMessage: ChatMessage = {
            id: this.generateId(),
            role: 'log-output',
            content: response.response,
            timestamp: new Date(),
            isLogOutput: true
          };
          this.addMessage(outputMessage);
        }
        
        return assistantMessage;
      }),
      catchError(error => {
        console.error('Chat API error:', error);
        this.typingSubject.next(false);
        
        const errorMessage: ChatMessage = {
          id: this.generateId(),
          role: 'assistant',
          content: 'I apologize, but I\'m having trouble connecting right now. Please try again later.',
          timestamp: new Date()
        };
        
        this.addMessage(errorMessage);
        return of(errorMessage);
      })
    );
  }

  clearMessages(): void {
    this.messagesSubject.next([]);
  }

  private addMessage(message: ChatMessage): void {
    const currentMessages = this.messagesSubject.value;
    this.messagesSubject.next([...currentMessages, message]);
  }

  private getConversationContext(): ChatMessage[] {
    // Return last 10 messages for context
    const messages = this.messagesSubject.value;
    return messages.slice(-10);
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private isLogQuery(content: string): boolean {
    const logKeywords = [
      'log', 'logs', 'error', 'errors', 'warning', 'warnings',
      'debug', 'info', 'critical', 'trace', 'system',
      'auth', 'authentication', 'api', 'websocket', 'chat',
      'show me', 'display', 'get', 'find', 'search',
      'last', 'recent', 'today', 'yesterday', 'minute', 'hour',
      'agent', 'security'
    ];
    
    const lower = content.toLowerCase();
    return logKeywords.some(keyword => lower.includes(keyword));
  }

  
}