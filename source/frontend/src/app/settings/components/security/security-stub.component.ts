import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="security-settings">
      <div class="settings-section">
        <h3>Security Settings</h3>
        <p class="placeholder-text">Security management features coming soon.</p>
      </div>
    </div>
  `,
  styles: [`
    .security-settings {
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
export class SecurityComponent {}