import { test, expect } from '@playwright/test';

test('per-node flatten config persists through save/load', async ({ page }) => {
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

  // Set to flat
  const containmentSelect = nodeSection.locator('select').nth(0);
  await containmentSelect.selectOption('flat');
  await page.waitForTimeout(3000);

  // Check CONTAINS edges before save
  const beforeSave = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    const data = engine?.getData();
    const edges = data?.edges || [];
    return edges.filter((e: any) =>
      e.label?.toUpperCase() === 'CONTAINS' || e.metadata?.relationType?.toUpperCase() === 'CONTAINS'
    ).length;
  });

  console.log('Before save - CONTAINS edges:', beforeSave);
  expect(beforeSave).toBeGreaterThan(0);

  // Save layout
  const saveButton = page.getByRole('button', { name: /save layout/i });
  await saveButton.click();
  await page.waitForTimeout(2000);

  // Reload page
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Navigate back to same view
  await exploreButton.click();
  await page.waitForTimeout(3000);
  await chevron.click();
  await page.waitForTimeout(1000);
  await runtimeMergeItem.click();
  await page.waitForTimeout(5000);

  // Check CONTAINS edges after reload
  const afterReload = await page.evaluate(() => {
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

  console.log('After reload - CONTAINS edges:', afterReload.count, afterReload.list);

  // CONTAINS edges should persist
  expect(afterReload.count).toBe(beforeSave);
  expect(afterReload.count).toBeGreaterThan(0);

  console.log('\n✅ Per-node configs and CONTAINS edges persist through save/load');
});
