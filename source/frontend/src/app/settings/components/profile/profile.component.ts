import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { AuthV2Service } from '../../../auth/services/auth-v2.service';

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  last_login: string | null;
  mfa_enabled: boolean;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatDividerModule
  ],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  profileForm: FormGroup;
  loading = false;
  saving = false;
  profile: UserProfile | null = null;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthV2Service,
    private snackBar: MatSnackBar
  ) {
    this.profileForm = this.fb.group({
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  async loadProfile(): Promise<void> {
    this.loading = true;
    
    try {
      const token = this.authService.getAccessToken();
      const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
      
      const response = await this.http.get<{ data: UserProfile }>('/v2/user/profile', { headers }).toPromise();
      
      if (response?.data) {
        this.profile = response.data;
        this.profileForm.patchValue({
          email: this.profile.email
        });
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
      this.snackBar.open('Failed to load profile', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.profileForm.valid && !this.saving) {
      this.saving = true;
      
      try {
        const token = this.authService.getAccessToken();
        const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
        
        // Note: Email change is not implemented in backend yet
        await this.http.post('/v2/user/profile', this.profileForm.value, { headers }).toPromise();
        
        this.snackBar.open('Profile updated successfully', 'Close', { duration: 3000 });
      } catch (error) {
        console.error('Failed to update profile:', error);
        this.snackBar.open('Failed to update profile', 'Close', { duration: 3000 });
      } finally {
        this.saving = false;
      }
    }
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }
}