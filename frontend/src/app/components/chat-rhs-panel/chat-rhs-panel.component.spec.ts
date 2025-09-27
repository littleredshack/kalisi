import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatRhsPanelComponent } from './chat-rhs-panel.component';
import { SafetyGuardService } from '../../core/services/safety-guard.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

describe('ChatRhsPanelComponent', () => {
  let component: ChatRhsPanelComponent;
  let fixture: ComponentFixture<ChatRhsPanelComponent>;
  let safetyGuardService: jasmine.SpyObj<SafetyGuardService>;

  beforeEach(async () => {
    const spy = jasmine.createSpyObj('SafetyGuardService', ['classifyQuery', 'getSafetyMessage', 'getRiskLevelClass']);

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        ChatRhsPanelComponent
      ],
      providers: [
        { provide: SafetyGuardService, useValue: spy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatRhsPanelComponent);
    component = fixture.componentInstance;
    safetyGuardService = TestBed.inject(SafetyGuardService) as jasmine.SpyObj<SafetyGuardService>;

    // Mock default safety guard responses
    safetyGuardService.classifyQuery.and.returnValue({
      isReadOnly: true,
      containsWrite: false,
      containsDelete: false,
      containsSchemaChange: false,
      riskLevel: 'safe',
      requiresConfirmation: false
    });
    safetyGuardService.getSafetyMessage.and.returnValue('✅ Safe read-only query');
    safetyGuardService.getRiskLevelClass.and.returnValue('risk-safe');

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with panel hidden', () => {
    expect(component.isVisible).toBeFalse();
  });

  it('should have welcome message on initialization', () => {
    expect(component.messages.length).toBe(1);
    expect(component.messages[0].type).toBe('assistant');
    expect(component.messages[0].content).toContain('Hello!');
  });

  it('should toggle panel visibility', () => {
    expect(component.isVisible).toBeFalse();
    
    component.togglePanel();
    expect(component.isVisible).toBeTrue();
    
    component.togglePanel();
    expect(component.isVisible).toBeFalse();
  });

  it('should emit panelToggled event when toggling', () => {
    spyOn(component.panelToggled, 'emit');
    
    component.togglePanel();
    expect(component.panelToggled.emit).toHaveBeenCalledWith(true);
    
    component.togglePanel();
    expect(component.panelToggled.emit).toHaveBeenCalledWith(false);
  });

  it('should close panel and emit event', () => {
    spyOn(component.panelToggled, 'emit');
    component.isVisible = true;
    
    component.closePanel();
    
    expect(component.isVisible).toBeFalse();
    expect(component.panelToggled.emit).toHaveBeenCalledWith(false);
  });

  it('should send message when currentMessage is not empty', () => {
    component.currentMessage = 'test message';
    const initialMessageCount = component.messages.length;
    
    component.onSendMessage();
    
    expect(component.messages.length).toBe(initialMessageCount + 1);
    expect(component.messages[component.messages.length - 1].content).toBe('test message');
    expect(component.messages[component.messages.length - 1].type).toBe('user');
    expect(component.currentMessage).toBe('');
  });

  it('should not send empty message', () => {
    component.currentMessage = '   ';
    const initialMessageCount = component.messages.length;
    
    component.onSendMessage();
    
    expect(component.messages.length).toBe(initialMessageCount);
  });

  it('should not send message when typing', () => {
    component.currentMessage = 'test message';
    component.isTyping = true;
    const initialMessageCount = component.messages.length;
    
    component.onSendMessage();
    
    expect(component.messages.length).toBe(initialMessageCount);
  });

  it('should handle Enter key to send message', () => {
    component.currentMessage = 'test message';
    const event = new KeyboardEvent('keypress', { key: 'Enter' });
    spyOn(event, 'preventDefault');
    spyOn(component, 'onSendMessage');
    
    component.onKeyPress(event);
    
    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.onSendMessage).toHaveBeenCalled();
  });

  it('should not handle Shift+Enter as send', () => {
    component.currentMessage = 'test message';
    const event = new KeyboardEvent('keypress', { key: 'Enter', shiftKey: true });
    spyOn(event, 'preventDefault');
    spyOn(component, 'onSendMessage');
    
    component.onKeyPress(event);
    
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(component.onSendMessage).not.toHaveBeenCalled();
  });

  it('should clear conversation', () => {
    // Add some messages first
    component.messages = [
      { id: '1', type: 'user', content: 'test', timestamp: new Date() },
      { id: '2', type: 'assistant', content: 'response', timestamp: new Date() }
    ];
    
    component.clearConversation();
    
    expect(component.messages.length).toBe(1);
    expect(component.messages[0].type).toBe('assistant');
    expect(component.messages[0].content).toContain('Conversation cleared');
  });

  it('should copy cypher query to clipboard', async () => {
    const testQuery = 'MATCH (n) RETURN n';
    const mockClipboard = jasmine.createSpyObj('clipboard', ['writeText']);
    mockClipboard.writeText.and.returnValue(Promise.resolve());
    
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      configurable: true
    });
    
    component.copyCypherQuery(testQuery);
    
    expect(mockClipboard.writeText).toHaveBeenCalledWith(testQuery);
  });

  it('should determine if query can be executed', () => {
    const readOnlyClassification = {
      isReadOnly: true,
      containsWrite: false,
      containsDelete: false,
      containsSchemaChange: false,
      riskLevel: 'safe' as const,
      requiresConfirmation: false
    };
    
    const writeClassification = {
      isReadOnly: false,
      containsWrite: true,
      containsDelete: false,
      containsSchemaChange: false,
      riskLevel: 'moderate' as const,
      requiresConfirmation: true
    };
    
    component.cypherReadOnly = true;
    
    expect(component.canExecuteQuery(readOnlyClassification)).toBeTrue();
    expect(component.canExecuteQuery(writeClassification)).toBeFalse();
    expect(component.canExecuteQuery(undefined)).toBeFalse();
  });

  it('should get appropriate execute tooltip', () => {
    const readOnlyClassification = {
      isReadOnly: true,
      containsWrite: false,
      containsDelete: false,
      containsSchemaChange: false,
      riskLevel: 'safe' as const,
      requiresConfirmation: false
    };
    
    component.cypherReadOnly = true;
    
    const tooltip = component.getExecuteTooltip(readOnlyClassification);
    expect(tooltip).toBe('Execute this query');
    
    const noClassTooltip = component.getExecuteTooltip(undefined);
    expect(noClassTooltip).toBe('No query classification available');
  });

  it('should get correct severity from risk level', () => {
    expect(component.getSeverityFromRisk('safe')).toBe('success');
    expect(component.getSeverityFromRisk('moderate')).toBe('info');
    expect(component.getSeverityFromRisk('high')).toBe('warning');
    expect(component.getSeverityFromRisk('critical')).toBe('danger');
  });

  it('should create proposal from message', () => {
    const message = {
      id: '1',
      type: 'assistant' as const,
      content: 'test',
      timestamp: new Date(),
      cypherQuery: 'MATCH (n) RETURN n',
      queryClassification: {
        isReadOnly: true,
        containsWrite: false,
        containsDelete: false,
        containsSchemaChange: false,
        riskLevel: 'safe' as const,
        requiresConfirmation: false
      }
    };
    
    const proposal = component.createProposal(message);
    
    expect(proposal.query).toBe('MATCH (n) RETURN n');
    expect(proposal.classification).toBe(message.queryClassification);
    expect(proposal.description).toBe('Query from conversation');
  });

  it('should simulate AI response for node queries', (done) => {
    component.currentMessage = 'show me nodes';
    component.onSendMessage();
    
    // Wait for simulated response
    setTimeout(() => {
      const lastMessage = component.messages[component.messages.length - 1];
      expect(lastMessage.type).toBe('assistant');
      expect(lastMessage.cypherQuery).toBeTruthy();
      expect(lastMessage.cypherQuery).toContain('MATCH (n) RETURN n');
      done();
    }, 1100);
  });

  it('should load safety configuration on init', () => {
    expect(component.cypherReadOnly).toBeTrue();
    expect(component.enableWriteFlow).toBeFalse();
    expect(component.allowDestructive).toBeFalse();
  });
});