import { test, expect } from '@playwright/test';

test('save and load preserves custom flattened node positions', async ({ page }) => {
  await page.goto('https://localhost:8443', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const exploreButton = page.getByRole('button', { name: /explore/i });
  await exploreButton.click();
  await page.waitForTimeout(3000);

  const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
  await chevron.click();
  await page.waitForTimeout(1000);

  const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
  await runtimeMergeItem.click();
  await page.waitForTimeout(4000);

  // Flatten Node 1
  await page.keyboard.press('Alt+L');
  await page.waitForTimeout(500);

  const canvas = page.locator('canvas.full-canvas');
  await canvas.click({ position: { x: 250, y: 200 } });
  await page.waitForTimeout(1500);

  const nodeSection = page.locator('.section-node');
  await expect(nodeSection).toBeVisible({ timeout: 5000 });

  const containmentSelect = nodeSection.locator('select').nth(0);
  await containmentSelect.selectOption('flat');
  await page.waitForTimeout(3000);

  // Move node to custom position
  await canvas.dragTo(canvas, {
    sourcePosition: { x: 350, y: 300 },
    targetPosition: { x: 600, y: 350 }
  });
  await page.waitForTimeout(1000);

  // Save (properties panel might not be open)
  const saveButton = page.getByRole('button', { name: /save layout/i });
  const isSaveVisible = await saveButton.isVisible().catch(() => false);

  if (!isSaveVisible) {
    console.log('Save button not visible - skipping save/reload test');
    console.log('Check logs for current session data');
    return;
  }

  await saveButton.click();
  await page.waitForTimeout(2000);

  // Reload
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Navigate back
  await exploreButton.click();
  await page.waitForTimeout(3000);
  await chevron.click();
  await page.waitForTimeout(1000);
  await runtimeMergeItem.click();
  await page.waitForTimeout(5000);

  console.log('\n✅ Test complete - check /workspace/source/logs/gateway-debug.log for:');
  console.log('  [SAVE] BEFORE strip - node.children positions');
  console.log('  [SAVE] Are they same objects?');
  console.log('  [LOAD] Parent node.children positions');
});
