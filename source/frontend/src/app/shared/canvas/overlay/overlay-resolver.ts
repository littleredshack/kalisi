import { EdgeOverlayPatch, EdgeResolutionOptions, OverlayResolutionOptions, ResolvedEdgeProfile, ResolvedNodeProfile } from './overlay-types';
import { OverlayStore } from './overlay-store';

export class OverlayResolver {
  constructor(private readonly store: OverlayStore) {}

  resolveNode(options: OverlayResolutionOptions): ResolvedNodeProfile {
    let containmentMode = options.baseContainmentMode;
    let visibility = options.baseVisibility;
    let collapseState: 'collapsed' | 'expanded' = options.baseCollapseState;
    const layout = {
      layoutStrategy: options.baseLayout.layoutStrategy,
      layoutOptions: { ...options.baseLayout.layoutOptions },
      renderStyle: {
        nodeMode: options.baseLayout.renderStyle.nodeMode,
        edgeRouting: options.baseLayout.renderStyle.edgeRouting,
        showContainsEdges: options.baseLayout.renderStyle.showContainsEdges
      }
    };
    const style = { ...options.baseStyle };

    const patches = this.store.getNodeResolutionChain(options);

    for (const patch of patches) {
      if (patch.containmentMode && patch.containmentMode !== 'inherit') {
        containmentMode = patch.containmentMode;
      }

      if (patch.visibility && patch.visibility !== 'inherit') {
        visibility = patch.visibility;
      }

      if (patch.collapseState && patch.collapseState !== 'inherit') {
        collapseState = patch.collapseState;
      }

      if (patch.layout) {
        const layoutPatch = patch.layout;
        if (layoutPatch.layoutStrategy && layoutPatch.layoutStrategy !== 'inherit') {
          layout.layoutStrategy = layoutPatch.layoutStrategy as typeof layout.layoutStrategy;
        }

        if (layoutPatch.layoutOptions) {
          layout.layoutOptions = {
            ...layout.layoutOptions,
            ...layoutPatch.layoutOptions
          };
        }

        if (layoutPatch.renderStyle) {
          const renderPatch = layoutPatch.renderStyle;
          if (renderPatch.nodeMode && renderPatch.nodeMode !== 'inherit') {
            layout.renderStyle.nodeMode = renderPatch.nodeMode as typeof layout.renderStyle.nodeMode;
          }
          if (renderPatch.edgeRouting && renderPatch.edgeRouting !== 'inherit') {
            layout.renderStyle.edgeRouting = renderPatch.edgeRouting as typeof layout.renderStyle.edgeRouting;
          }
        }
      }

      if (patch.style) {
        if (patch.style.fill !== undefined) {
          style.fill = patch.style.fill ?? style.fill;
        }
        if (patch.style.stroke !== undefined) {
          style.stroke = patch.style.stroke ?? style.stroke;
        }
        if (patch.style.icon !== undefined) {
          style.icon = patch.style.icon;
        }
        if (patch.style.shape !== undefined) {
          style.shape = patch.style.shape ?? style.shape;
        }
        if (patch.style.cornerRadius !== undefined) {
          style.cornerRadius = patch.style.cornerRadius ?? style.cornerRadius;
        }
        if (patch.style.labelVisible !== undefined) {
          style.labelVisible = patch.style.labelVisible;
        }
      }

    }

    layout.renderStyle.showContainsEdges = layout.renderStyle.nodeMode === 'flat';

    return {
      containmentMode,
      layout,
      style,
      visibility,
      collapseState
    };
  }

  resolveEdge(options: EdgeResolutionOptions): ResolvedEdgeProfile {
    let visibility = options.baseVisibility;
    const baseDash = options.baseStyle.strokeDashArray;
    const style = {
      stroke: options.baseStyle.stroke,
      strokeWidth: options.baseStyle.strokeWidth,
      strokeDashArray: Array.isArray(baseDash) ? [...baseDash] : baseDash,
      label: options.baseStyle.label,
      labelVisible: options.baseStyle.labelVisible
    } as ResolvedEdgeProfile['style'];

    const patches = this.store.getEdgeResolutionChain(options);

    patches.forEach((patch: EdgeOverlayPatch) => {
      if (patch.visibility && patch.visibility !== 'inherit') {
        visibility = patch.visibility;
      }
      if (patch.style) {
        if (patch.style.stroke !== undefined) {
          style.stroke = patch.style.stroke;
        }
        if (patch.style.strokeWidth !== undefined) {
          style.strokeWidth = patch.style.strokeWidth;
        }
        if (patch.style.strokeDashArray !== undefined) {
          const dash = patch.style.strokeDashArray;
          style.strokeDashArray = Array.isArray(dash) ? [...dash] : dash;
        }
        if (patch.style.label !== undefined) {
          style.label = patch.style.label;
        }
        if (patch.style.labelVisible !== undefined) {
          style.labelVisible = patch.style.labelVisible;
        }
      }
    });

    return {
      visibility,
      style
    };
  }
}
