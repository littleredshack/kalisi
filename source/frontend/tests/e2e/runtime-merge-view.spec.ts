import { test, expect } from '@playwright/test';

test.describe('Runtime Merge View Navigation', () => {
  test('should navigate to Containment - Runtime Merge view', async ({ page }) => {
    // Navigate to the application
    await page.goto('https://localhost:8443', {
      waitUntil: 'networkidle'
    });

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Click Explore button
    const exploreButton = page.getByRole('button', { name: /explore/i });
    await exploreButton.click();

    // Wait for next screen to load
    await page.waitForTimeout(5000);

    // Click the chevron icon with class "tree-toggle"
    const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
    await chevron.click();

    // Wait for menu to expand
    await page.waitForTimeout(1000);

    // Click on Containment - Runtime Merge
    const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
    await runtimeMergeItem.click();

    // Wait 5 seconds for it to load
    await page.waitForTimeout(5000);

    // Take screenshot
    await page.screenshot({ path: '/workspace/source/logs/runtime-merge-view.png', fullPage: false });
  });
});
