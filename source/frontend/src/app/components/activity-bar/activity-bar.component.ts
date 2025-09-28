import { Component, EventEmitter, Output, Input, OnInit, OnChanges, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipModule } from 'primeng/tooltip';

export interface ActivityBarItem {
  id: string;
  icon: string;
  label: string;
  tooltip: string;
  isActive: boolean;
}

@Component({
  selector: 'app-activity-bar',
  standalone: true,
  imports: [
    CommonModule,
    TooltipModule
  ],
  templateUrl: './activity-bar.component.html',
  styleUrls: ['./activity-bar.component.scss']
})
export class ActivityBarComponent implements OnInit, OnChanges {
  @Input() isOpen = true;
  @Input() libraryPanelOpen = false;
  @Input() settingsPanelOpen = false;
  @Input() propertiesPanelOpen = false;
  @Input() chatPanelOpen = false;
  @Input() debugPanelOpen = false;
  @Output() itemClicked = new EventEmitter<string>();
  @Output() toggleRequested = new EventEmitter<void>();
  
  @HostBinding('class.activity-bar-open') get activityBarOpen() { return this.isOpen; }
  
  menuOpen = false;

  constructor() {}
  
  items: ActivityBarItem[] = [
    {
      id: 'home',
      icon: 'home',
      label: 'Home',
      tooltip: 'Home',
      isActive: false
    },
    {
      id: 'library',
      icon: 'sitemap', 
      label: 'Library',
      tooltip: 'Library',
      isActive: false
    },
    {
      id: 'properties',
      icon: 'check-square',
      label: 'Properties',
      tooltip: 'Properties',
      isActive: false
    },
    {
      id: 'chat',
      icon: 'comments',
      label: 'Chat',
      tooltip: 'Chat Assistant',
      isActive: false
    },
    {
      id: 'admin',
      icon: 'cog',
      label: 'Settings',
      tooltip: 'Settings',
      isActive: false
    },
    {
      id: 'debug',
      icon: 'wrench',
      label: 'Debug',
      tooltip: 'Debug Panel',
      isActive: false
    }
  ];
  
  // Bottom items (settings/admin)
  bottomItems: ActivityBarItem[] = [];
  
  ngOnInit(): void {
    this.updateActiveStates();
  }

  ngOnChanges(): void {
    // Update active states when input properties change
    this.updateActiveStates();
  }

  private updateActiveStates(): void {
    this.items.forEach(item => {
      switch (item.id) {
        case 'library':
          item.isActive = this.libraryPanelOpen;
          break;
        case 'properties':
          item.isActive = this.propertiesPanelOpen;
          break;
        case 'chat':
          item.isActive = this.chatPanelOpen;
          break;
        case 'admin': // Settings
          item.isActive = this.settingsPanelOpen;
          break;
        case 'debug':
          item.isActive = this.debugPanelOpen;
          break;
        case 'home':
          item.isActive = false; // Home never stays active
          break;
      }
    });

    // No bottom items currently
  }
  
  onItemHover(item: ActivityBarItem): void {
    // Item hovered
  }

  onItemClick(item: ActivityBarItem): void {
    
    // Update active state based on the item
    if (item.id === 'home') {
      // Home deactivates all panels
      this.items.forEach(i => i.isActive = false);
    } else {
      // For other items, toggle state and deactivate others
      this.items.forEach(i => {
        if (i.id === item.id) {
          i.isActive = !i.isActive;
        } else {
          i.isActive = false;
        }
      });
    }
    
    // Emit the clicked item's id
    this.itemClicked.emit(item.id);
  }
  
  isAnyItemActive(): boolean {
    return this.items.some(item => item.isActive) || this.bottomItems.some(item => item.isActive);
  }

  onHideClick(): void {
    this.toggleRequested.emit();
  }
}