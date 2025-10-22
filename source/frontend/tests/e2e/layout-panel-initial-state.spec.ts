import { test, expect } from '@playwright/test';

test('Layout Panel shows correct containment mode on load', async ({ page }) => {
  await page.goto('https://localhost:8443', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const exploreButton = page.getByRole('button', { name: /explore/i });
  await exploreButton.click();
  await page.waitForTimeout(5000);

  const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
  await chevron.click();
  await page.waitForTimeout(1000);

  // Load "Containment - Runtime Merge" which should default to containers mode
  const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
  await runtimeMergeItem.click();
  await page.waitForTimeout(6000);

  console.log('=== ViewNode loaded ===');

  // Open Layout Panel
  const layoutIcon = page.locator('[data-debug="button-layout"]');
  await layoutIcon.click();
  await page.waitForTimeout(1000);

  // Check containment toggle state
  const containmentToggle = page.locator('#containment-toggle');
  const isChecked = await containmentToggle.isChecked();

  console.log('=== Containment toggle checked:', isChecked, '(expected: true for containers mode) ===');

  await expect(containmentToggle).toBeChecked();
  console.log('✅ Test passed: Layout Panel shows correct initial state');
});
