import { Camera, Point } from './types';

export class CameraSystem {
  private camera: Camera = { x: 0, y: 0, zoom: 1.0 };
  private canvasWidth = 600;
  private canvasHeight = 500;
  
  // Pan state
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  // Camera accessors
  getCamera(): Camera {
    return { ...this.camera };
  }

  setCamera(camera: Camera): void {
    this.camera = { ...camera };
  }

  updateCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  // Coordinate conversion - match renderer expectations
  worldToScreen(worldX: number, worldY: number): Point {
    const screenX = (worldX - this.camera.x) * this.camera.zoom;
    const screenY = (worldY - this.camera.y) * this.camera.zoom;
    return { x: screenX, y: screenY };
  }

  screenToWorld(screenX: number, screenY: number): Point {
    const worldX = screenX / this.camera.zoom + this.camera.x;
    const worldY = screenY / this.camera.zoom + this.camera.y;
    return { x: worldX, y: worldY };
  }

  // Pan operations
  startPan(screenX: number, screenY: number): void {
    this.isPanning = true;
    this.panStartX = screenX;
    this.panStartY = screenY;
  }

  updatePan(screenX: number, screenY: number): boolean {
    if (!this.isPanning) return false;

    const deltaX = screenX - this.panStartX;
    const deltaY = screenY - this.panStartY;

    // Apply zoom compensation to delta - invert for natural trackpad behavior
    this.camera.x += deltaX / this.camera.zoom;
    this.camera.y += deltaY / this.camera.zoom;

    this.panStartX = screenX;
    this.panStartY = screenY;

    return true;
  }

  stopPan(): void {
    this.isPanning = false;
  }

  // Zoom operations
  zoom(screenX: number, screenY: number, zoomDelta: number): void {
    const zoomFactor = zoomDelta > 0 ? 1.1 : 0.9; // Positive delta = zoom IN
    const oldZoom = this.camera.zoom;

    // Calculate world point under mouse BEFORE zoom change
    const worldMouseX = screenX / oldZoom + this.camera.x;
    const worldMouseY = screenY / oldZoom + this.camera.y;

    // Update zoom
    this.camera.zoom = Math.max(0.1, Math.min(5.0, this.camera.zoom * zoomFactor));

    // Adjust camera so same world point stays under mouse
    this.camera.x = worldMouseX - screenX / this.camera.zoom;
    this.camera.y = worldMouseY - screenY / this.camera.zoom;
  }

  // Reset camera
  reset(): void {
    this.camera = { x: 0, y: 0, zoom: 1.0 };
    this.isPanning = false;
  }
}