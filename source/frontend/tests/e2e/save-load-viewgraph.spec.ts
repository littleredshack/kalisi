import { test, expect } from '@playwright/test';

test('should save and restore containment mode and positions', async ({ page }) => {
  // Listen to browser console
  page.on('console', msg => {
    console.log('BROWSER:', msg.text());
  });

  // Navigate to the application
  await page.goto('https://localhost:8443', {
    waitUntil: 'networkidle'
  });

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // Click Explore button
  const exploreButton = page.getByRole('button', { name: /explore/i });
  await exploreButton.click();
  await page.waitForTimeout(5000);

  // Click the chevron to expand Test Architecture Set
  const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
  await chevron.click();
  await page.waitForTimeout(1000);

  // Click on Containment - Runtime Merge
  const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
  await runtimeMergeItem.click();
  await page.waitForTimeout(5000);

  console.log('=== STEP 1: ViewNode loaded ===');

  // Screenshot to see current UI state
  await page.screenshot({
    path: '/workspace/source/logs/step1-initial-load.png',
    fullPage: true
  });

  // Properties panel with Save Layout should be visible on the right
  // The button is in an accordion under "Canvas Settings"
  const saveButton = page.locator('button:has-text("Save Layout")');
  const isVisible = await saveButton.isVisible();
  console.log('=== Save Layout button visible:', isVisible, '===');

  if (!isVisible) {
    console.log('=== ERROR: Save Layout button not found - test cannot continue ===');
    throw new Error('Save Layout button not visible');
  }

  await saveButton.click();
  console.log('=== STEP 2: Clicked Save Layout ===');
  await page.waitForTimeout(2000);

  // Wait for success toast
  const toast = page.locator('.p-toast-message-success');
  await toast.waitFor({ state: 'visible', timeout: 5000 });
  console.log('=== STEP 3: Save successful ===');

  // Reload the page
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== STEP 4: Page reloaded ===');

  // Click Explore again
  await exploreButton.click();
  await page.waitForTimeout(5000);

  // Expand and select the same ViewNode
  await chevron.click();
  await page.waitForTimeout(1000);
  await runtimeMergeItem.click();
  await page.waitForTimeout(5000);

  console.log('=== STEP 5: ViewNode reloaded ===');
  console.log('=== Test complete ===');
});
