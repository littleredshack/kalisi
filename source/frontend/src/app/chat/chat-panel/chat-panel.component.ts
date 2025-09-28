import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChatService, ChatMessage } from '../../core/services/chat.service';
import { ConfigService } from '../../core/services/config.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './chat-panel.component.html',
  styleUrls: ['./chat-panel.component.scss']
})
export class ChatPanelComponent implements OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  messages: ChatMessage[] = [];
  isTyping = false;
  userInput = '';
  assistantName = 'Claude';
  
  private destroy$ = new Subject<void>();

  constructor(
    public chatService: ChatService,
    private configService: ConfigService
  ) {}

  ngOnInit(): void {
    // Assistant name is now fixed as 'Claude'
    
    // Subscribe to messages
    this.chatService.messages$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(messages => {
      this.messages = messages;
      this.scrollToBottom();
    });

    // Subscribe to typing indicator
    this.chatService.typing$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(typing => {
      this.isTyping = typing;
      if (typing) {
        this.scrollToBottom();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  sendMessage(): void {
    if (!this.userInput.trim()) return;

    const message = this.userInput;
    this.userInput = '';
    
    this.chatService.sendMessage(message).pipe(
      takeUntil(this.destroy$)
    ).subscribe();
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    }, 100);
  }
}