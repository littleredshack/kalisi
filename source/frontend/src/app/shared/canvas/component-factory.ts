import { RuntimeContainmentRenderer } from '../composable/renderers/runtime-containment-renderer';
import { RuntimeFlatRenderer } from '../composable/renderers/runtime-flat-renderer';

/**
 * Simplified factory - only containment-runtime exists now
 * Returns runtime renderers for containers/flat modes
 */
export class ComponentFactory {
  static createContainmentRenderer(): RuntimeContainmentRenderer {
    return new RuntimeContainmentRenderer();
  }

  static createFlatRenderer(): RuntimeFlatRenderer {
    return new RuntimeFlatRenderer();
  }
}
