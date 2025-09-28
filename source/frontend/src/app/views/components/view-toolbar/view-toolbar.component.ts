import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-view-toolbar',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDividerModule
  ],
  template: `
    <div class="view-toolbar">
      <!-- View Controls -->
      <div class="toolbar-group">
        <button 
          mat-icon-button 
          (click)="zoomIn()"
          matTooltip="Zoom In">
          <mat-icon>zoom_in</mat-icon>
        </button>
        
        <button 
          mat-icon-button 
          (click)="zoomOut()"
          matTooltip="Zoom Out">
          <mat-icon>zoom_out</mat-icon>
        </button>
        
        <button 
          mat-icon-button 
          (click)="fitToScreen()"
          matTooltip="Fit to Screen">
          <mat-icon>fit_screen</mat-icon>
        </button>
      </div>
      
      <mat-divider [vertical]="true"></mat-divider>
      
      <!-- Layout Controls -->
      <div class="toolbar-group">
        <button 
          mat-icon-button 
          (click)="resetLayout()"
          matTooltip="Reset Layout">
          <mat-icon>refresh</mat-icon>
        </button>
        
        <button 
          mat-icon-button 
          (click)="centerGraph()"
          matTooltip="Center Graph">
          <mat-icon>center_focus_strong</mat-icon>
        </button>
      </div>
      
      <mat-divider [vertical]="true"></mat-divider>
      
      <!-- View Options -->
      <div class="toolbar-group">
        <button 
          mat-icon-button 
          (click)="showLabels = !showLabels"
          [class.active]="showLabels"
          matTooltip="Toggle Labels">
          <mat-icon>label</mat-icon>
        </button>
        
        <button 
          mat-icon-button 
          (click)="showMinimap = !showMinimap"
          [class.active]="showMinimap"
          matTooltip="Toggle Minimap">
          <mat-icon>picture_in_picture</mat-icon>
        </button>
      </div>
      
      <mat-divider [vertical]="true"></mat-divider>
      
      <!-- Export/Share -->
      <div class="toolbar-group">
        <button 
          mat-icon-button 
          (click)="exportView()"
          matTooltip="Export View">
          <mat-icon>download</mat-icon>
        </button>
        
        <button 
          mat-icon-button 
          (click)="shareView()"
          matTooltip="Share View">
          <mat-icon>share</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .view-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.02);
      border-radius: 4px;
    }
    
    .toolbar-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    mat-divider {
      height: 24px;
    }
    
    button.active {
      background-color: rgba(63, 81, 181, 0.1);
      color: #3f51b5;
    }
    
    button mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
  `]
})
export class ViewToolbarComponent {
  @Input() viewId!: string;
  
  showLabels = true;
  showMinimap = false;

  zoomIn(): void {
    console.log('Zoom in - view:', this.viewId);
    // TODO: Emit event to canvas component
  }

  zoomOut(): void {
    console.log('Zoom out - view:', this.viewId);
    // TODO: Emit event to canvas component
  }

  fitToScreen(): void {
    console.log('Fit to screen - view:', this.viewId);
    // TODO: Emit event to canvas component
  }

  resetLayout(): void {
    console.log('Reset layout - view:', this.viewId);
    // TODO: Emit event to canvas component
  }

  centerGraph(): void {
    console.log('Center graph - view:', this.viewId);
    // TODO: Emit event to canvas component
  }

  exportView(): void {
    console.log('Export view - view:', this.viewId);
    // TODO: Implement export functionality
  }

  shareView(): void {
    console.log('Share view - view:', this.viewId);
    // TODO: Implement share functionality
  }
}