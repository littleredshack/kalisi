import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-properties-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule
  ],
  template: `
    <div class="properties-panel">
      <div class="panel-header">
      </div>
      
      <div class="properties-content">
        <!-- Library Item Info -->
        <div *ngIf="!selectedLibraryItem" class="section no-selection">
          <p>Select an item from the Library to view its properties.</p>
        </div>
        
        <div *ngIf="selectedLibraryItem" class="section library-info">
          <h4>{{ getCurrentViewName() }}</h4>
          <div class="divider"></div>
          
          <!-- Display ViewNode details if available -->
          <div *ngIf="selectedViewNodeDetails" class="viewnode-details">
            <div class="property-row">
              <span class="property-label">Name:</span>
              <span class="property-value">{{ selectedViewNodeDetails.name }}</span>
            </div>
            <div class="property-row">
              <span class="property-label">ID:</span>
              <span class="property-value">{{ selectedViewNodeDetails.id }}</span>
            </div>
            
            <!-- ViewNode specific properties -->
            <div *ngIf="selectedViewNodeDetails.layoutEngine" class="property-row">
              <span class="property-label">Layout Engine:</span>
              <span class="property-value">{{ selectedViewNodeDetails.layoutEngine }}</span>
            </div>
            <div *ngIf="selectedViewNodeDetails.renderer" class="property-row">
              <span class="property-label">Renderer:</span>
              <span class="property-value">{{ selectedViewNodeDetails.renderer }}</span>
            </div>
            
            <!-- SetNode specific properties -->
            <div *ngIf="selectedViewNodeDetails.viewNodes" class="property-row">
              <span class="property-label">ViewNodes:</span>
              <span class="property-value">{{ selectedViewNodeDetails.viewNodes.length }} views</span>
            </div>
            
            <!-- Query details for SetNode -->
            <div *ngIf="selectedViewNodeDetails.queryDetails" class="property-section">
              <h5>Associated Query</h5>
              <div class="property-row">
                <span class="property-label">Query Name:</span>
                <span class="property-value">{{ selectedViewNodeDetails.queryDetails.queryName }}</span>
              </div>
              <div class="property-row query-display">
                <span class="property-label">Cypher Query:</span>
                <div class="property-value query-text">{{ selectedViewNodeDetails.queryDetails.cypherQuery }}</div>
              </div>
            </div>
            
            <div class="property-row">
              <span class="property-label">Created:</span>
              <span class="property-value">{{ formatDate(selectedViewNodeDetails.createdAt) }}</span>
            </div>
            <div class="property-row">
              <span class="property-label">Updated:</span>
              <span class="property-value">{{ formatDate(selectedViewNodeDetails.updatedAt) }}</span>
            </div>
          </div>
          
          <p>Configure settings for the {{ getCurrentViewName().toLowerCase() }} view.</p>
        </div>
        
        <!-- Containment Settings Section -->
        <div *ngIf="isCanvasView()" class="section containment-settings">
          <h4>Containment Rendering</h4>
          <div class="divider"></div>
          
          <div class="containment-controls">
            <div class="toggle-container">
              <label class="toggle-switch">
                <input type="checkbox" 
                       [(ngModel)]="containmentEnabled"
                       (change)="onContainmentToggleChange($event)">
                <span class="slider"></span>
                <span class="toggle-label">Enable Containment Mode</span>
              </label>
            </div>
            
            <div class="toggle-description">
              <span class="info-icon">ℹ️</span>
              <span>When enabled, CONTAINS relationships will nest children inside parent nodes. Double-click parents to expand/collapse.</span>
            </div>
            
            <div *ngIf="containmentEnabled" class="containment-info">
              <div class="property-info">
                <span class="label">Edge Types:</span>
                <span class="value">CONTAINS</span>
              </div>
              
              <div class="property-info">
                <span class="label">Current View:</span>
                <span class="value">{{ getCurrentViewName() }}</span>
              </div>
              
              <div class="property-info">
                <span class="label">Status:</span>
                <span class="value">✅ Active</span>
              </div>
              
              <div class="property-info">
                <span class="label">Actions:</span>
                <span class="value">Double-click to expand/collapse</span>
              </div>
              
              <div class="property-info">
                <span class="label">Debug:</span>
                <span class="value">Check browser console for details</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .properties-panel {
      height: 100%;
      display: flex;
      flex-direction: column;
      color: var(--text-primary);
      background: var(--background-secondary);
    }
    
    .panel-header {
      padding: 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--background-primary);
      
      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 500;
        color: var(--text-primary);
      }
    }
    
    .properties-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    
    .section {
      margin-bottom: 24px;
      
      h4 {
        margin: 0 0 12px;
        font-size: 14px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-secondary);
      }
      
      .divider {
        height: 1px;
        background: var(--border-color);
        margin-bottom: 16px;
      }
      
      p {
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.5;
      }
    }
    
    .property-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
      
      .label {
        color: var(--text-secondary);
      }
      
      .value {
        color: var(--text-primary);
        font-weight: 500;
      }
    }
    
    .containment-controls {
      .toggle-container {
        margin-bottom: 16px;
      }
      
      .toggle-switch {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        
        input[type="checkbox"] {
          display: none;
        }
        
        .slider {
          position: relative;
          width: 44px;
          height: 24px;
          background: #ccc;
          border-radius: 12px;
          transition: 0.3s;
          flex-shrink: 0;
          
          &:before {
            content: '';
            position: absolute;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: white;
            top: 3px;
            left: 3px;
            transition: 0.3s;
          }
        }
        
        input:checked + .slider {
          background: #2196F3;
          
          &:before {
            transform: translateX(20px);
          }
        }
        
        .toggle-label {
          font-weight: 500;
          color: var(--text-primary);
        }
      }
      
      .toggle-description {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 16px;
        padding: 12px;
        background: var(--background-tertiary);
        border-radius: 6px;
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.4;
        
        .info-icon {
          font-size: 14px;
          margin-top: 1px;
          flex-shrink: 0;
        }
      }
      
      .containment-info {
        padding-top: 12px;
        border-top: 1px solid var(--border-color);
      }
    }
  `]
})
export class PropertiesPanelComponent implements OnInit {
  @Input() selectedLibraryItem: string | null = null;
  @Input() selectedViewNodeDetails: any = null;
  
  containmentEnabled = false;
  
  constructor() {}
  
  ngOnInit(): void {
    // Always start with containment disabled (line draw mode default)
    this.containmentEnabled = false;
    
    // Ensure containment is disabled for current view
    if (this.selectedLibraryItem && this.isCanvasView()) {
      // Renderer removed - no containment control
    }
  }
  
  
  isCanvasView(): boolean {
    // Show containment controls for processes and systems views
    return this.selectedLibraryItem === 'processes' || this.selectedLibraryItem === 'systems';
  }
  
  getCurrentViewName(): string {
    if (this.selectedViewNodeDetails) {
      return this.selectedViewNodeDetails.name || 'Unknown';
    }
    if (this.selectedLibraryItem === 'processes') return 'Processes';
    if (this.selectedLibraryItem === 'systems') return 'Systems';
    return 'Unknown';
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'Unknown';
    // Simple date formatting - can be enhanced
    return new Date().toLocaleDateString();
  }
  
  onContainmentToggleChange(event: any): void {
    // For checkbox change events, use the target.checked property
    const enabled = event.target?.checked ?? this.containmentEnabled;
    this.containmentEnabled = enabled;
    
    const viewId = this.selectedLibraryItem;
    if (!viewId) return;
    
    console.log('Containment toggle:', enabled ? 'ENABLED' : 'DISABLED', 'for view:', viewId);
    
    if (enabled) {
      // Enable containment with GS Renderer
      // Renderer removed - no containment control
      console.log('Containment enabled with GS Renderer');
    } else {
      // Disable containment  
      // Renderer removed - no containment control
      console.log('Containment disabled - GS line mode');
    }
    
    // Check the actual state after toggle
    const isEnabled = this.containmentEnabled;
    console.log('Current GS containment state:', isEnabled);
  }
  
  private updateContainmentState(): void {
    if (this.selectedLibraryItem && this.isCanvasView()) {
      // Check if containment is currently enabled for this view
      // No renderer - state managed locally
    }
  }
}