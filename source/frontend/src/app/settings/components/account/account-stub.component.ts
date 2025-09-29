import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="account-settings">
      <div class="settings-section">
        <h3>Account Management</h3>
        <p class="placeholder-text">Account management features coming soon.</p>
      </div>
    </div>
  `,
  styles: [`
    .account-settings {
      padding: 1.5rem;
    }

    .settings-section {
      margin-bottom: 2rem;
    }

    .settings-section h3 {
      color: var(--primary-color);
      margin-bottom: 1rem;
      font-size: 1.1rem;
    }

    .placeholder-text {
      color: var(--text-secondary);
    }
  `]
})
export class AccountComponent {
  @Output() accountDeleted = new EventEmitter<void>();
}