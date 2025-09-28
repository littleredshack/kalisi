import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { AuthV2Service } from '../../../auth/services/auth-v2.service';

interface AccountInfo {
  id: string;
  email: string;
  created_at: string;
  total_sessions: number;
  data_export_available: boolean;
}

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatDividerModule
  ],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss']
})
export class AccountComponent implements OnInit {
  @Output() accountDeleted = new EventEmitter<void>();
  
  loading = false;
  accountInfo: AccountInfo | null = null;
  deleting = false;

  constructor(
    private http: HttpClient,
    private authService: AuthV2Service,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadAccountInfo();
  }

  async loadAccountInfo(): Promise<void> {
    this.loading = true;
    
    try {
      const token = this.authService.getAccessToken();
      const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
      
      const response = await this.http.get<AccountInfo>('/v2/user/account', { headers }).toPromise();
      
      if (response) {
        this.accountInfo = response;
      }
    } catch (error) {
      console.error('Failed to load account info:', error);
      this.snackBar.open('Failed to load account information', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async deleteAccount(): Promise<void> {
    // Show confirmation dialog
    const confirmMessage = `
      Are you sure you want to delete your account?
      
      This action will:
      - Permanently delete all your data
      - Remove your access to the system
      - Cannot be undone
      
      Please type "DELETE" to confirm:
    `;
    
    const userInput = prompt(confirmMessage);
    
    if (userInput !== 'DELETE') {
      this.snackBar.open('Account deletion cancelled', 'Close', { duration: 3000 });
      return;
    }
    
    this.deleting = true;
    
    try {
      const token = this.authService.getAccessToken();
      const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
      
      await this.http.delete('/v2/user/account', { headers }).toPromise();
      
      this.snackBar.open('Account deleted successfully', 'Close', { duration: 5000 });
      
      // Clear auth data and emit event
      this.authService.logout();
      this.accountDeleted.emit();
    } catch (error) {
      console.error('Failed to delete account:', error);
      this.snackBar.open('Failed to delete account. Please try again.', 'Close', { duration: 3000 });
    } finally {
      this.deleting = false;
    }
  }

  exportData(): void {
    this.snackBar.open('Data export feature coming soon', 'Close', { duration: 3000 });
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }
}