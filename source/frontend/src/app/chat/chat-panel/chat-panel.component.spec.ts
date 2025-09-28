import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ChatPanelComponent } from './chat-panel.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';

describe('ChatPanelComponent', () => {
  let component: ChatPanelComponent;
  let fixture: ComponentFixture<ChatPanelComponent>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        ChatPanelComponent,
        BrowserAnimationsModule,
        HttpClientTestingModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        FormsModule
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatPanelComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Component Initialization', () => {
    it('should initialize with default values', () => {
      expect(component.messages).toEqual([]);
      expect(component.userInput).toBe('');
      expect(component.isTyping).toBe(false);
      expect(component.assistantName).toBe('TICO');
    });

    it('should display welcome message when no messages', () => {
      const welcomeMessage = compiled.querySelector('.welcome-message');
      expect(welcomeMessage).toBeTruthy();
      expect(welcomeMessage?.textContent).toContain('Hello! I\'m TICO');
    });
  });

  describe('Message Display', () => {
    it('should display user messages', () => {
      component.messages = [
        {
          id: '1',
          role: 'user',
          content: 'Test user message',
          timestamp: new Date()
        }
      ];
      fixture.detectChanges();

      const userMessage = compiled.querySelector('.user-message');
      expect(userMessage).toBeTruthy();
      expect(userMessage?.textContent).toContain('Test user message');
    });

    it('should display assistant messages', () => {
      component.messages = [
        {
          id: '2',
          role: 'assistant',
          content: 'Test assistant message',
          timestamp: new Date()
        }
      ];
      fixture.detectChanges();

      const assistantMessage = compiled.querySelector('.assistant-message');
      expect(assistantMessage).toBeTruthy();
      expect(assistantMessage?.textContent).toContain('Test assistant message');
    });

    it('should display multiple messages in order', () => {
      component.messages = [
        { id: '1', role: 'user', content: 'First', timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Second', timestamp: new Date() },
        { id: '3', role: 'user', content: 'Third', timestamp: new Date() }
      ];
      fixture.detectChanges();

      const messages = compiled.querySelectorAll('.message');
      expect(messages.length).toBe(3);
      expect(messages[0].textContent).toContain('First');
      expect(messages[1].textContent).toContain('Second');
      expect(messages[2].textContent).toContain('Third');
    });

    it('should display message timestamps', () => {
      const timestamp = new Date();
      component.messages = [
        { id: '1', role: 'user', content: 'Test', timestamp }
      ];
      fixture.detectChanges();

      const messageTime = compiled.querySelector('.message-time');
      expect(messageTime).toBeTruthy();
    });

    it('should display correct message author', () => {
      component.messages = [
        { id: '1', role: 'user', content: 'User message', timestamp: new Date() },
        { id: '2', role: 'assistant', content: 'Assistant message', timestamp: new Date() }
      ];
      fixture.detectChanges();

      const authors = compiled.querySelectorAll('.message-author');
      expect(authors[0].textContent).toContain('You');
      expect(authors[1].textContent).toContain('TICO');
    });
  });

  describe('Message Input', () => {
    it('should bind user input to textarea', () => {
      const textarea = compiled.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();

      component.userInput = 'Test input';
      fixture.detectChanges();
      expect(textarea.value).toBe('Test input');
    });

    it('should enable send button when input is not empty', () => {
      const sendButton = compiled.querySelector('.send-button') as HTMLButtonElement;
      
      component.userInput = '';
      fixture.detectChanges();
      expect(sendButton.disabled).toBe(true);

      component.userInput = 'Test message';
      fixture.detectChanges();
      expect(sendButton.disabled).toBe(false);
    });

    it('should disable send button when typing', () => {
      const sendButton = compiled.querySelector('.send-button') as HTMLButtonElement;
      
      component.userInput = 'Test message';
      component.isTyping = true;
      fixture.detectChanges();
      
      expect(sendButton.disabled).toBe(true);
    });
  });

  describe('Sending Messages', () => {
    it('should add message to list when sent', () => {
      component.userInput = 'Test message';
      component.sendMessage();

      expect(component.messages.length).toBe(1);
      expect(component.messages[0].content).toBe('Test message');
      expect(component.messages[0].role).toBe('user');
    });

    it('should clear input after sending', () => {
      component.userInput = 'Test message';
      component.sendMessage();

      expect(component.userInput).toBe('');
    });

    it('should not send empty messages', () => {
      component.userInput = '   ';
      component.sendMessage();

      expect(component.messages.length).toBe(0);
    });

    it('should simulate assistant response', (done) => {
      component.userInput = 'Test message';
      component.sendMessage();

      // Wait for simulated response
      setTimeout(() => {
        expect(component.messages.length).toBe(2);
        expect(component.messages[1].role).toBe('assistant');
        expect(component.isTyping).toBe(false);
        done();
      }, 1600);
    });

    it('should show typing indicator while waiting for response', (done) => {
      component.userInput = 'Test message';
      component.sendMessage();

      expect(component.isTyping).toBe(true);
      
      setTimeout(() => {
        expect(component.isTyping).toBe(false);
        done();
      }, 1600);
    });

    it('should scroll to bottom after adding message', () => {
      const scrollSpy = spyOn<any>(component, 'scrollToBottom');
      
      component.userInput = 'Test message';
      component.sendMessage();

      expect(scrollSpy).toHaveBeenCalled();
    });
  });

  describe('Keyboard Events', () => {
    it('should send message on Enter key', () => {
      spyOn(component, 'sendMessage');
      
      const event = new KeyboardEvent('keypress', {
        key: 'Enter',
        shiftKey: false
      });
      
      component.userInput = 'Test message';
      component.onKeyPress(event);
      
      expect(component.sendMessage).toHaveBeenCalled();
    });

    it('should not send message on Shift+Enter', () => {
      spyOn(component, 'sendMessage');
      
      const event = new KeyboardEvent('keypress', {
        key: 'Enter',
        shiftKey: true
      });
      
      component.userInput = 'Test message';
      component.onKeyPress(event);
      
      expect(component.sendMessage).not.toHaveBeenCalled();
    });

    it('should prevent default on Enter without Shift', () => {
      const event = new KeyboardEvent('keypress', {
        key: 'Enter',
        shiftKey: false
      });
      spyOn(event, 'preventDefault');
      
      component.userInput = 'Test message';
      component.onKeyPress(event);
      
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  describe('Typing Indicator', () => {
    it('should show typing indicator when isTyping is true', () => {
      component.isTyping = true;
      fixture.detectChanges();

      const typingIndicator = compiled.querySelector('.typing-indicator');
      expect(typingIndicator).toBeTruthy();
    });

    it('should hide typing indicator when isTyping is false', () => {
      component.isTyping = false;
      fixture.detectChanges();

      const typingIndicator = compiled.querySelector('.typing-indicator');
      expect(typingIndicator).toBeFalsy();
    });

    it('should display typing dots animation', () => {
      component.isTyping = true;
      fixture.detectChanges();

      const typingDots = compiled.querySelectorAll('.typing-dots span');
      expect(typingDots.length).toBe(3);
    });
  });

  describe('Scrolling', () => {
    it('should handle missing messages container gracefully', () => {
      component.messagesContainer = undefined as any;
      
      expect(() => (component as any).scrollToBottom()).not.toThrow();
    });
  });

  describe('UI Elements', () => {
    it('should display chat container', () => {
      const chatContainer = compiled.querySelector('.chat-container');
      expect(chatContainer).toBeTruthy();
    });

    it('should display messages container', () => {
      const messagesContainer = compiled.querySelector('.messages-container');
      expect(messagesContainer).toBeTruthy();
    });

    it('should display input area', () => {
      const inputArea = compiled.querySelector('.input-area');
      expect(inputArea).toBeTruthy();
    });

    it('should display send button with icon', () => {
      const sendButton = compiled.querySelector('.send-button');
      expect(sendButton).toBeTruthy();
      
      const sendIcon = sendButton?.querySelector('mat-icon');
      expect(sendIcon?.textContent).toContain('send');
    });

    it('should display message input field', () => {
      const messageInput = compiled.querySelector('.message-input');
      expect(messageInput).toBeTruthy();
    });
  });

  describe('Message Icons', () => {
    it('should display person icon for user messages', () => {
      component.messages = [
        { id: '1', role: 'user', content: 'Test', timestamp: new Date() }
      ];
      fixture.detectChanges();

      const icon = compiled.querySelector('.user-message .message-icon');
      expect(icon?.textContent).toContain('person');
    });

    it('should display smart_toy icon for assistant messages', () => {
      component.messages = [
        { id: '1', role: 'assistant', content: 'Test', timestamp: new Date() }
      ];
      fixture.detectChanges();

      const icon = compiled.querySelector('.assistant-message .message-icon');
      expect(icon?.textContent).toContain('smart_toy');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(1000);
      component.messages = [
        { id: '1', role: 'user', content: longMessage, timestamp: new Date() }
      ];
      fixture.detectChanges();

      const messageContent = compiled.querySelector('.message-content');
      expect(messageContent?.textContent).toContain(longMessage);
    });

    it('should handle messages with special characters', () => {
      const specialMessage = '<script>alert("test")</script>';
      component.messages = [
        { id: '1', role: 'user', content: specialMessage, timestamp: new Date() }
      ];
      fixture.detectChanges();

      const messageContent = compiled.querySelector('.message-content');
      expect(messageContent?.textContent).toContain(specialMessage);
      // Ensure it's not executed as HTML
      expect(compiled.querySelector('script')).toBeFalsy();
    });

    it('should handle rapid message sending', () => {
      for (let i = 0; i < 5; i++) {
        component.userInput = `Message ${i}`;
        component.sendMessage();
      }

      expect(component.messages.length).toBe(5);
    });
  });
});