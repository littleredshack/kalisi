import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { filter, take } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepperModule } from '@angular/material/stepper';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import * as QRCode from 'qrcode';
import { AuthV2Service, MfaSetupResponse } from '../../services/auth-v2.service';

@Component({
  selector: 'app-mfa-setup',
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
    MatStepperModule,
    MatListModule,
    MatSnackBarModule
  ],
  templateUrl: './mfa-setup.component.html',
  styleUrl: './mfa-setup.component.scss'
})
export class MfaSetupComponent implements OnInit {
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;
  @Output() setupComplete = new EventEmitter<void>();
  @Output() navigateToLogin = new EventEmitter<void>();
  
  mfaForm: FormGroup;
  loading = false;
  error = '';
  mfaData: MfaSetupResponse | null = null;
  showSecret = false;
  backupCodesCopied = false;

  constructor(
    private fb: FormBuilder,
    private authV2Service: AuthV2Service,
    private snackBar: MatSnackBar
  ) {
    this.mfaForm = this.fb.group({
      totpCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]]
    });
  }

  ngOnInit(): void {
    this.loadMfaSetup();
  }

  loadMfaSetup(): void {
    this.loading = true;
    this.authV2Service.initMfaSetup().subscribe({
      next: (response) => {
        this.mfaData = response;
        this.loading = false;
        // Generate QR code after view is initialized
        setTimeout(() => this.generateQRCode(response.qr_code_url), 100);
      },
      error: (error) => {
        this.loading = false;
        this.error = error.error?.message || error.error?.error || 'Failed to load MFA setup. Please try again.';
        
        if (error.status === 401) {
          // Partial token might be expired
          this.navigateToLogin.emit();
        }
      }
    });
  }

  generateQRCode(url: string): void {
    if (this.qrCanvas && this.qrCanvas.nativeElement) {
      QRCode.toCanvas(this.qrCanvas.nativeElement, url, {
        width: 256,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }, (error) => {
        if (error) {
          console.error('QR Code generation error:', error);
          this.error = 'Failed to generate QR code';
        }
      });
    }
  }

  toggleSecretVisibility(): void {
    this.showSecret = !this.showSecret;
  }

  copyToClipboard(text: string, type: string): void {
    // Check if clipboard API is available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.snackBar.open(`${type} copied to clipboard!`, 'Close', {
          duration: 3000
        });
        
        if (type === 'Backup codes') {
          this.backupCodesCopied = true;
        }
      }).catch((error) => {
        console.error('Clipboard API failed:', error);
        this.fallbackCopyToClipboard(text, type);
      });
    } else {
      // Fallback for browsers that don't support clipboard API
      this.fallbackCopyToClipboard(text, type);
    }
  }

  private fallbackCopyToClipboard(text: string, type: string): void {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        this.snackBar.open(`${type} copied to clipboard!`, 'Close', {
          duration: 3000
        });
        
        if (type === 'Backup codes') {
          this.backupCodesCopied = true;
        }
      } else {
        this.snackBar.open('Failed to copy. Please select and copy manually.', 'Close', {
          duration: 5000
        });
      }
    } catch (err) {
      console.error('Fallback copy failed:', err);
      this.snackBar.open('Failed to copy. Please select and copy manually.', 'Close', {
        duration: 5000
      });
    } finally {
      document.body.removeChild(textarea);
    }
  }

  copyBackupCodes(): void {
    try {
      console.log('copyBackupCodes called, mfaData:', this.mfaData);
      if (this.mfaData && this.mfaData.backup_codes && Array.isArray(this.mfaData.backup_codes)) {
        const codesText = this.mfaData.backup_codes.join('\n');
        this.copyToClipboard(codesText, 'Backup codes');
      } else {
        console.error('Invalid mfaData or backup_codes:', this.mfaData);
        this.snackBar.open('No backup codes available to copy', 'Close', {
          duration: 3000
        });
      }
    } catch (error) {
      console.error('Error in copyBackupCodes:', error);
      this.snackBar.open('Failed to copy backup codes', 'Close', {
        duration: 3000
      });
    }
  }

  onSubmit(): void {
    if (this.mfaForm.valid && this.mfaData) {
      this.loading = true;
      this.error = '';
      
      const totpCode = this.mfaForm.get('totpCode')?.value;
      
      // Complete MFA setup with the TOTP code (this verifies and enables in one step)
      this.authV2Service.completeMfaSetup(totpCode, true).subscribe({
        next: () => {
          this.loading = false;
          this.snackBar.open('MFA setup successful!', 'Close', {
            duration: 3000
          });
          
          // Subscribe to auth state and navigate when authenticated
          this.authV2Service.authState$.pipe(
            filter(state => state.isAuthenticated),
            take(1)
          ).subscribe(() => {
            this.setupComplete.emit();
          });
        },
        error: (error) => {
          this.loading = false;
          this.error = error.error?.message || error.error?.error || 'Invalid verification code. Please try again.';
        }
      });
    }
  }
}
