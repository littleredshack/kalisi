import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { 
  LoginRequest, 
  LoginResponse, 
  MfaSetupResponse, 
  MfaVerifyRequest, 
  MfaVerifyResponse,
  AuthState 
} from '../models/auth.models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = ''; // Use proxy for development
  private readonly TOKEN_KEY = 'jwt_token';
  private readonly PARTIAL_TOKEN_KEY = 'partial_token';
  
  private authState = new BehaviorSubject<AuthState>({
    token: null,
    partialToken: null,
    isAuthenticated: false,
    requiresMfaSetup: false
  });
  
  public authState$ = this.authState.asObservable();

  constructor(private http: HttpClient) {
    this.checkStoredToken();
  }

  private checkStoredToken(): void {
    const token = localStorage.getItem(this.TOKEN_KEY);
    if (token) {
      this.authState.next({
        token,
        partialToken: null,
        isAuthenticated: true,
        requiresMfaSetup: false
      });
    }
  }

  login(email: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.API_URL}/auth/direct-login`, { email })
      .pipe(
        tap(response => {
          this.authState.next({
            token: null,
            partialToken: response.partial_token,
            isAuthenticated: false,
            requiresMfaSetup: true
          });
          localStorage.setItem(this.PARTIAL_TOKEN_KEY, response.partial_token);
        })
      );
  }

  getMfaSetup(): Observable<MfaSetupResponse> {
    const partialToken = this.authState.value.partialToken || localStorage.getItem(this.PARTIAL_TOKEN_KEY);
    const headers = new HttpHeaders({
      'Authorization': `Partial ${partialToken}`
    });
    
    return this.http.post<MfaSetupResponse>(`${this.API_URL}/auth/mfa/setup`, {}, { headers });
  }

  verifyMfa(totpCode: string): Observable<MfaVerifyResponse> {
    const partialToken = this.authState.value.partialToken || localStorage.getItem(this.PARTIAL_TOKEN_KEY);
    const headers = new HttpHeaders({
      'Authorization': `Partial ${partialToken}`
    });
    
    return this.http.post<MfaVerifyResponse>(
      `${this.API_URL}/auth/mfa/verify`, 
      { code: totpCode },
      { headers }
    ).pipe(
      tap(response => {
        localStorage.setItem(this.TOKEN_KEY, response.token);
        localStorage.removeItem(this.PARTIAL_TOKEN_KEY);
        this.authState.next({
          token: response.token,
          partialToken: null,
          isAuthenticated: true,
          requiresMfaSetup: false
        });
      })
    );
  }

  enableMfa(totpCode: string): Observable<any> {
    const partialToken = this.authState.value.partialToken || localStorage.getItem(this.PARTIAL_TOKEN_KEY);
    const headers = new HttpHeaders({
      'Authorization': `Partial ${partialToken}`
    });
    
    return this.http.post(`${this.API_URL}/auth/mfa/enable`, { 
      code: totpCode,
      backup_acknowledged: true 
    }, { headers }).pipe(
      tap((response: any) => {
        if (response.token) {
          localStorage.setItem(this.TOKEN_KEY, response.token);
          localStorage.removeItem(this.PARTIAL_TOKEN_KEY);
          this.authState.next({
            token: response.token,
            partialToken: null,
            isAuthenticated: true,
            requiresMfaSetup: false
          });
        }
      })
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.PARTIAL_TOKEN_KEY);
    this.authState.next({
      token: null,
      partialToken: null,
      isAuthenticated: false,
      requiresMfaSetup: false
    });
  }

  getToken(): string | null {
    return this.authState.value.token || localStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return this.authState.value.isAuthenticated;
  }
}
