import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthV2Service } from '../../auth/services/auth-v2.service';

export interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  last_login: string | null;
  mfa_enabled: boolean;
}

export interface AccountInfo {
  id: string;
  email: string;
  created_at: string;
  total_sessions: number;
  data_export_available: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly API_URL = '/v2/user';

  constructor(
    private http: HttpClient,
    private authService: AuthV2Service
  ) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getAccessToken();
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  getProfile(): Observable<ApiResponse<UserProfile>> {
    return this.http.get<ApiResponse<UserProfile>>(`${this.API_URL}/profile`, {
      headers: this.getHeaders()
    });
  }

  updateProfile(data: Partial<UserProfile>): Observable<ApiResponse<UserProfile>> {
    return this.http.post<ApiResponse<UserProfile>>(`${this.API_URL}/profile`, data, {
      headers: this.getHeaders()
    });
  }

  getAccountInfo(): Observable<ApiResponse<AccountInfo>> {
    return this.http.get<ApiResponse<AccountInfo>>(`${this.API_URL}/account`, {
      headers: this.getHeaders()
    });
  }

  deleteAccount(): Observable<ApiResponse<any>> {
    return this.http.delete<ApiResponse<any>>(`${this.API_URL}/account`, {
      headers: this.getHeaders()
    });
  }

  getSettings(): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.API_URL}/settings`, {
      headers: this.getHeaders()
    });
  }

  updateSettings(settings: any): Observable<ApiResponse<any>> {
    return this.http.post<ApiResponse<any>>(`${this.API_URL}/settings`, settings, {
      headers: this.getHeaders()
    });
  }
}