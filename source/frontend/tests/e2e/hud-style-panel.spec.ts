import { test, expect } from '@playwright/test';

test.describe('HUD Style Panel', () => {
  test('should show style panel when pressing Option-S after selecting a node', async ({ page }) => {
    // Capture all console logs
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[HudPanelBase]') || text.includes('[HudPanelService]') || msg.type() === 'error') {
        console.log(`[${msg.type()}]`, text);
      }
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

    // Click the chevron icon to expand tree
    const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
    await chevron.click();

    // Wait for menu to expand
    await page.waitForTimeout(1000);

    // Click on Containment - Runtime Merge
    const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
    await runtimeMergeItem.click();

    // Wait for canvas to load
    await page.waitForTimeout(5000);

    // Take screenshot of canvas before selecting node
    await page.screenshot({ path: '/workspace/source/logs/hud-panel-before-selection.png', fullPage: false });

    // Click on the canvas to select a node (click in center of canvas area)
    const canvas = page.locator('canvas.full-canvas');
    await canvas.click({ position: { x: 400, y: 300 } });

    // Wait for selection to register - panel auto-shows on selection
    await page.waitForTimeout(1000);

    // Take screenshot after selection (panel should be visible due to auto-show)
    await page.screenshot({ path: '/workspace/source/logs/hud-panel-after-selection-autoshown.png', fullPage: false });

    // Verify panel auto-showed after selection
    const hudPanelAutoShown = page.locator('.hud-panel');
    await expect(hudPanelAutoShown).toBeVisible();

    // Press Option-S (Alt+S) to HIDE the auto-shown panel
    await page.keyboard.press('Alt+KeyS');
    await page.waitForTimeout(500);

    // Verify panel is now hidden
    await expect(hudPanelAutoShown).not.toBeVisible();
    await page.screenshot({ path: '/workspace/source/logs/hud-panel-hidden-by-shortcut.png', fullPage: false });

    // Press Option-S again to SHOW the panel
    await page.keyboard.press('Alt+KeyS');
    await page.waitForTimeout(500);

    // Take screenshot with panel visible via keyboard shortcut
    await page.screenshot({ path: '/workspace/source/logs/hud-panel-shown-by-shortcut.png', fullPage: false });

    // Debug: Check if app-style-panel component exists
    const stylePanelComponent = page.locator('app-style-panel');
    const componentExists = await stylePanelComponent.count();
    console.log('app-style-panel components found:', componentExists);

    // Debug: Get the HTML of the component
    if (componentExists > 0) {
      const html = await stylePanelComponent.innerHTML();
      console.log('app-style-panel innerHTML:', html);
    }

    // Check if panel is visible in DOM
    const hudPanel = page.locator('.hud-panel');
    await expect(hudPanel).toBeVisible();

    // Verify panel has the correct title
    const panelTitle = page.locator('.panel-title');
    await expect(panelTitle).toHaveText('STYLE');

    // Press Option-S again to hide panel
    await page.keyboard.press('Alt+KeyS');

    // Wait for panel animation
    await page.waitForTimeout(1000);

    // Take screenshot with panel hidden
    await page.screenshot({ path: '/workspace/source/logs/hud-panel-hidden.png', fullPage: false });

    // Verify panel is no longer visible
    await expect(hudPanel).not.toBeVisible();
  });

  test('should allow dragging the HUD panel', async ({ page }) => {
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

    // Click the chevron icon to expand tree
    const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
    await chevron.click();

    // Wait for menu to expand
    await page.waitForTimeout(1000);

    // Click on Containment - Runtime Merge
    const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
    await runtimeMergeItem.click();

    // Wait for canvas to load
    await page.waitForTimeout(5000);

    // Click on the canvas to select a node
    const canvas = page.locator('canvas.full-canvas');
    await canvas.click({ position: { x: 400, y: 300 } });

    // Wait for selection
    await page.waitForTimeout(1000);

    // Press Option-S to show panel
    await page.keyboard.press('Alt+KeyS');
    await page.waitForTimeout(1000);

    // Get initial position
    const hudPanel = page.locator('.hud-panel');
    const initialBox = await hudPanel.boundingBox();

    // Take screenshot before drag
    await page.screenshot({ path: '/workspace/source/logs/hud-panel-before-drag.png', fullPage: false });

    // Drag panel by its header
    const panelHeader = page.locator('.hud-panel-header');
    await panelHeader.dragTo(page.locator('body'), {
      targetPosition: { x: 600, y: 200 }
    });

    // Wait for drag to complete
    await page.waitForTimeout(1000);

    // Take screenshot after drag
    await page.screenshot({ path: '/workspace/source/logs/hud-panel-after-drag.png', fullPage: false });

    // Get new position
    const finalBox = await hudPanel.boundingBox();

    // Verify panel moved
    expect(finalBox?.x).not.toBe(initialBox?.x);
    expect(finalBox?.y).not.toBe(initialBox?.y);
  });
});
