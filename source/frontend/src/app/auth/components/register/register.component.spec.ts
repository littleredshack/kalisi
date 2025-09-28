import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RegisterComponent } from './register.component';
import { AuthV2Service } from '../../services/auth-v2.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authService: jasmine.SpyObj<AuthV2Service>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthV2Service', ['register', 'clearAuthData']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ 
        RegisterComponent,
        ReactiveFormsModule,
        NoopAnimationsModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule
      ],
      providers: [
        { provide: AuthV2Service, useValue: authServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    })
    .compileComponents();

    authService = TestBed.inject(AuthV2Service) as jasmine.SpyObj<AuthV2Service>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should clear auth data on init', () => {
    expect(authService.clearAuthData).toHaveBeenCalled();
  });

  it('should validate email field', () => {
    const emailControl = component.registerForm.get('email');
    
    // Test required validation
    emailControl?.setValue('');
    expect(emailControl?.hasError('required')).toBeTruthy();
    
    // Test email validation
    emailControl?.setValue('invalid-email');
    expect(emailControl?.hasError('email')).toBeTruthy();
    
    // Test valid email
    emailControl?.setValue('test@example.com');
    expect(emailControl?.valid).toBeTruthy();
  });

  it('should handle successful registration', async () => {
    const mockResponse = {
      success: true,
      partial_token: 'test-token',
      next_step: {
        action: 'setup_mfa',
        endpoint: '/v2/auth/mfa/setup/init',
        expires_in: 600
      }
    };
    
    authService.register.and.returnValue(of(mockResponse));
    spyOn(localStorage, 'setItem');
    
    component.registerForm.setValue({ email: 'test@example.com' });
    await component.onSubmit();
    
    expect(authService.register).toHaveBeenCalledWith('test@example.com');
    expect(localStorage.setItem).toHaveBeenCalledWith('partial_token', 'test-token');
    expect(router.navigate).toHaveBeenCalledWith(['/auth/mfa-setup']);
  });

  it('should handle existing user error', async () => {
    authService.register.and.returnValue(throwError({ status: 409 }));
    
    component.registerForm.setValue({ email: 'test@example.com' });
    await component.onSubmit();
    
    expect(component.error).toBe('User already exists. Please login instead.');
  });

  it('should handle unauthorized email error', async () => {
    authService.register.and.returnValue(throwError({ status: 403 }));
    
    component.registerForm.setValue({ email: 'test@example.com' });
    await component.onSubmit();
    
    expect(component.error).toBe('Email not authorized for this system.');
  });

  it('should navigate to login page', () => {
    component.navigateToLogin();
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
  });
});