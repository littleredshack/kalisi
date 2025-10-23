import { test, expect } from '@playwright/test';

test('debug save/load positions for flattened nodes', async ({ page }) => {
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

  // Open layout panel and flatten Node 1
  await page.keyboard.press('Alt+L');
  await page.waitForTimeout(500);

  const canvas = page.locator('canvas.full-canvas');
  await canvas.click({ position: { x: 250, y: 200 } });
  await page.waitForTimeout(1500);

  const nodeSection = page.locator('.section-node');
  await expect(nodeSection).toBeVisible({ timeout: 5000 });

  const containmentSelect = nodeSection.locator('select').nth(0);
  await containmentSelect.selectOption('flat');
  await page.waitForTimeout(3000);

  // Get initial positions in metadata
  const initialPositions = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    const data = engine?.getData();
    const flatNode = data?.nodes.find((n: any) => n.metadata?.perNodeFlattened);
    const flatChildren = flatNode?.metadata?.flattenedChildren || [];
    return flatChildren.map((c: any) => ({ id: c.GUID || c.id, x: c.x, y: c.y }));
  });

  console.log('\n1. INITIAL metadata.flattenedChildren positions:', JSON.stringify(initialPositions, null, 2));

  // Move first child to obvious custom position
  await canvas.click({ position: { x: 300, y: 250 } }); // Click child
  await page.waitForTimeout(500);

  // Drag to custom position
  await canvas.dragTo(canvas, {
    sourcePosition: { x: 300, y: 250 },
    targetPosition: { x: 800, y: 400 }
  });
  await page.waitForTimeout(1000);

  // Get positions BEFORE save
  const beforeSave = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    const data = engine?.getData();
    const flatNode = data?.nodes.find((n: any) => n.metadata?.perNodeFlattened);
    const flatChildren = flatNode?.metadata?.flattenedChildren || [];
    return flatChildren.map((c: any) => ({ id: c.GUID || c.id, x: c.x, y: c.y }));
  });

  console.log('\n2. BEFORE SAVE metadata.flattenedChildren positions:', JSON.stringify(beforeSave, null, 2));

  // Save
  const saveButton = page.getByRole('button', { name: /save layout/i });
  await saveButton.click();
  await page.waitForTimeout(2000);

  // Reload page
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Navigate back
  await exploreButton.click();
  await page.waitForTimeout(3000);
  await chevron.click();
  await page.waitForTimeout(1000);
  await runtimeMergeItem.click();
  await page.waitForTimeout(5000);

  // Get positions AFTER reload
  const afterReload = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    const data = engine?.getData();
    const flatNode = data?.nodes.find((n: any) => n.metadata?.perNodeFlattened);
    const flatChildren = flatNode?.metadata?.flattenedChildren || [];
    return flatChildren.map((c: any) => ({ id: c.GUID || c.id, x: c.x, y: c.y }));
  });

  console.log('\n3. AFTER RELOAD metadata.flattenedChildren positions:', JSON.stringify(afterReload, null, 2));

  // Compare
  console.log('\n=== ANALYSIS ===');
  console.log('Positions changed after drag:', JSON.stringify(beforeSave) !== JSON.stringify(initialPositions));
  console.log('Positions preserved after reload:', JSON.stringify(afterReload) === JSON.stringify(beforeSave));

  if (JSON.stringify(afterReload) !== JSON.stringify(beforeSave)) {
    console.log('\n❌ POSITIONS LOST!');
    console.log('Expected:', beforeSave);
    console.log('Got:', afterReload);
  } else {
    console.log('\n✅ Positions preserved correctly');
  }

  // Assertion
  expect(beforeSave[0].x).not.toBe(initialPositions[0].x); // Should have moved
  expect(afterReload[0].x).toBe(beforeSave[0].x); // Should be preserved
});
