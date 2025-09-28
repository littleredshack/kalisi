/**
 * Common camera interface for all canvas components
 * Defines standard camera operations that any canvas system can implement
 */
export interface ICameraController {
  /**
   * Get current zoom level (1.0 = 100%)
   */
  getZoomLevel(): number;

  /**
   * Set zoom level while maintaining center position
   */
  setZoomLevel(level: number): void;

  /**
   * Zoom in/out while maintaining center position
   */
  zoomAtCenter(delta: number): void;

  /**
   * Get camera position
   */
  getPosition(): { x: number; y: number };

  /**
   * Pan camera by delta amounts
   */
  pan(deltaX: number, deltaY: number): void;

  /**
   * Reset camera to default position and zoom
   */
  reset(): void;

  /**
   * Get formatted display string for camera info
   */
  getDisplayInfo(): string;
}