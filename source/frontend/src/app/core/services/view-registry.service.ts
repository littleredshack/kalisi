import { Injectable, Type } from '@angular/core';
import { ViewType, ItemType } from '../models/view.models';

// Base interface for all view components
export interface ViewComponent {
  itemId: string;
  viewType: ViewType;
  content: any;
}

// Metadata for registered views
export interface ViewRegistration {
  viewType: ViewType;
  component: Type<ViewComponent>;
  supportedItemTypes: ItemType[];
  label: string;
  icon: string;
  order: number;
}

@Injectable({
  providedIn: 'root'
})
export class ViewRegistryService {
  private registry = new Map<ViewType, ViewRegistration>();

  // Register a view component
  registerView(registration: ViewRegistration) {
    this.registry.set(registration.viewType, registration);
  }

  // Get all registered views
  getAllViews(): ViewRegistration[] {
    return Array.from(this.registry.values()).sort((a, b) => a.order - b.order);
  }

  // Get views supported by an item type
  getViewsForItemType(itemType: ItemType): ViewRegistration[] {
    return this.getAllViews().filter(view => 
      view.supportedItemTypes.includes(itemType)
    );
  }

  // Get specific view registration
  getView(viewType: ViewType): ViewRegistration | null {
    return this.registry.get(viewType) || null;
  }

  // Check if view type is supported for item type
  isViewSupported(viewType: ViewType, itemType: ItemType): boolean {
    const view = this.getView(viewType);
    return view ? view.supportedItemTypes.includes(itemType) : false;
  }

  // Initialize default view registrations
  initializeDefaultViews() {
    // These will be replaced with actual components
    this.registerView({
      viewType: 'description',
      component: null as any, // Placeholder - will be replaced
      supportedItemTypes: ['folder', 'process', 'system', 'control', 'metric', 'product'],
      label: 'Description',
      icon: 'pi pi-info-circle',
      order: 1
    });

    this.registerView({
      viewType: 'data',
      component: null as any,
      supportedItemTypes: ['system', 'control', 'metric', 'product'],
      label: 'Data',
      icon: 'pi pi-table',
      order: 2
    });

    this.registerView({
      viewType: 'graph',
      component: null as any,
      supportedItemTypes: ['process', 'system', 'product'],
      label: 'Graph',
      icon: 'pi pi-sitemap',
      order: 3
    });

    this.registerView({
      viewType: 'business',
      component: null as any,
      supportedItemTypes: ['process', 'product'],
      label: 'Business',
      icon: 'pi pi-briefcase',
      order: 4
    });
  }
}