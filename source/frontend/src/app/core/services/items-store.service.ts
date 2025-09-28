import { Injectable, signal, computed } from '@angular/core';
import { ViewType, ItemType, ItemSlice, ViewSlice } from '../models/view.models';

@Injectable({
  providedIn: 'root'
})
export class ItemsStoreService {
  // Central store for all item states
  private _items = signal<Record<string, ItemSlice>>({});

  // Public read-only access
  readonly items = this._items.asReadonly();

  // Computed helpers
  readonly itemCount = computed(() => Object.keys(this._items()).length);

  // Get specific item
  getItem(itemId: string): ItemSlice | null {
    return this._items()[itemId] || null;
  }

  // Get specific view for an item
  getItemView(itemId: string, viewType: ViewType): ViewSlice | null {
    const item = this.getItem(itemId);
    return item?.views[viewType] || null;
  }

  // Check if item supports a view type
  supportsView(itemId: string, viewType: ViewType): boolean {
    const item = this.getItem(itemId);
    return item?.supportedViews.includes(viewType) || false;
  }

  // Initialize an item if it doesn't exist
  initializeItem(itemId: string, type: ItemType, label: string, supportedViews: ViewType[] = ['description']) {
    const currentItems = this._items();
    
    if (!currentItems[itemId]) {
      const defaultViews: Record<ViewType, ViewSlice> = {} as any;
      
      // Initialize supported views
      supportedViews.forEach(viewType => {
        defaultViews[viewType] = {
          isActive: false,
          isStale: true,
          content: this.getDefaultContent(type, viewType),
          lastUpdated: new Date()
        };
      });

      const newItem: ItemSlice = {
        id: itemId,
        type,
        label,
        views: defaultViews,
        supportedViews
      };

      this._items.set({
        ...currentItems,
        [itemId]: newItem
      });
    }
  }

  // Update view content
  updateView(itemId: string, viewType: ViewType, content: any, markStale: boolean = false) {
    const currentItems = this._items();
    const item = currentItems[itemId];
    
    if (item && item.views[viewType]) {
      const updatedItem = {
        ...item,
        views: {
          ...item.views,
          [viewType]: {
            ...item.views[viewType],
            content,
            isStale: markStale,
            lastUpdated: new Date()
          }
        }
      };

      this._items.set({
        ...currentItems,
        [itemId]: updatedItem
      });
    }
  }

  // Activate a view (mark as active, others as inactive)
  activateView(itemId: string, viewType: ViewType) {
    const currentItems = this._items();
    const item = currentItems[itemId];
    
    if (item) {
      const updatedViews: Record<ViewType, ViewSlice> = {} as any;
      
      // Set all views to inactive, target view to active
      Object.keys(item.views).forEach(key => {
        const vType = key as ViewType;
        updatedViews[vType] = {
          ...item.views[vType],
          isActive: vType === viewType
        };
      });

      const updatedItem = {
        ...item,
        views: updatedViews
      };

      this._items.set({
        ...currentItems,
        [itemId]: updatedItem
      });
    }
  }

  // Mark view as stale (for background updates)
  markViewStale(itemId: string, viewType: ViewType) {
    const currentItems = this._items();
    const item = currentItems[itemId];
    
    if (item && item.views[viewType]) {
      const updatedItem = {
        ...item,
        views: {
          ...item.views,
          [viewType]: {
            ...item.views[viewType],
            isStale: true
          }
        }
      };

      this._items.set({
        ...currentItems,
        [itemId]: updatedItem
      });
    }
  }

  // Get default content based on item and view type
  private getDefaultContent(itemType: ItemType, viewType: ViewType): any {
    switch (viewType) {
      case 'description':
        return {
          title: `${itemType} Overview`,
          summary: `Description for ${itemType}`,
          metadata: { created: new Date(), type: itemType }
        };
      case 'data':
        return {
          schema: {},
          records: [],
          totalCount: 0
        };
      case 'graph':
        return {
          nodes: [],
          edges: [],
          layout: 'hierarchical'
        };
      case 'business':
        return {
          processes: [],
          kpis: [],
          controls: []
        };
      default:
        return null;
    }
  }

  // Export state for persistence
  exportState(): Record<string, any> {
    return this._items();
  }

  // Import state from persistence
  importState(state: Record<string, ItemSlice>) {
    this._items.set(state);
  }

  // Clear all items
  clearAll() {
    this._items.set({});
  }
}