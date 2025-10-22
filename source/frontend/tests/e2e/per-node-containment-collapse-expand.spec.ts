import { test, expect } from '@playwright/test';

test('per-node containment preserves CONTAINS edges after collapse/expand', async ({ page }) => {
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

  // Open layout panel and select node
  await page.keyboard.press('Alt+L');
  await page.waitForTimeout(500);

  const canvas = page.locator('canvas.full-canvas');
  await canvas.click({ position: { x: 250, y: 200 } });
  await page.waitForTimeout(1500);

  const nodeSection = page.locator('.section-node');
  await expect(nodeSection).toBeVisible({ timeout: 5000 });

  // Change to flat
  const containmentSelect = nodeSection.locator('select').nth(0);
  await containmentSelect.selectOption('flat');
  await page.waitForTimeout(3000);

  // Check edges after flattening
  const afterFlatten = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    const data = engine?.getData();
    const edges = data?.edges || [];
    return edges.filter((e: any) =>
      e.label?.toUpperCase() === 'CONTAINS' || e.metadata?.relationType?.toUpperCase() === 'CONTAINS'
    ).length;
  });

  expect(afterFlatten).toBeGreaterThan(0);
  console.log('✅ After flatten:', afterFlatten, 'CONTAINS edges');

  // Double-click to collapse
  await canvas.dblclick({ position: { x: 250, y: 200 } });
  await page.waitForTimeout(2000);

  // Double-click to expand
  await canvas.dblclick({ position: { x: 250, y: 200 } });
  await page.waitForTimeout(3000);

  // Check edges after expand
  const afterExpand = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    const data = engine?.getData();
    const edges = data?.edges || [];
    const containsEdges = edges.filter((e: any) =>
      e.label?.toUpperCase() === 'CONTAINS' || e.metadata?.relationType?.toUpperCase() === 'CONTAINS'
    );
    return {
      count: containsEdges.length,
      list: containsEdges.map((e: any) => `${e.from}->${e.to}`)
    };
  });

  console.log('✅ After expand:', afterExpand.count, 'CONTAINS edges:', afterExpand.list);

  expect(afterExpand.count).toBe(afterFlatten);
  expect(afterExpand.count).toBeGreaterThan(0);
});
