import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

import { View } from '../../models/view.models';

@Component({
  selector: 'app-view-navigator',
  standalone: true,
  imports: [
    CommonModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatTooltipModule
  ],
  template: `
    <div class="view-navigator">
      <!-- Library Items List -->
      <mat-nav-list class="views-list">
        <mat-list-item 
          *ngFor="let view of views" 
          (click)="selectView(view)"
          class="view-item">
          
          <mat-icon matListItemIcon>{{ getViewIcon(view.plugin) }}</mat-icon>
          
          <div matListItemTitle>{{ view.name }}</div>
          <div matListItemLine *ngIf="view.description">{{ view.description }}</div>
          
          <div matListItemMeta class="view-actions">
            <button 
              mat-icon-button 
              (click)="onEditView(view, $event)"
              matTooltip="Edit View">
              <mat-icon>{{ icons.edit }}</mat-icon>
            </button>
            <button 
              mat-icon-button 
              (click)="onDeleteView(view, $event)"
              matTooltip="Delete View">
              <mat-icon>{{ icons.delete }}</mat-icon>
            </button>
          </div>
        </mat-list-item>
        
        <!-- Empty state -->
        <div *ngIf="!views || views.length === 0" class="empty-state">
          <mat-icon class="empty-icon">{{ icons.visibility }}</mat-icon>
          <p>No library items available</p>
          <button mat-raised-button color="primary" (click)="createView.emit()">
            Create Your First Library Item
          </button>
        </div>
      </mat-nav-list>
    </div>
  `,
  styles: [`
    .view-navigator {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: white;
      padding: 8px;
    }
    
    .views-list {
      flex: 1;
      overflow-y: auto;
      background: white;
      padding-top: 0;
    }
    
    .view-item {
      border-radius: 4px;
      margin: 2px 0;
      min-height: 40px;
      transition: all 0.2s ease;
      cursor: pointer;
      color: #495057;
      border: 1px solid transparent;
      font-size: 13px;
    }
    
    .view-item:hover {
      background-color: #e9ecef;
      border-color: #dee2e6;
      color: #212529;
    }
    
    .view-item mat-icon[matListItemIcon] {
      color: #6c757d;
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 8px;
    }
    
    .view-item:hover mat-icon {
      color: #495057;
    }
    
    .view-item [matListItemTitle] {
      color: inherit;
      font-weight: 500;
      font-size: 13px;
      line-height: 1.4;
    }
    
    .view-item [matListItemLine] {
      color: #6c757d;
      font-size: 11px;
      line-height: 1.3;
      margin-top: 2px;
    }
    
    .view-actions {
      display: flex;
      gap: 2px;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    
    .view-item:hover .view-actions {
      opacity: 1;
    }
    
    .view-actions button {
      color: #6c757d;
      width: 28px;
      height: 28px;
    }
    
    .view-actions button mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    
    .view-actions button:hover {
      color: #495057;
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      text-align: center;
      color: #6c757d;
      background: white;
    }
    
    .empty-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      margin-bottom: 12px;
      color: #adb5bd;
    }
    
    .empty-state p {
      margin-bottom: 12px;
      color: #6c757d;
      font-size: 13px;
    }
    
    .empty-state button {
      background-color: #0d6efd;
      color: white;
      font-size: 13px;
      height: 32px;
      line-height: 32px;
      padding: 0 16px;
    }
  `]
})
export class ViewNavigatorComponent {
  @Input() views: View[] | null = [];
  @Input() icons = {
    edit: 'edit',
    delete: 'delete',
    add: 'add',
    visibility: 'visibility'
  };
  @Output() viewSelected = new EventEmitter<View>();
  @Output() createView = new EventEmitter<void>();
  @Output() editView = new EventEmitter<View>();
  @Output() deleteView = new EventEmitter<View>();

  selectView(view: View): void {
    console.log('ViewNavigator: Selecting view:', view.name, view);
    this.viewSelected.emit(view);
  }

  onEditView(view: View, event: MouseEvent): void {
    event.stopPropagation();
    this.editView.emit(view);
  }

  onDeleteView(view: View, event: MouseEvent): void {
    event.stopPropagation();
    this.deleteView.emit(view);
  }

  getViewIcon(plugin: string): string {
    // Return appropriate icon based on plugin type
    switch (plugin) {
      case 'basic-graph':
        return 'account_tree';
      case 'business-process':
        return 'alt_route';
      case 'hierarchical':
        return 'account_box';
      case 'geographic':
        return 'map';
      default:
        return 'visibility';
    }
  }
}