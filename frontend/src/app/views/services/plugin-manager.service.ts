import { Injectable } from '@angular/core';
import { ViewPlugin, PluginMetadata, PluginContext } from '../models/view.models';
import { BasicGraphPlugin } from '../plugins/basic-graph.plugin';

@Injectable({
  providedIn: 'root'
})
export class PluginManager {
  private plugins = new Map<string, ViewPlugin>();
  private activePlugins = new Map<string, ViewPlugin>();

  constructor() {
    this.registerDefaultPlugins();
  }

  registerPlugin(plugin: ViewPlugin): void {
    if (this.plugins.has(plugin.metadata.id)) {
      console.warn(`Plugin ${plugin.metadata.id} is already registered`);
      return;
    }

    this.plugins.set(plugin.metadata.id, plugin);
  }

  unregisterPlugin(pluginId: string): void {
    // Destroy active instance if exists
    if (this.activePlugins.has(pluginId)) {
      const plugin = this.activePlugins.get(pluginId);
      plugin?.destroy();
      this.activePlugins.delete(pluginId);
    }

    this.plugins.delete(pluginId);
  }

  getPlugin(pluginId: string): ViewPlugin | null {
    // Return active instance if exists
    if (this.activePlugins.has(pluginId)) {
      return this.activePlugins.get(pluginId) || null;
    }

    // Create new instance
    const pluginClass = this.plugins.get(pluginId);
    if (!pluginClass) {
      console.error(`Plugin not found: ${pluginId}`);
      return null;
    }

    // Create instance (assume plugin classes have a clone/create method)
    const instance = this.createPluginInstance(pluginClass);
    this.activePlugins.set(pluginId, instance);

    return instance;
  }

  getAvailablePlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values()).map(plugin => plugin.metadata);
  }

  isPluginRegistered(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  initializePlugin(pluginId: string, context: PluginContext): boolean {
    const plugin = this.getPlugin(pluginId);
    if (!plugin) {
      return false;
    }

    try {
      plugin.initialize(context);
      return true;
    } catch (error) {
      console.error(`Failed to initialize plugin ${pluginId}:`, error);
      return false;
    }
  }

  destroyPlugin(pluginId: string): void {
    const plugin = this.activePlugins.get(pluginId);
    if (plugin) {
      try {
        plugin.destroy();
      } catch (error) {
        console.error(`Error destroying plugin ${pluginId}:`, error);
      }
      this.activePlugins.delete(pluginId);
    }
  }

  private createPluginInstance(pluginClass: ViewPlugin): ViewPlugin {
    // Create new instance based on plugin type
    if (pluginClass instanceof BasicGraphPlugin) {
      return new BasicGraphPlugin();
    }
    
    // For other plugins, return the same instance (singleton approach)
    return pluginClass;
  }

  private registerDefaultPlugins(): void {
    // Register built-in plugins
    this.registerPlugin(new BasicGraphPlugin());
  }
}