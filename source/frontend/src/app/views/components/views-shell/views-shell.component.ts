import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { Subject, takeUntil } from 'rxjs';

import { ViewsService } from '../../services/views.service';
import { View, ViewTab } from '../../models/view.models';
import { ViewNavigatorComponent } from '../view-navigator/view-navigator.component';
import { CanvasViewComponent } from '../canvas-view/canvas-view.component';
import { ViewToolbarComponent } from '../view-toolbar/view-toolbar.component';

@Component({
  selector: 'app-views-shell',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatSidenavModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule,
    MatMenuModule,
    MatDividerModule,
    ViewNavigatorComponent,
    CanvasViewComponent,
    ViewToolbarComponent
  ],
  template: `
    <div class="views-container">
      <!-- Navigation Toolbar -->
      <mat-toolbar color="primary">
        <button mat-icon-button (click)="onNavigateToHome()">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <span>Views Engine</span>
        <span class="spacer"></span>
        
        <!-- User Menu -->
        <button mat-button [matMenuTriggerFor]="userMenu" class="user-menu-button">
          <mat-icon>account_circle</mat-icon>
          <mat-icon>arrow_drop_down</mat-icon>
        </button>
        
        <mat-menu #userMenu="matMenu">
          <button mat-menu-item (click)="onNavigateToHome()">
            <mat-icon>home</mat-icon>
            <span>Home</span>
          </button>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="onLogout()">
            <mat-icon>logout</mat-icon>
            <span>Logout</span>
          </button>
        </mat-menu>
      </mat-toolbar>

      <!-- Left Navigation - Matches existing Kalisi pattern -->
      <mat-sidenav-container class="views-sidenav-container">
        <mat-sidenav #sidenav mode="side" opened class="views-sidenav">
          <app-view-navigator 
            [views]="views$ | async"
            (viewSelected)="openView($event)"
            (createView)="createNewView()">
          </app-view-navigator>
        </mat-sidenav>
        
        <mat-sidenav-content>
          <!-- Tab Container - Uses existing Material tabs -->
          <mat-tab-group 
            [(selectedIndex)]="selectedTabIndex"
            (selectedTabChange)="onTabChange($event)"
            class="views-tabs">
            
            <mat-tab *ngFor="let tab of openTabs$ | async">
              <ng-template mat-tab-label>
                <span>{{ tab.name }}</span>
                <button mat-icon-button (click)="closeTab(tab.id, $event)" class="tab-close-button">
                  <mat-icon>close</mat-icon>
                </button>
              </ng-template>
              
              <!-- Canvas View inside Material Card -->
              <mat-card class="view-card">
                <mat-card-header>
                  <mat-card-title>{{ tab.name }}</mat-card-title>
                  <mat-card-subtitle>{{ tab.description }}</mat-card-subtitle>
                </mat-card-header>
                
                <mat-card-content>
                  <app-canvas-view
                    [viewId]="tab.viewId"
                    [query]="tab.query"
                    [plugin]="tab.plugin">
                  </app-canvas-view>
                </mat-card-content>
                
                <mat-card-actions>
                  <app-view-toolbar [viewId]="tab.viewId"></app-view-toolbar>
                </mat-card-actions>
              </mat-card>
            </mat-tab>
          </mat-tab-group>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </div>
  `,
  styles: [`
    /* Use existing Kalisi spacing and layout patterns */
    .views-container {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    .spacer {
      flex: 1;
    }
    
    .views-sidenav-container {
      flex: 1;
      background: transparent;
    }
    
    .views-sidenav {
      width: 280px; /* Match existing sidenav width */
    }
    
    .views-tabs {
      height: 100%;
    }
    
    .view-card {
      margin: 16px;
      height: calc(100vh - 200px); /* Account for header/footer */
    }
    
    .tab-close-button {
      margin-left: 8px;
      width: 24px;
      height: 24px;
      line-height: 24px;
    }
    
    .tab-close-button mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
    }
  `]
})
export class ViewsShellComponent implements OnInit, OnDestroy {
  @Output() navigateToHome = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  views$ = this.viewsService.views$;
  openTabs$ = this.viewsService.openTabs$;
  selectedTabIndex = 0;
  
  private destroy$ = new Subject<void>();

  constructor(private viewsService: ViewsService) {}

  ngOnInit(): void {
    // Subscribe to selected tab index
    this.viewsService.selectedTabIndex$
      .pipe(takeUntil(this.destroy$))
      .subscribe(index => {
        this.selectedTabIndex = index;
      });
      
    // Load available views
    this.viewsService.loadViews();
    
    // Create a default view if none exist
    this.checkAndCreateDefaultView();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openView(view: View): void {
    this.viewsService.openView(view);
  }

  closeTab(tabId: string, event: MouseEvent): void {
    event.stopPropagation(); // Prevent tab selection
    this.viewsService.closeTab(tabId);
  }

  onTabChange(event: any): void {
    this.viewsService.selectTab(event.index);
  }

  createNewView(): void {
    // TODO: Open dialog to create new view
  }

  onNavigateToHome(): void {
    this.navigateToHome.emit();
  }

  onLogout(): void {
    this.logout.emit();
  }
  
  private async checkAndCreateDefaultView(): Promise<void> {
    // Wait for views to load
    setTimeout(() => {
      const views = this.viewsService['viewsSubject'].value;
      if (views.length === 0) {
        // Create default "All Nodes" view
        this.viewsService.createView({
          name: 'All Nodes',
          description: 'Display all nodes and relationships in the database',
          query: 'MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 100',
          plugin: 'basic-graph'
        }).subscribe({
          next: (view) => {
            this.viewsService.openView(view);
          },
          error: (error) => {
            console.error('Failed to create default view:', error);
          }
        });
      }
    }, 1000);
  }
}