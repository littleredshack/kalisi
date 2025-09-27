import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthV2Service } from '../../services/auth-v2.service';

@Component({
  selector: 'app-register',
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
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  @Output() navigateToLoginEvent = new EventEmitter<void>();
  @Output() registrationSuccess = new EventEmitter<void>();

  registerForm: FormGroup;
  loading = false;
  error: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthV2Service
  ) {
    this.registerForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    // Clear any existing auth state
    this.authService.clearAuthData();
  }

  async onSubmit(): Promise<void> {
    if (this.registerForm.valid) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await this.authService.register(
          this.registerForm.value.email
        ).toPromise();
        
        if (response?.success && response.partial_token) {
          // Store partial token for MFA setup
          localStorage.setItem('partial_token', response.partial_token);
          
          // Emit success event instead of routing
          this.registrationSuccess.emit();
        } else {
          this.error = 'Registration failed. Please try again.';
        }
      } catch (error: any) {
        if (error.status === 409) {
          this.error = 'User already exists. Please login instead.';
        } else if (error.status === 403) {
          this.error = 'Email not authorized for this system.';
        } else {
          this.error = error.error?.message || 'Registration failed. Please try again.';
        }
      } finally {
        this.loading = false;
      }
    }
  }

  navigateToLogin(): void {
    this.navigateToLoginEvent.emit();
  }
}