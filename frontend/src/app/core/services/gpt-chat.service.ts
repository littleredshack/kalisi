import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

export interface GptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GptResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamingResponse {
  content: string;
  done: boolean;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GptChatService {
  private readonly API_ENDPOINT = '/api/v1/chat/gpt';
  private readonly systemPrompt = `You are a helpful Neo4j Cypher query assistant integrated into the Kalisi system.

SAFETY POLICY:
- Only propose read-only Cypher queries unless the user explicitly requests write operations
- Always classify your query suggestions with clear safety warnings
- Never suggest destructive operations (DELETE, DETACH DELETE, DROP) unless explicitly requested and confirmed
- When suggesting write operations, always warn about potential data modifications
- Follow the principle: "Safe by default, powerful when authorized"

CYPHER EXPERTISE:
- Help users craft efficient and safe Neo4j Cypher queries
- Explain query patterns and best practices
- Suggest alternative approaches for complex queries
- Provide clear explanations of what each query does

INTEGRATION CONTEXT:
- You are integrated into a financial services enterprise system
- All operations must be auditable and traceable
- Prioritize data safety and integrity
- User can execute your query suggestions via the built-in query executor

Response format:
- Provide clear explanations
- When suggesting queries, format them in code blocks
- Always explain what the query does and any safety considerations`;

  private conversationHistory: GptMessage[] = [];

  constructor(private http: HttpClient) {
    // Initialize with system prompt
    this.conversationHistory.push({
      role: 'system',
      content: this.systemPrompt
    });
  }

  /**
   * Send a message to ChatGPT and get streaming response
   */
  sendMessage(userMessage: string): Observable<StreamingResponse> {
    const subject = new Subject<StreamingResponse>();
    
    // Add user message to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    const requestBody = {
      messages: this.conversationHistory,
      temperature: 0.7,
      max_tokens: 1000,
      stream: true
    };


    // Send request to backend proxy endpoint
    this.http.post(this.API_ENDPOINT, requestBody, {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      }),
      responseType: 'text' // Get raw response to debug parsing issues
    }).subscribe({
      next: (response: string) => {
        try {
          // Try to parse as JSON
          const parsedResponse = JSON.parse(response);
          
          if (parsedResponse.error) {
            subject.next({
              content: '',
              done: true,
              error: parsedResponse.error
            });
          } else if (parsedResponse.content) {
            
            // Add assistant response to conversation history
            if (parsedResponse.done) {
              this.conversationHistory.push({
                role: 'assistant',
                content: parsedResponse.full_content || parsedResponse.content
              });
            }
            
            subject.next({
              content: parsedResponse.content,
              done: parsedResponse.done || false
            });
            
            if (parsedResponse.done) {
              subject.complete();
            }
          } else {
            // If no content but valid JSON, treat as error
            subject.next({
              content: '',
              done: true,
              error: 'No content in response'
            });
            subject.complete();
          }
        } catch (parseError) {
          subject.next({
            content: '',
            done: true,
            error: `Failed to parse response: ${parseError}`
          });
          subject.complete();
        }
      },
      error: (error) => {
        subject.next({
          content: '',
          done: true,
          error: `API Error: ${error.message || 'Unknown error'}`
        });
        subject.complete();
      }
    });

    return subject.asObservable();
  }

  /**
   * Clear conversation history (keeps system prompt)
   */
  clearConversation(): void {
    this.conversationHistory = [
      {
        role: 'system',
        content: this.systemPrompt
      }
    ];
  }

  /**
   * Get current conversation history
   */
  getConversationHistory(): GptMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Get conversation length (excluding system prompt)
   */
  getConversationLength(): number {
    return Math.max(0, this.conversationHistory.length - 1);
  }
}