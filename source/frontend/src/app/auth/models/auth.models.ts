export interface LoginRequest {
  email: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  partial_token: string;
  user_id: string;
  email: string;
  requires_mfa_setup: boolean;
}

export interface MfaSetupResponse {
  success: boolean;
  secret: string;
  qr_code_url: string;
  backup_codes: string[];
}

export interface MfaVerifyRequest {
  totp_code: string;
}

export interface MfaVerifyResponse {
  success: boolean;
  token: string;
}

export interface AuthState {
  token: string | null;
  partialToken: string | null;
  isAuthenticated: boolean;
  requiresMfaSetup: boolean;
}