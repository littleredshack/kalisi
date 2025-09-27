import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpClient } from '@angular/common/http';
import { Subject, timer, of } from 'rxjs';
import { takeUntil, switchMap, catchError } from 'rxjs/operators';

interface LogEntry {
  id: string;
  timestamp: Date;
  level: string;
  category: string;
  message: string;
  service: string;
  user_id?: string;
  ip_address?: string;
  data?: any;
}

interface LogMetrics {
  total_logs: number;
  errors_today: number;
  warnings_today: number;
  active_sessions: number;
  auth_attempts: number;
  api_calls: number;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  // Data
  logs: LogEntry[] = [];
  metrics: LogMetrics = {
    total_logs: 0,
    errors_today: 0,
    warnings_today: 0,
    active_sessions: 0,
    auth_attempts: 0,
    api_calls: 0
  };
  
  // UI State - No more loading spinner!
  initialLoad = true;
  error: string | null = null;
  
  // Filters
  searchText = '';
  selectedCategory = 'all';
  selectedLevel = 'all';
  startDate: Date | null = null;
  endDate: Date | null = null;
  
  // Table columns
  displayedColumns: string[] = ['timestamp', 'level', 'category', 'message', 'user', 'actions'];
  
  // Filter options
  categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'AUTH', label: 'Authentication' },
    { value: 'API', label: 'API Requests' },
    { value: 'CHAT', label: 'Chat Messages' },
    { value: 'WEBSOCKET', label: 'WebSocket' },
    { value: 'ERROR', label: 'Errors' },
    { value: 'SYSTEM', label: 'System' }
  ];
  
  levels = [
    { value: 'all', label: 'All Levels' },
    { value: 'debug', label: 'Debug' },
    { value: 'info', label: 'Info' },
    { value: 'warn', label: 'Warning' },
    { value: 'error', label: 'Error' },
    { value: 'critical', label: 'Critical' }
  ];
  
  constructor(private http: HttpClient) {}
  
  ngOnInit(): void {
    // Initial load
    this.loadLogs();
    this.loadMetrics();
    
    // Set up background refresh WITHOUT spinner - just update data silently
    timer(30000, 30000) // Every 30 seconds, not 5!
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => {
          // Silently refresh data in background
          return this.fetchLogs().pipe(
            catchError(() => of(null)) // Ignore errors on background refresh
          );
        })
      )
      .subscribe(response => {
        if (response) {
          this.logs = response.logs.map((log: any) => ({
            ...log,
            timestamp: new Date(log.timestamp)
          }));
        }
      });
    
    // Separate timer for metrics
    timer(30000, 30000)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.fetchMetrics().pipe(
          catchError(() => of(null))
        ))
      )
      .subscribe(metrics => {
        if (metrics) {
          this.metrics = {
            total_logs: metrics.total_logs || 0,
            errors_today: metrics.errors_today || 0,
            warnings_today: metrics.warnings_today || 0,
            active_sessions: metrics.active_sessions || 0,
            auth_attempts: metrics.auth_attempts || 0,
            api_calls: metrics.api_calls || 0
          };
        }
      });
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  loadLogs(): void {
    this.error = null;
    
    const params: any = {
      limit: 100
    };
    
    if (this.selectedCategory !== 'all') {
      params.category = this.selectedCategory;
    }
    
    if (this.selectedLevel !== 'all') {
      params.level = this.selectedLevel;
    }
    
    if (this.searchText) {
      params.search = this.searchText;
    }
    
    if (this.startDate) {
      params.start_date = this.startDate.toISOString();
    }
    
    if (this.endDate) {
      params.end_date = this.endDate.toISOString();
    }
    
    this.fetchLogs(params).subscribe({
      next: (response) => {
        this.logs = response.logs.map((log: any) => ({
          ...log,
          timestamp: new Date(log.timestamp)
        }));
        this.initialLoad = false;
      },
      error: (err) => {
        this.error = 'Failed to load logs. Check if services are running.';
        this.initialLoad = false;
        console.error('Error loading logs:', err);
      }
    });
  }
  
  private fetchLogs(params?: any) {
    return this.http.get<any>('/api/logs', { params: params || {} });
  }
  
  loadMetrics(): void {
    this.fetchMetrics().subscribe({
      next: (metrics) => {
        this.metrics = {
          total_logs: metrics.total_logs || 0,
          errors_today: metrics.errors_today || 0,
          warnings_today: metrics.warnings_today || 0,
          active_sessions: metrics.active_sessions || 0,
          auth_attempts: metrics.auth_attempts || 0,
          api_calls: metrics.api_calls || 0
        };
      },
      error: (err) => {
        console.error('Error loading metrics:', err);
      }
    });
  }
  
  private fetchMetrics() {
    return this.http.get<any>('/api/logs/stats');
  }
  
  applyFilters(): void {
    this.loadLogs();
  }
  
  clearFilters(): void {
    this.searchText = '';
    this.selectedCategory = 'all';
    this.selectedLevel = 'all';
    this.startDate = null;
    this.endDate = null;
    this.loadLogs();
  }
  
  viewLogDetails(log: LogEntry): void {
    // Could open a dialog with full log details
    console.log('View log details:', log);
  }
  
  exportLogs(): void {
    const dataStr = JSON.stringify(this.logs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `logs-${new Date().toISOString()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }
  
  clearOldLogs(): void {
    if (confirm('Are you sure you want to clear old logs? This action cannot be undone.')) {
      this.http.post('/api/logs/clear', {})
        .subscribe({
          next: () => {
            this.loadLogs();
            this.loadMetrics();
          },
          error: (err) => {
            this.error = 'Failed to clear logs';
            console.error('Error clearing logs:', err);
          }
        });
    }
  }
  
  getLevelColor(level: string): string {
    switch(level.toLowerCase()) {
      case 'debug': return 'accent';
      case 'info': return 'primary';
      case 'warn': return 'warn';
      case 'error': return 'warn';
      case 'critical': return 'warn';
      default: return '';
    }
  }
  
  getLevelIcon(level: string): string {
    switch(level.toLowerCase()) {
      case 'debug': return 'bug_report';
      case 'info': return 'info';
      case 'warn': return 'warning';
      case 'error': return 'error';
      case 'critical': return 'report';
      default: return 'info';
    }
  }
  
  getCategoryIcon(category: string): string {
    switch(category.toUpperCase()) {
      case 'AUTH': return 'lock';
      case 'API': return 'api';
      case 'CHAT': return 'chat';
      case 'WEBSOCKET': return 'cable';
      case 'ERROR': return 'error_outline';
      case 'SYSTEM': return 'settings_suggest';
      default: return 'category';
    }
  }
}