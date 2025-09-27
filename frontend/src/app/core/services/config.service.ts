import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface AppConfig {
  ai_assistant_name: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private configSubject = new BehaviorSubject<AppConfig>({ ai_assistant_name: 'AI Assistant' });
  public config$ = this.configSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadConfig();
  }

  private loadConfig(): void {
    this.http.get<AppConfig>('/api/config').pipe(
      tap(config => this.configSubject.next(config))
    ).subscribe({
      error: (err) => {
        console.warn('Failed to load config, using defaults:', err);
        // Keep the default values
      }
    });
  }

  getConfig(): Observable<AppConfig> {
    return this.config$;
  }

  getAiAssistantName(): string {
    return this.configSubject.value.ai_assistant_name;
  }
}