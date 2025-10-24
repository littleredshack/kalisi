import { test, expect } from '@playwright/test';

test('check force-directed data flow in logs', async ({ page }) => {
  await page.goto('https://localhost:8443', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const exploreButton = page.getByRole('button', { name: /explore/i });
  await exploreButton.click();
  await page.waitForTimeout(3000);

  const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
  await chevron.click();
  await page.waitForTimeout(1000);

  // Click on the view that loads automatically or select force-directed view
  const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
  await runtimeMergeItem.click();
  await page.waitForTimeout(6000);

  console.log('\n✅ View loaded - Check logs at /workspace/source/logs/gateway-debug.log');
  console.log('Look for:');
  console.log('  [FORCE-DIRECTED] 0. Starting loadData');
  console.log('  [FORCE-DIRECTED] ViewNode found');
  console.log('  [FORCE-DIRECTED] 1. Raw Neo4j data');
  console.log('  [FORCE-DIRECTED] 2. ViewGraph receiving data');
  console.log('  [FORCE-DIRECTED] 3. Layout calculation');
  console.log('  [FORCE-DIRECTED] 4. Rendering');
});
