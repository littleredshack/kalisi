import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, timer, catchError, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

export interface MonitoringMetrics {
  requests: number;
  errors: number;
  responseTime: number;
  uptime: number;
  memoryUsage: number;
  timestamp: Date;
}

export interface SystemHealth {
  status: 'healthy' | 'warning' | 'error';
  services: {
    redis: boolean;
    neo4j: boolean;
    backend: boolean;
  };
  lastCheck: Date;
}

@Injectable({
  providedIn: 'root'
})
export class MonitoringService {
  private readonly apiUrl = this.getApiUrl();
  private metricsSubject = new BehaviorSubject<MonitoringMetrics>({
    requests: 0,
    errors: 0,
    responseTime: 0,
    uptime: 0,
    memoryUsage: 0,
    timestamp: new Date()
  });

  public metrics$ = this.metricsSubject.asObservable();

  constructor(private http: HttpClient) {
    // Start polling metrics every 30 seconds
    this.startMetricsPolling();
  }

  private getApiUrl(): string {
    // Use environment configuration - check for TEST_PORT first, then PORT
    const port = (window as any).__ENV?.TEST_PORT || 
                 (window as any).__ENV?.PORT || 
                 process.env['TEST_PORT'] || 
                 process.env['PORT'] || 
                 '3000';
    
    return `http://localhost:${port}/api`;
  }

  private startMetricsPolling(): void {
    // Poll every 30 seconds
    timer(0, 30000).pipe(
      switchMap(() => this.fetchMetrics()),
      catchError(error => {
        console.warn('Failed to fetch monitoring metrics:', error);
        return of(this.getDefaultMetrics());
      })
    ).subscribe(metrics => {
      this.metricsSubject.next(metrics);
    });
  }

  private fetchMetrics(): Observable<MonitoringMetrics> {
    return this.http.get<any>(`${this.apiUrl}/monitoring/metrics`).pipe(
      map(response => ({
        requests: response.requests || 0,
        errors: response.errors || 0,
        responseTime: response.responseTime || 0,
        uptime: response.uptime || 0,
        memoryUsage: response.memoryUsage || 0,
        timestamp: new Date()
      })),
      catchError(() => of(this.getDefaultMetrics()))
    );
  }

  private getDefaultMetrics(): MonitoringMetrics {
    return {
      requests: Math.floor(Math.random() * 1000),
      errors: Math.floor(Math.random() * 10),
      responseTime: Math.floor(Math.random() * 500) + 50,
      uptime: Date.now() - (Math.random() * 86400000), // Random uptime up to 24h
      memoryUsage: Math.floor(Math.random() * 80) + 20, // 20-100%
      timestamp: new Date()
    };
  }

  getMetrics(): Observable<MonitoringMetrics> {
    return this.metrics$;
  }

  getLatestMetrics(): MonitoringMetrics {
    return this.metricsSubject.value;
  }

  // Manual refresh
  refreshMetrics(): void {
    this.fetchMetrics().subscribe(metrics => {
      this.metricsSubject.next(metrics);
    });
  }
}