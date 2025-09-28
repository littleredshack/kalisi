import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';

import { AppStateService, AppViewState, AppState } from './core/services/app-state.service';
import { AuthV2Service } from './auth/services/auth-v2.service';
import { WebSocketLoggerService } from './core/services/websocket-logger.service';

// Import all components
import { LoginComponent } from './auth/components/login/login.component';
import { RegisterComponent } from './auth/components/register/register.component';
import { MfaSetupComponent } from './auth/components/mfa-setup/mfa-setup.component';
import { MfaVerifyComponent } from './auth/components/mfa-verify/mfa-verify.component';
import { SettingsComponent } from './settings/settings.component';
import { ViewsShellComponent } from './views/components/views-shell/views-shell.component';
import { LandingShellComponent } from './landing-shell.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    LoginComponent,
    RegisterComponent,
    MfaSetupComponent,
    MfaVerifyComponent,
    SettingsComponent,
    ViewsShellComponent,
    LandingShellComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  appState$ = this.appStateService.state$;
  AppViewState = AppViewState; // Make enum available in template
  
  constructor(
    private appStateService: AppStateService,
    private authV2Service: AuthV2Service,
    private snackBar: MatSnackBar,
    private webSocketLogger: WebSocketLoggerService
  ) {
    // WebSocket logger service will initialize automatically in constructor
    console.log('[OPEN EDT Angular] Application starting with WebSocket logging enabled');
  }
  
  ngOnInit() {
    // Subscribe to app state changes for error handling
    this.appState$.subscribe(state => {
      if (state.error) {
        this.snackBar.open(state.error, 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
      }
    });
    
    // Subscribe to auth state changes to sync with app state
    this.authV2Service.authState$.subscribe(authState => {
      if (authState.isAuthenticated && !this.appStateService.currentState.isAuthenticated) {
        // User became authenticated, navigate to home
        this.appStateService.navigateToHome(authState.user);
      } else if (!authState.isAuthenticated && this.appStateService.currentState.isAuthenticated) {
        // User lost authentication, navigate to login
        this.appStateService.navigateToLogin();
      }
    });
  }
  
  // Event handlers for child components
  onNavigateToRegister() {
    this.appStateService.navigateToRegister();
  }
  
  onNavigateToLogin() {
    this.appStateService.navigateToLogin();
  }
  
  onNavigateToMfaSetup() {
    this.appStateService.navigateToMfaSetup();
  }
  
  onNavigateToMfaVerify() {
    this.appStateService.navigateToMfaVerify();
  }
  
  onNavigateToHome() {
    this.appStateService.navigateToHome();
  }

  onNavigateToViews() {
    this.appStateService.navigateToViews();
  }
  
  onNavigateToSettings(tab: 'profile' | 'security' | 'account') {
    switch (tab) {
      case 'profile':
        this.appStateService.navigateToSettingsProfile();
        break;
      case 'security':
        this.appStateService.navigateToSettingsSecurity();
        break;
      case 'account':
        this.appStateService.navigateToSettingsAccount();
        break;
    }
  }
  
  onLogout() {
    // Reset renderer state before logout to ensure clean initialization on next login
    if ((window as any).resetRenderer) {
      (window as any).resetRenderer();
    }
    this.authV2Service.logout();
    this.appStateService.logout();
  }
}
