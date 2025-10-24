import { test } from '@playwright/test';

test('open browser to trigger view load', async ({ page }) => {
  await page.goto('https://localhost:8443', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  console.log('✅ Browser opened - Check /workspace/source/logs/gateway-debug.log');
});
