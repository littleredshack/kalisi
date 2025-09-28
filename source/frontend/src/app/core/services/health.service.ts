import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, timer, catchError, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

export interface HealthStatus {
  status: 'healthy' | 'warning' | 'error';
  services: {
    redis: boolean;
    neo4j: boolean;
    backend: boolean;
  };
  details: {
    redis: {
      connected: boolean;
      latency?: number;
      error?: string;
    };
    neo4j: {
      connected: boolean;
      latency?: number;
      error?: string;
    };
    backend: {
      status: string;
      version?: string;
      error?: string;
    };
  };
  lastCheck: Date;
}

@Injectable({
  providedIn: 'root'
})
export class HealthService {
  private readonly apiUrl = this.getApiUrl();
  private healthSubject = new BehaviorSubject<HealthStatus>({
    status: 'healthy',
    services: {
      redis: true,
      neo4j: true,
      backend: true
    },
    details: {
      redis: { connected: true },
      neo4j: { connected: true },
      backend: { status: 'ok' }
    },
    lastCheck: new Date()
  });

  public health$ = this.healthSubject.asObservable();

  constructor(private http: HttpClient) {
    // Start health checks every 60 seconds
    this.startHealthChecks();
  }

  private getApiUrl(): string {
    // Use environment configuration - prioritize localhost for testing
    const port = (window as any).__ENV?.TEST_PORT || 
                 (window as any).__ENV?.PORT || 
                 process.env['TEST_PORT'] || 
                 process.env['PORT'] || 
                 '3000';
    
    return `http://localhost:${port}/api`;
  }

  private startHealthChecks(): void {
    // Check health every 60 seconds
    timer(0, 60000).pipe(
      switchMap(() => this.performHealthCheck()),
      catchError(error => {
        console.warn('Health check failed:', error);
        return of(this.getUnhealthyStatus(error));
      })
    ).subscribe(health => {
      this.healthSubject.next(health);
    });
  }

  private performHealthCheck(): Observable<HealthStatus> {
    return this.http.get<any>(`${this.apiUrl}/health`).pipe(
      map(response => this.parseHealthResponse(response)),
      catchError(error => of(this.getUnhealthyStatus(error)))
    );
  }

  private parseHealthResponse(response: any): HealthStatus {
    const services = {
      redis: response.redis?.status === 'ok' || response.redis === true,
      neo4j: response.neo4j?.status === 'ok' || response.neo4j === true,
      backend: response.status === 'ok' || response.status === 'healthy'
    };

    const allHealthy = Object.values(services).every(s => s);
    const status = allHealthy ? 'healthy' : 
                   Object.values(services).some(s => s) ? 'warning' : 'error';

    return {
      status,
      services,
      details: {
        redis: {
          connected: services.redis,
          latency: response.redis?.latency,
          error: services.redis ? undefined : 'Connection failed'
        },
        neo4j: {
          connected: services.neo4j,
          latency: response.neo4j?.latency,
          error: services.neo4j ? undefined : 'Connection failed'
        },
        backend: {
          status: response.status || 'unknown',
          version: response.version,
          error: services.backend ? undefined : 'Service unavailable'
        }
      },
      lastCheck: new Date()
    };
  }

  private getUnhealthyStatus(error: any): HealthStatus {
    return {
      status: 'error',
      services: {
        redis: false,
        neo4j: false,
        backend: false
      },
      details: {
        redis: {
          connected: false,
          error: 'Health check failed'
        },
        neo4j: {
          connected: false,
          error: 'Health check failed'
        },
        backend: {
          status: 'error',
          error: error.message || 'Health check failed'
        }
      },
      lastCheck: new Date()
    };
  }

  checkHealth(): Observable<HealthStatus> {
    return this.health$;
  }

  getLatestHealth(): HealthStatus {
    return this.healthSubject.value;
  }

  // Manual health check
  refreshHealth(): void {
    this.performHealthCheck().subscribe(health => {
      this.healthSubject.next(health);
    });
  }

  // Check specific service
  checkService(service: 'redis' | 'neo4j' | 'backend'): Observable<boolean> {
    return this.health$.pipe(
      map(health => health.services[service])
    );
  }
}