import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule, MatTabGroup } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TabManagerService, Tab } from '../../core/services/tab-manager.service';
import { TabCanvasComponent } from '../tab-canvas/tab-canvas.component';
import { WasmTabCanvasComponent } from '../wasm-tab-canvas/wasm-tab-canvas.component';
import { Subject, fromEvent } from 'rxjs';
import { takeUntil, filter, debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatDialogModule,
    TabCanvasComponent,
    WasmTabCanvasComponent
  ],
  templateUrl: './tab-bar.component.html',
  styleUrls: ['./tab-bar.component.scss']
})
export class TabBarComponent implements OnInit, OnDestroy {
  @ViewChild(MatTabGroup) tabGroup!: MatTabGroup;
  @Output() nodeSelected = new EventEmitter<any>();
  
  tabs: Tab[] = [];
  activeTabIndex = 0;
  editingTabId: string | null = null;
  editingTabName = '';
  
  private destroy$ = new Subject<void>();
  private longPressTimer: any;
  private readonly LONG_PRESS_DURATION = 500; // ms

  constructor(
    private tabManager: TabManagerService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    // Subscribe to tab state changes
    this.tabManager.tabState$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
      this.tabs = state.tabs;
      const activeIndex = state.tabs.findIndex(t => t.id === state.activeTabId);
      this.activeTabIndex = activeIndex >= 0 ? activeIndex : 0;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
  }

  /**
   * Handle tab selection change
   */
  onTabChange(index: number): void {
    if (index < this.tabs.length) {
      const tab = this.tabs[index];
      if (tab) {
        this.tabManager.setActiveTab(tab.id);
      }
    }
  }

  /**
   * Add a new tab
   */
  addNewTab(): void {
    const success = this.tabManager.addTab();
    if (success) {
      // The service will handle setting the active tab
      console.log('New tab added successfully');
    } else {
      console.warn('Failed to add new tab - maximum limit reached');
    }
  }

  /**
   * Remove a tab
   */
  removeTab(event: Event, tab: Tab): void {
    event.stopPropagation();
    
    // Confirm if there's data in the tab
    if (tab.data) {
      const confirmRemove = confirm(`Are you sure you want to close "${tab.name}"? Any unsaved changes will be lost.`);
      if (!confirmRemove) {
        return;
      }
    }
    
    this.tabManager.removeTab(tab.id);
  }

  /**
   * Start long press detection for tab renaming
   */
  onTabMouseDown(event: MouseEvent, tab: Tab): void {
    event.preventDefault();
    
    this.longPressTimer = setTimeout(() => {
      this.startEditingTab(tab);
    }, this.LONG_PRESS_DURATION);
  }

  /**
   * Cancel long press on mouse up
   */
  onTabMouseUp(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * Handle touch start for mobile
   */
  onTabTouchStart(event: TouchEvent, tab: Tab): void {
    event.preventDefault();
    
    this.longPressTimer = setTimeout(() => {
      this.startEditingTab(tab);
    }, this.LONG_PRESS_DURATION);
  }

  /**
   * Handle touch end for mobile
   */
  onTabTouchEnd(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  /**
   * Start editing a tab name
   */
  startEditingTab(tab: Tab): void {
    this.editingTabId = tab.id;
    this.editingTabName = tab.name;
    
    // Focus the input after it's rendered
    setTimeout(() => {
      const input = document.querySelector('.tab-name-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  /**
   * Save the edited tab name
   */
  saveTabName(tab: Tab): void {
    if (this.editingTabName.trim()) {
      this.tabManager.renameTab(tab.id, this.editingTabName.trim());
    }
    this.cancelEditingTab();
  }

  /**
   * Cancel editing tab name
   */
  cancelEditingTab(): void {
    this.editingTabId = null;
    this.editingTabName = '';
  }

  /**
   * Handle key press in tab name input
   */
  onTabNameKeyPress(event: KeyboardEvent, tab: Tab): void {
    if (event.key === 'Enter') {
      this.saveTabName(tab);
    } else if (event.key === 'Escape') {
      this.cancelEditingTab();
    }
  }

  /**
   * Track tabs for ngFor optimization
   */
  trackByTabId(index: number, tab: Tab): string {
    return tab.id;
  }

  /**
   * Check if a tab can be closed
   */
  canCloseTab(): boolean {
    return this.tabs.length > 1;
  }

  /**
   * Get formatted tab tooltip
   */
  getTabTooltip(tab: Tab): string {
    const created = tab.createdAt.toLocaleString();
    const modified = tab.lastModified.toLocaleString();
    return `Created: ${created}\nLast Modified: ${modified}\n\nLong press to rename`;
  }

  /**
   * Handle canvas state changes
   */
  onCanvasStateChange(event: { type: string; data: any }): void {
    console.log('Tab Canvas state changed:', event.type, event.data);
    
    // Handle specific state changes if needed
    switch (event.type) {
      case 'entity-moved':
      case 'entity-added':
      case 'entity-removed':
      case 'connection-added':
      case 'connection-removed':
        // Canvas component handles auto-save
        break;
      default:
        break;
    }
  }
}