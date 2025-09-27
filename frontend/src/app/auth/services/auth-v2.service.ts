import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

// ================================
// INTERFACES
// ================================

export interface NextStep {
  action: string;
  endpoint: string;
  expires_in?: number;
}

export interface LoginRequest {
  email: string;
  method: 'email' | 'totp';
}

export interface LoginResponse {
  success: boolean;
  session_id?: string;
  auth_method: string;
  next_step: NextStep;
}

export interface RegisterRequest {
  email: string;
}

export interface RegisterResponse {
  success: boolean;
  partial_token: string;
  next_step: NextStep;
}

export interface MfaStatus {
  required: boolean;
  configured: boolean;
}

export interface PartialAuthResponse {
  success: boolean;
  partial_token: string;
  mfa_status: MfaStatus;
  next_step: NextStep;
  expires_in: number;
}

export interface MfaStatusResponse {
  success: boolean;
  configured: boolean;
  method?: string;
}

export interface MfaSetupResponse {
  success: boolean;
  secret: string;
  qr_code_url: string;
  backup_codes: string[];
}

export interface MfaSetupCompleteRequest {
  totp_code: string;
  backup_codes_saved: boolean;
}

export interface MfaVerifyRequest {
  totp_code: string;
}

export interface UserInfo {
  id: string;
  email: string;
  mfa_enabled: boolean;
}

export interface AuthResponse {
  success: boolean;
  access_token: string;
  refresh_token?: string;
  user: UserInfo;
  expires_in: number;
}

export interface AuthStateV2 {
  // Authentication state
  isAuthenticated: boolean;
  
  // Tokens
  accessToken: string | null;
  partialToken: string | null;
  refreshToken: string | null;
  
  // User info
  user: UserInfo | null;
  
  // MFA state
  mfaRequired: boolean;
  mfaConfigured: boolean;
  
  // Flow state
  currentStep: string | null; // 'login', 'mfa_setup', 'mfa_verify', 'authenticated'
  nextAction: string | null;
  nextEndpoint: string | null;
}

// ================================
// SERVICE
// ================================

@Injectable({
  providedIn: 'root'
})
export class AuthV2Service {
  private readonly API_URL = ''; // Use proxy for development
  private readonly V2_BASE = '/v2/auth';
  
  // Storage keys
  private readonly ACCESS_TOKEN_KEY = 'access_token_v2';
  private readonly PARTIAL_TOKEN_KEY = 'partial_token_v2';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token_v2';
  private readonly USER_KEY = 'user_v2';
  
  // State management
  private authStateSubject = new BehaviorSubject<AuthStateV2>({
    isAuthenticated: false,
    accessToken: null,
    partialToken: null,
    refreshToken: null,
    user: null,
    mfaRequired: false,
    mfaConfigured: false,
    currentStep: null,
    nextAction: null,
    nextEndpoint: null
  });
  
  public authState$ = this.authStateSubject.asObservable();
  
  // Getter for current auth state
  get currentAuthState(): AuthStateV2 {
    return this.authStateSubject.value;
  }
  
  constructor(private http: HttpClient) {
    // Initialize from localStorage
    this.initializeFromStorage();
  }
  
  private initializeFromStorage(): void {
    const accessToken = localStorage.getItem(this.ACCESS_TOKEN_KEY);
    const partialToken = localStorage.getItem(this.PARTIAL_TOKEN_KEY);
    const refreshToken = localStorage.getItem(this.REFRESH_TOKEN_KEY);
    const userStr = localStorage.getItem(this.USER_KEY);
    
    
    let user: UserInfo | null = null;
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch (e) {
        console.error('Failed to parse stored user data', e);
      }
    }
    
    const initialState = {
      isAuthenticated: !!accessToken && !!user,
      accessToken,
      partialToken,
      refreshToken,
      user,
      mfaRequired: !!partialToken,
      mfaConfigured: user?.mfa_enabled || false,
      currentStep: accessToken ? 'authenticated' : (partialToken ? (user?.mfa_enabled ? 'mfa_verify' : 'mfa_setup') : 'login'),
      nextAction: null,
      nextEndpoint: null
    };
    
    this.authStateSubject.next(initialState);
  }
  
  // ================================
  // AUTH FLOW METHODS
  // ================================
  
  /**
   * Unified login - handles both email and TOTP initial authentication
   */
  login(email: string, method: 'email' | 'totp' = 'totp'): Observable<PartialAuthResponse> {
    const request: LoginRequest = { email, method };
    
    return this.http.post<PartialAuthResponse>(`${this.API_URL}${this.V2_BASE}/login`, request).pipe(
      tap(response => {
        if (response.success) {
          // Store partial token
          localStorage.setItem(this.PARTIAL_TOKEN_KEY, response.partial_token);
          
          // Update state
          this.authStateSubject.next({
            ...this.authStateSubject.value,
            partialToken: response.partial_token,
            mfaRequired: response.mfa_status.required,
            mfaConfigured: response.mfa_status.configured,
            currentStep: response.mfa_status.configured ? 'mfa_verify' : 'mfa_setup',
            nextAction: response.next_step.action,
            nextEndpoint: response.next_step.endpoint
          });
        }
      })
    );
  }
  
  /**
   * Register a new user
   */
  register(email: string): Observable<RegisterResponse> {
    const request: RegisterRequest = { email };
    
    return this.http.post<RegisterResponse>(`${this.API_URL}${this.V2_BASE}/register`, request).pipe(
      tap(response => {
        if (response.success) {
          // Store partial token
          localStorage.setItem(this.PARTIAL_TOKEN_KEY, response.partial_token);
          
          // Update state
          this.authStateSubject.next({
            ...this.authStateSubject.value,
            partialToken: response.partial_token,
            mfaRequired: true,
            mfaConfigured: false,
            currentStep: 'mfa_setup',
            nextAction: response.next_step.action,
            nextEndpoint: response.next_step.endpoint
          });
        }
      })
    );
  }
  
  /**
   * Check MFA configuration status
   */
  checkMfaStatus(): Observable<MfaStatusResponse> {
    const headers = this.getPartialAuthHeaders();
    
    return this.http.get<MfaStatusResponse>(`${this.API_URL}${this.V2_BASE}/mfa/status`, { headers }).pipe(
      tap(response => {
        if (response.success) {
          // Update MFA configuration state
          this.authStateSubject.next({
            ...this.authStateSubject.value,
            mfaConfigured: response.configured,
            currentStep: response.configured ? 'mfa_verify' : 'mfa_setup'
          });
        }
      })
    );
  }
  
  /**
   * Initialize MFA setup - get QR code and backup codes
   */
  initMfaSetup(): Observable<MfaSetupResponse> {
    const headers = this.getPartialAuthHeaders();
    
    return this.http.post<MfaSetupResponse>(`${this.API_URL}${this.V2_BASE}/mfa/setup/init`, {}, { headers });
  }
  
  /**
   * Complete MFA setup with verification
   */
  completeMfaSetup(totpCode: string, backupCodesSaved: boolean = true): Observable<AuthResponse> {
    const headers = this.getPartialAuthHeaders();
    const request: MfaSetupCompleteRequest = { 
      totp_code: totpCode, 
      backup_codes_saved: backupCodesSaved 
    };
    
    return this.http.post<AuthResponse>(`${this.API_URL}${this.V2_BASE}/mfa/setup/complete`, request, { headers }).pipe(
      tap(response => {
        if (response.success) {
          this.handleFullAuthentication(response);
        }
      })
    );
  }
  
  /**
   * Verify MFA for existing users
   */
  verifyMfa(totpCode: string): Observable<AuthResponse> {
    const headers = this.getPartialAuthHeaders();
    const request: MfaVerifyRequest = { totp_code: totpCode };
    
    return this.http.post<AuthResponse>(`${this.API_URL}${this.V2_BASE}/mfa/verify`, request, { headers }).pipe(
      tap(response => {
        if (response.success) {
          this.handleFullAuthentication(response);
        }
      })
    );
  }
  
  // ================================
  // UTILITY METHODS
  // ================================
  
  private getPartialAuthHeaders(): HttpHeaders {
    const partialToken = this.authStateSubject.value.partialToken || localStorage.getItem(this.PARTIAL_TOKEN_KEY);
    
    if (!partialToken || partialToken === 'null' || partialToken === 'undefined') {
      throw new Error('No partial token available');
    }
    
    return new HttpHeaders({
      'X-Partial-Token': partialToken
    });
  }
  
  private getAuthHeaders(): HttpHeaders {
    const accessToken = this.authStateSubject.value.accessToken || localStorage.getItem(this.ACCESS_TOKEN_KEY);
    return new HttpHeaders({
      'Authorization': `Bearer ${accessToken}`
    });
  }
  
  private handleFullAuthentication(response: AuthResponse): void {
    // Store tokens and user info
    localStorage.setItem(this.ACCESS_TOKEN_KEY, response.access_token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));
    
    if (response.refresh_token) {
      localStorage.setItem(this.REFRESH_TOKEN_KEY, response.refresh_token);
    }
    
    // Clean up partial token
    localStorage.removeItem(this.PARTIAL_TOKEN_KEY);
    
    const newState = {
      isAuthenticated: true,
      accessToken: response.access_token,
      partialToken: null,
      refreshToken: response.refresh_token || null,
      user: response.user,
      mfaRequired: false,
      mfaConfigured: response.user.mfa_enabled,
      currentStep: 'authenticated',
      nextAction: null,
      nextEndpoint: null
    };
    
    // Update state
    this.authStateSubject.next(newState);
  }
  
  /**
   * Logout user and clear all authentication data
   */
  logout(): void {
    // Clear localStorage
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.PARTIAL_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    
    // Reset state
    this.authStateSubject.next({
      isAuthenticated: false,
      accessToken: null,
      partialToken: null,
      refreshToken: null,
      user: null,
      mfaRequired: false,
      mfaConfigured: false,
      currentStep: 'login',
      nextAction: null,
      nextEndpoint: null
    });
  }
  
  /**
   * Get current authentication state
   */
  getCurrentState(): AuthStateV2 {
    return this.authStateSubject.value;
  }
  
  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.authStateSubject.value.isAuthenticated;
  }
  
  /**
   * Check if user has partial authentication (needs MFA)
   */
  hasPartialAuth(): boolean {
    return !!this.authStateSubject.value.partialToken;
  }
  
  /**
   * Get current user info
   */
  getCurrentUser(): UserInfo | null {
    return this.authStateSubject.value.user;
  }
  
  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return this.authStateSubject.value.accessToken || localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }
  
  /**
   * Clear all authentication data
   */
  clearAuthData(): void {
    this.logout();
  }
}