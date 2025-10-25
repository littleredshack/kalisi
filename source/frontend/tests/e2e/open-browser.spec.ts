import { test } from '@playwright/test';

test('open browser to trigger view load', async ({ page }) => {
  await page.goto('https://localhost:8443', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Check all canvases
  const canvasCount = await page.locator('canvas').count();
  console.log('Total canvas elements:', canvasCount);

  for (let i = 0; i < canvasCount; i++) {
    const c = page.locator('canvas').nth(i);
    const box = await c.boundingBox();
    const className = await c.getAttribute('class');
    console.log(`Canvas ${i}: class="${className}", box=`, box);
  }

  const runtimeCanvas = await page.locator('app-runtime-canvas').count();
  console.log('app-runtime-canvas count:', runtimeCanvas);

  await page.screenshot({ path: '/workspace/source/frontend/tests/e2e/screenshots/rendered-view.png', fullPage: true });
  console.log('✅ Browser opened - Check /workspace/source/logs/gateway-debug.log');
});
