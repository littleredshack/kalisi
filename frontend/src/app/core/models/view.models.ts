// Core interfaces for multi-view switching system

export type ViewType = 'description' | 'data' | 'graph' | 'business' | 'modular-canvas';

export type ItemType = 'folder' | 'process' | 'system' | 'control' | 'metric' | 'product';

export interface ViewSlice {
  isActive: boolean;
  isStale: boolean;
  content: any;
  lastUpdated: Date;
}

export interface ItemSlice {
  id: string;
  type: ItemType;
  label: string;
  views: Record<ViewType, ViewSlice>;
  supportedViews: ViewType[];
}

export interface TreeNode {
  id: string;
  label: string;
  type: ItemType;
  icon?: string;
  children?: TreeNode[];
  isLeaf?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  meta?: Record<string, any>;
}

// State DTOs for persistence
export interface UiDTO {
  activeItemId: string | null;
  activeView: ViewType | null;
  libraryPanelOpen: boolean;
  settingsPanelOpen: boolean;
}

export interface TreeDTO {
  nodes: TreeNode[];
  expandedIds: string[];
  selectedId: string | null;
}

export interface ItemDTO {
  id: string;
  type: ItemType;
  views: Record<string, any>;
  lastActiveView: ViewType | null;
}

export interface StateSnapshot {
  ui: UiDTO;
  tree: TreeDTO;
  items: Record<string, ItemDTO>;
  version: number;
}

// Persistence interface
export interface PersistencePort {
  save(snapshot: StateSnapshot): Promise<void>;
  load(): Promise<StateSnapshot | null>;
  clear(): Promise<void>;
}