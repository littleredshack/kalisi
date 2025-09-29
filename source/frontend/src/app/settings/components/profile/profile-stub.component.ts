import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="profile-settings">
      <div class="settings-section">
        <h3>Profile Information</h3>
        <p class="placeholder-text">Profile management features coming soon.</p>
      </div>
    </div>
  `,
  styles: [`
    .profile-settings {
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
export class ProfileComponent {}