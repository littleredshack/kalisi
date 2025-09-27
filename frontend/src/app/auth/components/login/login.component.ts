import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthV2Service } from '../../services/auth-v2.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  @Output() navigateToRegister = new EventEmitter<void>();
  @Output() loginSuccess = new EventEmitter<void>();
  @Output() registrationRedirect = new EventEmitter<void>();

  loginForm: FormGroup;
  loading = false;
  error = '';

  constructor(
    private fb: FormBuilder,
    private authV2Service: AuthV2Service
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loading = true;
      this.error = '';
      
      const email = this.loginForm.get('email')?.value;
      
      // Use v2 service with cleaner flow
      this.authV2Service.login(email, 'totp').subscribe({
        next: (response) => {
          this.loading = false;
          // Emit events instead of router navigation
          if (response.mfa_status.configured) {
            this.loginSuccess.emit();
          } else {
            this.registrationRedirect.emit();
          }
        },
        error: (error) => {
          this.loading = false;
          
          // Handle specific error cases
          if (error.status === 403 && error.error?.error?.includes('not authorized')) {
            this.error = 'Your email is not authorized for this system. Please contact an administrator.';
          } else if (error.status === 409 && error.error?.error?.includes('already exists')) {
            this.error = 'Account exists but login failed. Please try again or contact support.';
          } else {
            this.error = error.error?.message || error.error?.error || 'Login failed. Please try again.';
          }
        }
      });
    }
  }

  onNavigateToRegister(): void {
    this.navigateToRegister.emit();
  }
}
