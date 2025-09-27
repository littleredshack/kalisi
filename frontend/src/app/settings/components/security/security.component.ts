import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { AuthV2Service } from '../../../auth/services/auth-v2.service';

interface SecurityInfo {
  mfa_enabled: boolean;
  mfa_method: string | null;
  last_password_change: string | null;
  active_sessions: number;
}

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule
  ],
  templateUrl: './security.component.html',
  styleUrls: ['./security.component.scss']
})
export class SecurityComponent implements OnInit {
  loading = false;
  securityInfo: SecurityInfo = {
    mfa_enabled: false,
    mfa_method: null,
    last_password_change: null,
    active_sessions: 1
  };

  constructor(
    private http: HttpClient,
    private authService: AuthV2Service,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadSecurityInfo();
  }

  async loadSecurityInfo(): Promise<void> {
    this.loading = true;
    
    try {
      const user = this.authService.getCurrentUser();
      if (user) {
        this.securityInfo.mfa_enabled = user.mfa_enabled;
        this.securityInfo.mfa_method = user.mfa_enabled ? 'TOTP' : null;
      }
    } catch (error) {
      console.error('Failed to load security info:', error);
      this.snackBar.open('Failed to load security information', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  manageMfa(): void {
    this.snackBar.open('MFA settings can be managed during login', 'Close', { duration: 3000 });
  }

  viewSessions(): void {
    this.snackBar.open('Session management coming soon', 'Close', { duration: 3000 });
  }

  changePassword(): void {
    this.snackBar.open('Password management not available for this authentication method', 'Close', { duration: 3000 });
  }
}