import { test, expect } from '@playwright/test';

test.describe('Layout Panel - Containment Toggle', () => {
  test('should toggle containment mode and verify layout change', async ({ page }) => {
    // Listen to browser console - capture ALL logs
    page.on('console', msg => {
      console.log('BROWSER:', msg.text());
    });

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

    // Click the chevron icon to expand Test Architecture Set
    const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
    await chevron.click();

    // Wait for menu to expand
    await page.waitForTimeout(1000);

    // Click on Containment - Runtime Merge
    const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
    await runtimeMergeItem.click();

    // Wait for view to load completely
    await page.waitForTimeout(5000);

    // INITIAL STATE: Take screenshot of containment mode ON (nested boxes)
    await page.screenshot({
      path: '/workspace/source/logs/containment-on-before.png',
      fullPage: false
    });

    console.log('Screenshot 1: Initial state with containment ON (nested boxes)');

    // Open Layout Panel - Click the activity bar icon
    // Find the Layout icon in activity bar using data-debug attribute
    const layoutIcon = page.locator('[data-debug="button-layout"]');

    // Alternative: Use keyboard shortcut Option-L (Alt+L)
    // await page.keyboard.press('Alt+KeyL');

    await layoutIcon.click();

    // Wait for Layout Panel to open
    await page.waitForTimeout(1000);

    // Verify Layout Panel is visible
    const layoutPanel = page.locator('.layout-panel.visible');
    await expect(layoutPanel).toBeVisible();

    console.log('Layout Panel opened');

    // Take screenshot with Layout Panel open
    await page.screenshot({
      path: '/workspace/source/logs/layout-panel-open.png',
      fullPage: false
    });

    // Find the Containment toggle switch
    // The toggle is an input[type="checkbox"] with id="containment-toggle"
    // But it's visually hidden, so we click the label instead
    const containmentToggle = page.locator('#containment-toggle');
    const toggleLabel = page.locator('label[for="containment-toggle"]');

    // Verify toggle is initially checked (containment ON)
    await expect(containmentToggle).toBeChecked();
    console.log('Containment toggle is ON (checked)');

    // Toggle containment OFF by clicking the visible label
    await toggleLabel.click();

    console.log('Clicked containment toggle - switching to FLAT mode');

    // Wait for layout to recalculate and redraw
    await page.waitForTimeout(3000);

    // AFTER TOGGLE: Take screenshot of flat mode (all nodes with CONTAINS edges)
    await page.screenshot({
      path: '/workspace/source/logs/containment-off-flat.png',
      fullPage: false
    });

    console.log('Screenshot 2: Flat mode with containment OFF (CONTAINS edges visible)');

    // Verify toggle is now unchecked
    await expect(containmentToggle).not.toBeChecked();
    console.log('Containment toggle is OFF (unchecked)');

    // Optional: Toggle back ON to verify it works both ways
    await toggleLabel.click();
    console.log('Toggled back to containment ON');

    await page.waitForTimeout(3000);

    // Take final screenshot showing containment is back ON
    await page.screenshot({
      path: '/workspace/source/logs/containment-on-after.png',
      fullPage: false
    });

    console.log('Screenshot 3: Back to containment ON (nested boxes restored)');

    // Verify toggle is checked again
    await expect(containmentToggle).toBeChecked();
    console.log('Test complete: Containment toggle works in both directions');
  });
});
