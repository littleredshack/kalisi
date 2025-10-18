import { CanvasData, Camera } from './types';
import { CanvasLayoutRuntime } from './layout-runtime';
import { IRenderer } from './renderer';
import { CameraSystem } from './camera';

/**
 * Clean controller for runtime-based layouts.
 *
 * Architecture:
 * - LayoutRuntime calculates ALL positions and dimensions
 * - Controller manages camera and rendering loop
 * - Renderer just draws what it receives
 *
 * NO dimension transformations, NO preset overwriting, NO legacy baggage.
 */
export class RuntimeCanvasController {
  private readonly layoutRuntime: CanvasLayoutRuntime;
  private readonly renderer: IRenderer;
  private readonly cameraSystem: CameraSystem;
  private readonly canvas: HTMLCanvasElement;
  private animationFrameId: number | null = null;
  private onDataChangedCallback?: (data: CanvasData) => void;

  constructor(
    canvas: HTMLCanvasElement,
    renderer: IRenderer,
    initialData: CanvasData,
    canvasId: string,
    engineId?: string
  ) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.cameraSystem = new CameraSystem(canvas.width, canvas.height);

    // Initialize LayoutRuntime with the specified engine
    this.layoutRuntime = new CanvasLayoutRuntime(canvasId, initialData, {
      defaultEngine: engineId ?? 'containment-runtime',
      runLayoutOnInit: true,
      useWorker: false
    });

    // Set initial camera from data
    if (initialData.camera) {
      this.cameraSystem.setCamera(initialData.camera);
    }

    // Start render loop
    this.startRenderLoop();
  }

  /**
   * Get the current canvas data from layout runtime
   */
  getData(): CanvasData {
    return this.layoutRuntime.getCanvasData();
  }

  /**
   * Set new data and optionally run layout
   */
  setData(data: CanvasData, runLayout = false): void {
    this.layoutRuntime.setCanvasData(data, runLayout);

    if (data.camera) {
      this.cameraSystem.setCamera(data.camera);
    }

    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(this.getData());
    }
  }

  /**
   * Run layout with current data
   */
  async runLayout(): Promise<CanvasData> {
    const result = await this.layoutRuntime.runLayout({
      reason: 'user-command',
      source: 'user'
    });

    if (this.onDataChangedCallback) {
      this.onDataChangedCallback(result);
    }

    return result;
  }

  /**
   * Get current camera
   */
  getCamera(): Camera {
    return this.cameraSystem.getCamera();
  }

  /**
   * Set camera
   */
  setCamera(camera: Camera): void {
    this.cameraSystem.setCamera(camera);
  }

  /**
   * Update canvas size
   */
  updateCanvasSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    // CameraSystem doesn't have setViewportSize - it's immutable after construction
  }

  /**
   * Set callback for data changes
   */
  setOnDataChanged(callback: (data: CanvasData) => void): void {
    this.onDataChangedCallback = callback;
  }

  /**
   * Get available layout engines
   */
  getAvailableEngines(): string[] {
    return this.layoutRuntime.getAvailableEngines();
  }

  /**
   * Get active engine name
   */
  getActiveEngineName(): string | null {
    return this.layoutRuntime.getActiveEngineName();
  }

  /**
   * Switch layout engine
   */
  async switchEngine(engineName: string): Promise<void> {
    this.layoutRuntime.setActiveEngine(engineName, 'user');
    await this.runLayout();
  }

  /**
   * Expose layoutRuntime for advanced use cases
   */
  getLayoutRuntime(): CanvasLayoutRuntime {
    return this.layoutRuntime;
  }

  /**
   * Expose camera system for advanced use cases
   */
  getCameraSystem(): CameraSystem {
    return this.cameraSystem;
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    const render = () => {
      const ctx = this.canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      // Clear canvas
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // Get current data from layout runtime
      const data = this.layoutRuntime.getCanvasData();
      const camera = this.cameraSystem.getCamera();

      // Render directly - NO transformations
      this.renderer.render(ctx, data.nodes, data.edges, camera);

      this.animationFrameId = requestAnimationFrame(render);
    };

    render();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
