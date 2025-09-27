import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ChatService, ChatMessage } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ChatService]
    });
    service = TestBed.inject(ChatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Message Management', () => {
    it('should start with empty messages', (done) => {
      service.messages$.subscribe(messages => {
        expect(messages.length).toBe(0);
        done();
      });
    });

    it('should clear all messages', () => {
      // First add some messages via sendMessage
      service.sendMessage('Test').subscribe();
      const req = httpMock.expectOne('/api/chat/messages');
      req.flush({ content: 'Response' });
      
      service.clearMessages();
      
      service.messages$.subscribe(messages => {
        expect(messages.length).toBe(0);
      });
    });
  });

  describe('Typing Indicator', () => {
    it('should start with typing false', (done) => {
      service.typing$.subscribe(typing => {
        expect(typing).toBe(false);
        done();
      });
    });

    it('should show typing indicator when sending message', () => {
      let typingStates: boolean[] = [];
      
      service.typing$.subscribe(typing => {
        typingStates.push(typing);
      });
      
      service.sendMessage('Test').subscribe();
      
      expect(typingStates[1]).toBe(true); // Should be true after sending
      
      const req = httpMock.expectOne('/api/chat/messages');
      req.flush({ content: 'Response' });
      
      expect(typingStates[2]).toBe(false); // Should be false after response
    });
  });

  describe('Chat API', () => {
    it('should send message to API and handle response', (done) => {
      const userMessage = 'What is OPEN EDT?';
      const apiResponse = {
        content: 'OPEN EDT is an Enterprise Digital Twin platform.',
        message_id: 'msg-123'
      };

      service.sendMessage(userMessage).subscribe(response => {
        expect(response.content).toBe(apiResponse.content);
        expect(response.role).toBe('assistant');
        
        service.messages$.subscribe(messages => {
          expect(messages.length).toBe(2);
          expect(messages[0].content).toBe(userMessage);
          expect(messages[0].role).toBe('user');
          expect(messages[1].content).toBe(apiResponse.content);
          expect(messages[1].role).toBe('assistant');
          done();
        });
      });

      const req = httpMock.expectOne('/api/chat/messages');
      expect(req.request.method).toBe('POST');
      expect(req.request.body.message).toBe(userMessage);
      req.flush(apiResponse);
    });

    it('should include context in API request', () => {
      // Send first message
      service.sendMessage('First message').subscribe();
      const req1 = httpMock.expectOne('/api/chat/messages');
      req1.flush({ content: 'First response' });
      
      // Send second message
      service.sendMessage('Follow-up question').subscribe();
      
      const req2 = httpMock.expectOne('/api/chat/messages');
      expect(req2.request.body.context).toBeDefined();
      expect(req2.request.body.context.length).toBeGreaterThan(0);
      req2.flush({ content: 'Response' });
    });

    it('should handle API errors gracefully', (done) => {
      const userMessage = 'Test message';
      
      service.sendMessage(userMessage).subscribe(response => {
        expect(response.role).toBe('assistant');
        expect(response.content).toContain('trouble connecting');
        
        service.messages$.subscribe(messages => {
          // Should have user message and error message
          expect(messages.length).toBe(2);
          expect(messages[1].content).toContain('trouble connecting');
          done();
        });
      });

      const req = httpMock.expectOne('/api/chat/messages');
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });
    });

    it('should handle missing content in response', (done) => {
      service.sendMessage('Test').subscribe(response => {
        expect(response.content).toContain('I apologize');
        done();
      });

      const req = httpMock.expectOne('/api/chat/messages');
      req.flush({}); // Empty response
    });

    it('should use message field if content field is missing', (done) => {
      const fallbackMessage = 'Fallback message';
      
      service.sendMessage('Test').subscribe(response => {
        expect(response.content).toBe(fallbackMessage);
        done();
      });

      const req = httpMock.expectOne('/api/chat/messages');
      req.flush({ message: fallbackMessage }); // Use message field instead of content
    });
  });

  describe('Message ID Generation', () => {
    it('should generate unique message IDs', () => {
      const messages: ChatMessage[] = [];
      
      // Send multiple messages
      for (let i = 0; i < 3; i++) {
        service.sendMessage(`Message ${i}`).subscribe(response => {
          messages.push(response);
        });
        
        const req = httpMock.expectOne('/api/chat/messages');
        req.flush({ content: `Response ${i}` });
      }
      
      // Check all IDs are unique
      const ids = new Set(messages.map(m => m.id));
      expect(ids.size).toBe(messages.length);
    });
  });

  describe('Context Management', () => {
    it('should limit context to last 10 messages', () => {
      // Add 12 messages
      for (let i = 0; i < 12; i++) {
        service.sendMessage(`Message ${i}`).subscribe();
        const req = httpMock.expectOne('/api/chat/messages');
        req.flush({ content: `Response ${i}` });
      }
      
      // Send one more and check context
      service.sendMessage('Final message').subscribe();
      
      const finalReq = httpMock.expectOne('/api/chat/messages');
      // Context should have max 10 messages (but we have 24 total - 12 user + 12 assistant)
      expect(finalReq.request.body.context.length).toBeLessThanOrEqual(10);
      finalReq.flush({ content: 'Final response' });
    });
  });
});