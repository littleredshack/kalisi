// Authentication related models

export interface LoginRequest {
  email: string;
}

export interface LoginResponse {
  token: string;
  requires_mfa: boolean;
  mfa_secret?: string;
}

export interface MfaSetupRequest {
  token: string;
  otp_code: string;
}

export interface MfaSetupResponse {
  token: string;
  backup_codes: string[];
}

export interface User {
  email: string;
  id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  partialToken: string | null;
  requiresMfa: boolean;
}

export interface JwtPayload {
  sub: string;
  email: string;
  exp: number;
  iat: number;
}

export interface ApiError {
  error: string;
  status?: number;
  message?: string;
}