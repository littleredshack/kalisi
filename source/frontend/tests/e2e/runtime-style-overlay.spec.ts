import { test, expect } from '@playwright/test';

async function navigateToRuntimeMerge(page) {
  page.on('console', msg => {
    console.log('BROWSER:', msg.text());
  });

  await page.goto('https://localhost:8443', { waitUntil: 'networkidle' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const exploreButton = page.getByRole('button', { name: /explore/i });
  await exploreButton.click();
  await page.waitForTimeout(5000);

  const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
  await chevron.click();
  await page.waitForTimeout(1000);

  const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
  await runtimeMergeItem.click();
  await page.waitForTimeout(5000);
}

async function selectFirstLeafNode(page) {
  const coords = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    if (!engine) return null;

    const data = engine.getData();
    const camera = engine.getCamera();

    const findLeaf = (nodes: any[]): any | null => {
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          const child = findLeaf(node.children);
          if (child) {
            return child;
          }
        } else {
          return node;
        }
      }
      return null;
    };

    const target = findLeaf(data.nodes);
    if (!target) {
      return null;
    }

    const centerX = target.x + target.width / 2;
    const centerY = target.y + target.height / 2;
    const screenX = (centerX - camera.x) * camera.zoom;
    const screenY = (centerY - camera.y) * camera.zoom;

    return {
      screenX,
      screenY,
      nodeId: target.GUID ?? target.id
    };
  });

  if (!coords) {
    throw new Error('Could not locate a leaf node to select');
  }

  const canvas = page.locator('canvas.full-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas bounding box not available');
  }

  await page.mouse.click(box.x + coords.screenX, box.y + coords.screenY);
  await page.waitForTimeout(500);

  return coords.nodeId;
}

test.describe('Runtime Overlay Styling', () => {
  test('preserves node styling when containment toggles', async ({ page }) => {
    await navigateToRuntimeMerge(page);
    const targetNodeId = await selectFirstLeafNode(page);

    // Open node style panel via keyboard shortcut (Alt+S)
    await page.keyboard.press('Alt+KeyS');

    const stylePanel = page.locator('.node-style-panel.visible');
    await expect(stylePanel).toBeVisible();

    const fillInput = stylePanel.locator('.style-row .hex-input').first();
    const newColor = '#ff33aa';
    await fillInput.fill(newColor);
    await fillInput.press('Enter');
    await page.waitForTimeout(1000);

    // Toggle containment OFF and ON
    const layoutIcon = page.locator('[data-debug="button-layout"]');
    await layoutIcon.click();
    await page.waitForTimeout(1000);

    const containmentToggle = page.locator('#containment-toggle');
    const toggleLabel = page.locator('label[for="containment-toggle"]');

    await toggleLabel.click();
    await page.waitForTimeout(3000);
    await toggleLabel.click();
    await page.waitForTimeout(3000);

    // Verify containment toggle returned to ON
    await expect(containmentToggle).toBeChecked();

    // Validate style persisted on node via engine data
    const nodeStyle = await page.evaluate(({ nodeId }) => {
      const engine = (window as any).__canvasEngine;
      if (!engine) return null;
      const data = engine.getData();

      const findNode = (nodes: any[]): any | null => {
        for (const node of nodes) {
          if ((node.GUID ?? node.id) === nodeId) {
            return node;
          }
          if (node.children && node.children.length > 0) {
            const found = findNode(node.children);
            if (found) return found;
          }
        }
        return null;
      };

      const target = findNode(data.nodes);
      if (!target) return null;

      return {
        fill: target.style.fill,
        overrideFill: target.metadata?.styleOverrides?.fill
      };
    }, { nodeId: targetNodeId });

    expect(nodeStyle).not.toBeNull();
    expect(nodeStyle?.fill?.toLowerCase()).toBe(newColor);
    expect(nodeStyle?.overrideFill?.toLowerCase()).toBe(newColor);
  });
});
