import { Injectable } from '@angular/core';

interface ConsoleLogData {
  type: 'console_log';
  level: string;
  message: string;
  timestamp: string;
  url: string;
  userAgent: string;
  sessionId: string;
  line?: number;
  column?: number;
  stack?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketLoggerService {
  private websocket: WebSocket | null = null;
  private sessionId: string;
  private originalConsole: any = {};
  private isInitialized = false;

  constructor() {
    this.sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
    this.initializeService();
  }

  private initializeService(): void {
    if (this.isInitialized) return;
    
    this.setupWebSocket();
    this.interceptConsole();
    this.setupErrorHandlers();
    this.isInitialized = true;
    
    this.originalConsole.log('[EDT] WebSocket Console Logger initialized');
  }

  private setupWebSocket(): void {
    try {
      // Use the correct port from environment configuration
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const port = window.location.port || (protocol === 'wss:' ? '443' : '80');
      
      // For local development, use port 3000 as configured in .env
      const wsPort = host === 'localhost' || host === '127.0.0.1' ? '3000' : port;
      const wsUrl = `${protocol}//${host}:${wsPort}/ws`;
      
      this.websocket = new WebSocket(wsUrl);
      
      this.websocket.onopen = () => {
        // Use original console to avoid intercepting our own logs
        this.originalConsole.log('[EDT] WebSocket connected for console logging');
        this.sendLog('info', 'Angular WebSocket console logger initialized');
      };
      
      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Silently handle incoming messages without logging to avoid feedback loops
          // The server has the logs, no need to echo them back to console
        } catch (e) {
          // Ignore parsing errors for non-JSON messages
        }
      };
      
      this.websocket.onclose = () => {
        this.originalConsole.log('[EDT] WebSocket connection closed, attempting to reconnect in 5s');
        setTimeout(() => this.setupWebSocket(), 5000);
      };
      
      this.websocket.onerror = (error) => {
        this.originalConsole.error('[EDT] WebSocket error:', error);
      };
    } catch (error) {
      this.originalConsole.error('[EDT] Failed to setup WebSocket:', error);
    }
  }

  private interceptConsole(): void {
    // Store original console methods
    this.originalConsole.log = console.log;
    this.originalConsole.error = console.error;
    this.originalConsole.warn = console.warn;
    this.originalConsole.info = console.info;
    this.originalConsole.debug = console.debug;
    
    // Override console methods
    console.log = (...args: any[]) => {
      this.originalConsole.log.apply(console, args);
      this.sendLog('info', this.formatArgs(args));
    };
    
    console.error = (...args: any[]) => {
      this.originalConsole.error.apply(console, args);
      this.sendLog('error', this.formatArgs(args), this.getStackTrace());
    };
    
    console.warn = (...args: any[]) => {
      this.originalConsole.warn.apply(console, args);
      this.sendLog('warn', this.formatArgs(args));
    };
    
    console.info = (...args: any[]) => {
      this.originalConsole.info.apply(console, args);
      this.sendLog('info', this.formatArgs(args));
    };
    
    console.debug = (...args: any[]) => {
      this.originalConsole.debug.apply(console, args);
      this.sendLog('debug', this.formatArgs(args));
    };
  }

  private setupErrorHandlers(): void {
    // Capture uncaught errors
    window.addEventListener('error', (event) => {
      this.sendLog('error', event.message, {
        url: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error ? event.error.stack : ''
      });
    });
    
    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.sendLog('error', `Unhandled promise rejection: ${event.reason}`, {
        stack: event.reason && event.reason.stack ? event.reason.stack : ''
      });
    });
  }

  private formatArgs(args: any[]): string {
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return '[Circular/Complex Object]';
        }
      }
      return String(arg);
    }).join(' ');
  }

  private getStackTrace(): any {
    try {
      throw new Error();
    } catch (e: any) {
      return { stack: e.stack || '' };
    }
  }

  private sendLog(level: string, message: string, extra: any = {}): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      const logData: ConsoleLogData = {
        type: 'console_log',
        level,
        message,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        sessionId: this.sessionId,
        ...extra
      };
      
      try {
        this.websocket.send(JSON.stringify(logData));
      } catch (error) {
        this.originalConsole.error('[EDT] Failed to send log to WebSocket:', error);
      }
    }
  }

  // Public method to manually send logs
  public log(level: 'info' | 'warn' | 'error' | 'debug', message: string, extra?: any): void {
    this.sendLog(level, message, extra);
  }

  // Get session ID for debugging
  public getSessionId(): string {
    return this.sessionId;
  }

  // Check WebSocket connection status
  public isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }
}