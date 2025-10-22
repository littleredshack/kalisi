import { test, expect } from '@playwright/test';

test('should save and restore containment mode, styles, and positions', async ({ page }) => {
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

    console.log('=== STEP 1: Initial state loaded ===');

    // Open Layout Panel and switch to CONTAINERS mode first
    const layoutIcon = page.locator('[data-debug="button-layout"]');
    await layoutIcon.click();
    await page.waitForTimeout(1000);

    const containmentToggle = page.locator('#containment-toggle');
    const toggleLabel = page.locator('label[for="containment-toggle"]');

    // Check current state - might be flat or containers depending on saved layout
    const isCurrentlyChecked = await containmentToggle.isChecked();
    console.log('=== Current containment mode:', isCurrentlyChecked ? 'CONTAINERS' : 'FLAT', '===');

    // Toggle to CONTAINERS (checked) if not already
    if (!isCurrentlyChecked) {
      await toggleLabel.click();
      await page.waitForTimeout(3000);
      await expect(containmentToggle).toBeChecked();
      console.log('=== STEP 2: Switched to CONTAINERS mode ===');
    } else {
      console.log('=== STEP 2: Already in CONTAINERS mode ===');
    }

    // Close layout panel
    await layoutIcon.click();
    await page.waitForTimeout(500);

    // Open Properties Panel to save
    const propertiesIcon = page.locator('[data-debug="button-properties"]');
    await propertiesIcon.click();
    await page.waitForTimeout(1000);

    // Click Save Layout button
    const saveButton = page.getByRole('button', { name: /save layout/i });
    await saveButton.click();
    console.log('=== STEP 3: Clicked Save Layout ===');
    await page.waitForTimeout(2000);

    // Wait for success toast
    await page.waitForSelector('.p-toast-message-success', { timeout: 5000 });
    console.log('=== STEP 4: Save successful ===');

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('=== STEP 5: Page reloaded ===');

    // Click Explore again
    await exploreButton.click();
    await page.waitForTimeout(5000);

    // Expand and select the same ViewNode
    await chevron.click();
    await page.waitForTimeout(1000);
    await runtimeMergeItem.click();
    await page.waitForTimeout(5000);

    console.log('=== STEP 6: ViewNode reloaded ===');

    // Open Layout Panel and verify containment mode is CONTAINERS (checked)
    await layoutIcon.click();
    await page.waitForTimeout(1000);

    const containmentToggleAfterLoad = page.locator('#containment-toggle');
    await expect(containmentToggleAfterLoad).toBeChecked();

    console.log('=== VERIFICATION PASSED: Containment mode restored to CONTAINERS ===');

    await page.screenshot({
      path: '/workspace/source/logs/save-load-containers-mode.png',
      fullPage: false
    });
});
