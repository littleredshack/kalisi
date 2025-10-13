import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export enum AppViewState {
  LOGIN = 'login',
  REGISTER = 'register',
  MFA_SETUP = 'mfa_setup',
  MFA_VERIFY = 'mfa_verify',
  HOME = 'home',
  SETTINGS_PROFILE = 'settings_profile',
  SETTINGS_SECURITY = 'settings_security',
  SETTINGS_ACCOUNT = 'settings_account'
}

export interface AppState {
  currentView: AppViewState;
  isAuthenticated: boolean;
  hasPartialAuth: boolean;
  user: any | null;
  loading: boolean;
  error: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AppStateService {
  private readonly initialState: AppState = {
    currentView: AppViewState.LOGIN,
    isAuthenticated: false,
    hasPartialAuth: false,
    user: null,
    loading: false,
    error: null
  };

  private stateSubject = new BehaviorSubject<AppState>(this.initialState);
  public state$ = this.stateSubject.asObservable();

  constructor() {
    // Initialize state based on existing auth
    this.initializeFromStorage();
  }

  get currentState(): AppState {
    return this.stateSubject.value;
  }

  // View Navigation Methods
  navigateToLogin(error?: string): void {
    this.updateState({
      currentView: AppViewState.LOGIN,
      isAuthenticated: false,
      hasPartialAuth: false,
      user: null,
      error: error || null,
      loading: false
    });
  }

  navigateToRegister(): void {
    this.updateState({
      currentView: AppViewState.REGISTER,
      error: null
    });
  }

  navigateToMfaSetup(): void {
    this.updateState({
      currentView: AppViewState.MFA_SETUP,
      hasPartialAuth: true,
      error: null
    });
  }

  navigateToMfaVerify(): void {
    this.updateState({
      currentView: AppViewState.MFA_VERIFY,
      hasPartialAuth: true,
      error: null
    });
  }

  navigateToHome(user?: any): void {
    this.updateState({
      currentView: AppViewState.HOME,
      isAuthenticated: true,
      hasPartialAuth: false,
      user: user || this.currentState.user,
      error: null
    });
  }

  navigateToSettingsProfile(): void {
    if (!this.currentState.isAuthenticated) {
      this.navigateToLogin('Please login to access settings');
      return;
    }
    this.updateState({
      currentView: AppViewState.SETTINGS_PROFILE,
      error: null
    });
  }

  navigateToSettingsSecurity(): void {
    if (!this.currentState.isAuthenticated) {
      this.navigateToLogin('Please login to access settings');
      return;
    }
    this.updateState({
      currentView: AppViewState.SETTINGS_SECURITY,
      error: null
    });
  }

  navigateToSettingsAccount(): void {
    if (!this.currentState.isAuthenticated) {
      this.navigateToLogin('Please login to access settings');
      return;
    }
    this.updateState({
      currentView: AppViewState.SETTINGS_ACCOUNT,
      error: null
    });
  }

  // State Management Methods
  setLoading(loading: boolean): void {
    this.updateState({ loading });
  }

  setError(error: string | null): void {
    this.updateState({ error });
  }

  setUser(user: any): void {
    this.updateState({ user });
  }

  logout(): void {
    // Clear all storage
    localStorage.removeItem('access_token');
    localStorage.removeItem('partial_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    
    this.navigateToLogin();
  }

  // Private Methods
  private updateState(partialState: Partial<AppState>): void {
    const newState = { ...this.currentState, ...partialState };
    this.stateSubject.next(newState);
  }

  private initializeFromStorage(): void {
    const accessToken = localStorage.getItem('access_token');
    const partialToken = localStorage.getItem('partial_token');
    const userStr = localStorage.getItem('user');
    
    let user = null;
    if (userStr) {
      try {
        user = JSON.parse(userStr);
      } catch (e) {
        console.warn('Failed to parse user from localStorage');
      }
    }

    if (accessToken && user) {
      // User is fully authenticated
      this.updateState({
        currentView: AppViewState.HOME,
        isAuthenticated: true,
        hasPartialAuth: false,
        user: user
      });
    } else if (partialToken) {
      // User has partial auth - determine MFA setup vs verify based on user state
      // If user exists and has MFA enabled, go to verify; otherwise setup
      const needsSetup = !user || !user.mfa_enabled;
      this.updateState({
        currentView: needsSetup ? AppViewState.MFA_SETUP : AppViewState.MFA_VERIFY,
        isAuthenticated: false,
        hasPartialAuth: true
      });
    } else {
      // User needs to login
      this.updateState({
        currentView: AppViewState.LOGIN,
        isAuthenticated: false,
        hasPartialAuth: false
      });
    }
  }

  // Helper Methods
  isCurrentView(view: AppViewState): boolean {
    return this.currentState.currentView === view;
  }

  isSettingsView(): boolean {
    return this.currentState.currentView.startsWith('settings_');
  }

  isAuthenticatedView(): boolean {
    return this.currentState.isAuthenticated && 
           [AppViewState.HOME, AppViewState.SETTINGS_PROFILE, 
            AppViewState.SETTINGS_SECURITY, AppViewState.SETTINGS_ACCOUNT]
           .includes(this.currentState.currentView);
  }
}
