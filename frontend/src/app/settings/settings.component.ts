import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ProfileComponent } from './components/profile/profile.component';
import { SecurityComponent } from './components/security/security.component';
import { AccountComponent } from './components/account/account.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    ProfileComponent,
    SecurityComponent,
    AccountComponent
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  @Input() activeTab: string = 'profile';
  @Output() navigateToHome = new EventEmitter<void>();
  @Output() navigateToSettings = new EventEmitter<'profile' | 'security' | 'account'>();
  @Output() logout = new EventEmitter<void>();
  @Output() accountDeleted = new EventEmitter<void>();

  selectedTabIndex = 0;
  
  navLinks = [
    { path: 'profile', label: 'Profile', icon: 'person' },
    { path: 'security', label: 'Security', icon: 'security' },
    { path: 'account', label: 'Account', icon: 'manage_accounts' }
  ];

  constructor() {
    // Set initial tab index based on activeTab
    this.updateTabIndex();
  }

  ngOnInit(): void {
    this.updateTabIndex();
  }

  private updateTabIndex(): void {
    switch (this.activeTab) {
      case 'profile':
        this.selectedTabIndex = 0;
        break;
      case 'security':
        this.selectedTabIndex = 1;
        break;
      case 'account':
        this.selectedTabIndex = 2;
        break;
      default:
        this.selectedTabIndex = 0;
    }
  }

  onTabChange(event: MatTabChangeEvent): void {
    const tabs: ('profile' | 'security' | 'account')[] = ['profile', 'security', 'account'];
    const newTab = tabs[event.index];
    this.activeTab = newTab;
    this.selectedTabIndex = event.index;
    this.navigateToSettings.emit(newTab);
  }

  onBackToHome(): void {
    this.navigateToHome.emit();
  }

  onAccountDeleted(): void {
    this.accountDeleted.emit();
  }
}