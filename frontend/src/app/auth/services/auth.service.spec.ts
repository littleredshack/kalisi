import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { LoginResponse, MfaSetupResponse, MfaVerifyResponse } from '../models/auth.models';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  const apiUrl = ''; // Use proxy for development (same as service)

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuthService]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('login', () => {
    it('should send login request to correct endpoint', () => {
      const email = 'test@example.com';
      const mockResponse: LoginResponse = {
        success: true,
        partial_token: 'mock-partial-token',
        message: 'MFA setup required',
        user_id: 'test-user-id',
        email: email,
        requires_mfa_setup: true
      };

      service.login(email).subscribe(response => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiUrl}/auth/direct-login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email });
      req.flush(mockResponse);
    });

    it('should update auth state on successful login', () => {
      const email = 'test@example.com';
      const mockResponse: LoginResponse = {
        success: true,
        partial_token: 'mock-partial-token',
        message: 'MFA setup required',
        user_id: 'test-user-id',
        email: email,
        requires_mfa_setup: true
      };

      service.login(email).subscribe();

      const req = httpMock.expectOne(`${apiUrl}/auth/direct-login`);
      req.flush(mockResponse);

      service.authState$.subscribe(state => {
        expect(state.partialToken).toBe('mock-partial-token');
        expect(state.requiresMfaSetup).toBe(true);
        expect(state.isAuthenticated).toBe(false);
      });
    });
  });

  describe('getMfaSetup', () => {
    it('should send MFA setup request with partial token', () => {
      const partialToken = 'mock-partial-token';
      localStorage.setItem('partial_token', partialToken);
      
      const mockResponse: MfaSetupResponse = {
        success: true,
        qr_code_url: 'mock-qr-code',
        secret: 'mock-secret',
        backup_codes: ['code1', 'code2']
      };

      service.getMfaSetup().subscribe(response => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiUrl}/auth/mfa/setup`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe(`Partial ${partialToken}`);
      req.flush(mockResponse);
    });
  });

  describe('verifyMfa', () => {
    it('should send MFA verification request', () => {
      const partialToken = 'mock-partial-token';
      const totpCode = '123456';
      localStorage.setItem('partial_token', partialToken);
      
      const mockResponse: MfaVerifyResponse = {
        success: true,
        token: 'mock-jwt-token'
      };

      service.verifyMfa(totpCode).subscribe(response => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiUrl}/auth/mfa/verify`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe(`Partial ${partialToken}`);
      expect(req.request.body).toEqual({ code: totpCode });
      req.flush(mockResponse);
    });

    it('should update auth state on successful verification', () => {
      const partialToken = 'mock-partial-token';
      const totpCode = '123456';
      localStorage.setItem('partial_token', partialToken);
      
      const mockResponse: MfaVerifyResponse = {
        success: true,
        token: 'mock-jwt-token'
      };

      service.verifyMfa(totpCode).subscribe();

      const req = httpMock.expectOne(`${apiUrl}/auth/mfa/verify`);
      req.flush(mockResponse);

      service.authState$.subscribe(state => {
        expect(state.token).toBe('mock-jwt-token');
        expect(state.isAuthenticated).toBe(true);
        expect(state.partialToken).toBe(null);
        expect(state.requiresMfaSetup).toBe(false);
      });
      
      expect(localStorage.getItem('jwt_token')).toBe('mock-jwt-token');
      expect(localStorage.getItem('partial_token')).toBe(null);
    });
  });

  describe('enableMfa', () => {
    it('should send MFA enable request', () => {
      const partialToken = 'mock-partial-token';
      const totpCode = '123456';
      localStorage.setItem('partial_token', partialToken);
      
      const mockResponse = {
        success: true,
        token: 'mock-jwt-token',
        message: 'MFA enabled successfully'
      };

      service.enableMfa(totpCode).subscribe(response => {
        expect(response).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${apiUrl}/auth/mfa/enable`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Authorization')).toBe(`Partial ${partialToken}`);
      expect(req.request.body).toEqual({ 
        code: totpCode,
        backup_acknowledged: true 
      });
      req.flush(mockResponse);
    });
  });

  describe('logout', () => {
    it('should clear auth state and localStorage', () => {
      localStorage.setItem('jwt_token', 'mock-token');
      localStorage.setItem('partial_token', 'mock-partial');
      
      service.logout();
      
      service.authState$.subscribe(state => {
        expect(state.token).toBe(null);
        expect(state.partialToken).toBe(null);
        expect(state.isAuthenticated).toBe(false);
        expect(state.requiresMfaSetup).toBe(false);
      });
      
      expect(localStorage.getItem('jwt_token')).toBe(null);
      expect(localStorage.getItem('partial_token')).toBe(null);
    });
  });

  describe('token management', () => {
    it('should get token from state or localStorage', () => {
      const token = 'mock-jwt-token';
      localStorage.setItem('jwt_token', token);
      
      expect(service.getToken()).toBe(token);
    });

    it('should check authentication status', () => {
      expect(service.isAuthenticated()).toBe(false);
      
      // Simulate authenticated state
      localStorage.setItem('jwt_token', 'mock-token');
      service['checkStoredToken']();
      
      expect(service.isAuthenticated()).toBe(true);
    });
  });
});
