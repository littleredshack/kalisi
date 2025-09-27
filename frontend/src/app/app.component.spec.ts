import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AppStateService } from './core/services/app-state.service';
import { AuthV2Service } from './auth/services/auth-v2.service';
import { WebSocketLoggerService } from './core/services/websocket-logger.service';
import { MatSnackBar } from '@angular/material/snack-bar';

describe('AppComponent', () => {
  let mockAppStateService: jasmine.SpyObj<AppStateService>;
  let mockAuthV2Service: jasmine.SpyObj<AuthV2Service>;
  let mockWebSocketLogger: jasmine.SpyObj<WebSocketLoggerService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(async () => {
    mockAppStateService = jasmine.createSpyObj('AppStateService', [
      'navigateToHome', 'navigateToLogin', 'navigateToRegister', 
      'navigateToMfaSetup', 'navigateToMfaVerify', 'navigateToViews',
      'navigateToSettingsProfile', 'navigateToSettingsSecurity', 
      'navigateToSettingsAccount', 'logout'
    ], {
      state$: of({ isAuthenticated: false, error: null }),
      currentState: { isAuthenticated: false }
    });

    mockAuthV2Service = jasmine.createSpyObj('AuthV2Service', ['logout'], {
      authState$: of({ isAuthenticated: false, user: null })
    });

    mockWebSocketLogger = jasmine.createSpyObj('WebSocketLoggerService', ['initialize']);
    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: AppStateService, useValue: mockAppStateService },
        { provide: AuthV2Service, useValue: mockAuthV2Service },
        { provide: WebSocketLoggerService, useValue: mockWebSocketLogger },
        { provide: MatSnackBar, useValue: mockSnackBar }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should initialize with correct dependencies', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    
    expect(app.appState$).toBeDefined();
    expect(app.AppViewState).toBeDefined();
  });

  it('should handle navigation methods', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    
    app.onNavigateToLogin();
    expect(mockAppStateService.navigateToLogin).toHaveBeenCalled();
    
    app.onNavigateToRegister();
    expect(mockAppStateService.navigateToRegister).toHaveBeenCalled();
    
    app.onLogout();
    expect(mockAuthV2Service.logout).toHaveBeenCalled();
    expect(mockAppStateService.logout).toHaveBeenCalled();
  });
});
