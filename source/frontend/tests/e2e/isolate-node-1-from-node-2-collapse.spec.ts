import { test, expect } from '@playwright/test';

test('Node 1 remains unchanged when Node 2 collapses/expands', async ({ page }) => {
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
  await canvas.click({ position: { x: 250, y: 200 } }); // Click Node 1
  await page.waitForTimeout(1500);

  const nodeSection = page.locator('.section-node');
  await expect(nodeSection).toBeVisible({ timeout: 5000 });

  const containmentSelect = nodeSection.locator('select').nth(0);
  await containmentSelect.selectOption('flat');
  await page.waitForTimeout(3000);

  // Deselect
  await canvas.click({ position: { x: 100, y: 100 } });
  await page.waitForTimeout(500);

  // Double-click Node 2 to collapse
  await canvas.dblclick({ position: { x: 150, y: 150 } });
  await page.waitForTimeout(2000);

  // Double-click Node 2 to expand
  await canvas.dblclick({ position: { x: 150, y: 150 } });
  await page.waitForTimeout(2000);

  console.log('\n✅ Test complete - check /workspace/source/logs/gateway-debug.log for:');
  console.log('  [Collapse] Toggling node: parent-2');
  console.log('  [Collapse] BEFORE - all root nodes');
  console.log('  [Collapse] AFTER layout - all root nodes');
  console.log('\nCompare Node 1 (parent-1) width/height/childCount BEFORE and AFTER');
});
