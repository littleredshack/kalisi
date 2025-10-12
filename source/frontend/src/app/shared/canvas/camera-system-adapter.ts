import { ICameraController } from './camera-controller.interface';
import { ComposableHierarchicalCanvasEngine } from './composable-hierarchical-canvas-engine';

/**
 * Adapter that bridges ComposableHierarchicalCanvasEngine to ICameraController interface
 * Allows reusable canvas controls to work with the composable canvas engine
 */
export class CameraSystemAdapter implements ICameraController {

  constructor(private engine: ComposableHierarchicalCanvasEngine) {}

  getZoomLevel(): number {
    return this.engine.getCamera().zoom;
  }

  setZoomLevel(level: number): void {
    this.engine.zoomToLevel(level);
  }

  zoomAtCenter(delta: number): void {
    this.engine.zoomAtCenter(delta);
  }

  getPosition(): { x: number; y: number } {
    const camera = this.engine.getCamera();
    return { x: camera.x, y: camera.y };
  }

  pan(deltaX: number, deltaY: number): void {
    this.engine.pan(deltaX, deltaY);
  }

  reset(): void {
    this.engine.setCamera({ x: 0, y: 0, zoom: 1.0 }, 'system');
  }

  getDisplayInfo(): string {
    const camera = this.engine.getCamera();
    return `Camera: (${Math.round(camera.x)}, ${Math.round(camera.y)})`;
  }
}
