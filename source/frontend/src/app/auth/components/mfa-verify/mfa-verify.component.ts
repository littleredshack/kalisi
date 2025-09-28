import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { filter, take, Subject, takeUntil, interval } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { HttpClient } from '@angular/common/http';
import { AuthV2Service } from '../../services/auth-v2.service';

@Component({
  selector: 'app-mfa-verify',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatExpansionModule,
    MatDividerModule,
    MatDialogModule
  ],
  templateUrl: './mfa-verify.component.html',
  styleUrl: './mfa-verify.component.scss',
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-10px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class MfaVerifyComponent implements OnInit, OnDestroy {
  @Output() verifySuccess = new EventEmitter<void>();
  @Output() navigateToLogin = new EventEmitter<void>();
  @Output() navigateToMfaSetup = new EventEmitter<void>();
  
  mfaForm: FormGroup;
  loading = false;
  error = '';
  showHelp = false;
  serverTime = new Date();
  hasBackupCodes = false; // TODO: Check from user data
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private authV2Service: AuthV2Service,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    private dialog: MatDialog
  ) {
    this.mfaForm = this.fb.group({
      totpCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    });
  }

  ngOnInit(): void {
    // Check if we have a partial token using v2 service
    this.authV2Service.authState$.pipe(
      takeUntil(this.destroy$),
      take(1)
    ).subscribe(state => {
      if (state.isAuthenticated) {
        // Already fully authenticated, go to dashboard
        this.verifySuccess.emit();
      } else if (!state.partialToken) {
        // No partial token and not authenticated, redirect to login
        this.navigateToLogin.emit();
      } else {
        // Have partial token, check MFA status to ensure user is configured
        this.checkMfaStatus();
      }
    });
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkMfaStatus(): void {
    // Check MFA status using v2 service
    this.authV2Service.checkMfaStatus().subscribe({
      next: (response) => {
        if (!response.configured) {
          // User needs to set up MFA first
          this.navigateToMfaSetup.emit();
        }
        // If configured, stay on verify page
      },
      error: (error) => {
        this.error = error.error?.message || 'Failed to check MFA status.';
        if (error.status === 401) {
          // Partial token might be expired
          this.navigateToLogin.emit();
        }
      }
    });
  }

  onSubmit(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (this.mfaForm.valid) {
      this.loading = true;
      this.error = '';
      
      const totpCode = this.mfaForm.get('totpCode')?.value;
      
      this.authV2Service.verifyMfa(totpCode).subscribe({
        next: (response) => {
          this.loading = false;
          this.snackBar.open('Login successful!', 'Close', {
            duration: 3000
          });
          
          // Subscribe to auth state and navigate when authenticated
          this.authV2Service.authState$.pipe(
            filter(state => state.isAuthenticated),
            take(1)
          ).subscribe(() => {
            this.verifySuccess.emit();
          });
        },
        error: (error) => {
          this.loading = false;
          this.error = error.error?.message || error.error?.error || 'Invalid verification code. Please try again.';
          // Clear the form on error
          this.mfaForm.get('totpCode')?.reset();
        }
      });
    }
  }

  resendCode(): void {
    // Since we're using TOTP, there's no resend functionality
    // This could be used to show help text or navigate to recovery options
    this.snackBar.open('Please check your authenticator app for the current code.', 'Close', {
      duration: 5000
    });
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
    if (this.showHelp) {
      // Update server time when help is shown
      this.updateServerTime();
    }
  }

  updateServerTime(): void {
    // Update server time every second while help is open
    interval(1000).pipe(
      takeUntil(this.destroy$)
    ).subscribe(() => {
      if (this.showHelp) {
        this.serverTime = new Date();
      }
    });
  }

  checkTimeSync(): void {
    this.loading = true;
    // Check time sync between client and server
    const clientTime = new Date().getTime();
    
    this.http.get<{ serverTime: number }>('/api/v2/time').subscribe({
      next: (response) => {
        this.loading = false;
        const serverTime = response.serverTime;
        const timeDiff = Math.abs(clientTime - serverTime) / 1000; // in seconds
        
        if (timeDiff < 30) {
          this.snackBar.open('✅ Your device time is synchronized correctly!', 'Close', {
            duration: 5000,
            panelClass: 'success-snackbar'
          });
        } else {
          const message = `⚠️ Time difference detected: ${Math.round(timeDiff)} seconds. 
                          Please sync your device clock.`;
          this.snackBar.open(message, 'Close', {
            duration: 8000,
            panelClass: 'warning-snackbar'
          });
        }
      },
      error: () => {
        this.loading = false;
        this.snackBar.open('Failed to check time sync', 'Close', { duration: 3000 });
      }
    });
  }

  useBackupCode(): void {
    // TODO: Implement backup code dialog
    this.snackBar.open('Backup code feature coming soon', 'Info', { duration: 3000 });
  }

  requestMfaReset(): void {
    const confirmMsg = `This will send a reset link to your registered email address. 
                       Your 2FA will be temporarily disabled until you set it up again. Continue?`;
    
    if (confirm(confirmMsg)) {
      this.loading = true;
      
      // Get the user's email from the partial token session
      this.authV2Service.authState$.pipe(take(1)).subscribe(state => {
        const partialToken = state.partialToken;
        
        this.http.post('/v2/auth/mfa/reset/request', {}, {
          headers: { 'X-Partial-Token': partialToken || '' }
        }).subscribe({
          next: () => {
            this.loading = false;
            this.snackBar.open(
              '📧 Reset link sent! Check your email to complete the process.', 
              'Close', 
              { duration: 8000 }
            );
            // Optionally navigate to a confirmation page
          },
          error: (error) => {
            this.loading = false;
            this.error = error.error?.message || 'Failed to send reset email';
          }
        });
      });
    }
  }

  contactSupport(): void {
    // Open support dialog or navigate to support page
    this.snackBar.open(
      'Support request noted. We\'ll contact you within 24 hours.', 
      'Close', 
      { duration: 5000 }
    );
    
    // TODO: Actually send support request
    // this.http.post('/api/v2/support/mfa-issue', { ... })
  }
}
