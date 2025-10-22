import { test, expect } from '@playwright/test';

test('per-node containment shows CONTAINS edges', async ({ page }) => {
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

  // Screenshot BEFORE
  await page.screenshot({ path: 'test-results/before-per-node-flatten.png', fullPage: true });

  // Open layout panel FIRST
  await page.keyboard.press('Alt+L');
  await page.waitForTimeout(500);

  // Click to select a node with children
  const canvas = page.locator('canvas.full-canvas');
  await canvas.click({ position: { x: 250, y: 200 } });
  await page.waitForTimeout(1500);

  const nodeSection = page.locator('.section-node');
  await expect(nodeSection).toBeVisible({ timeout: 5000 });

  // Change to flat
  const containmentSelect = nodeSection.locator('select').nth(0);
  await containmentSelect.selectOption('flat');
  await page.waitForTimeout(3000);

  // Screenshot AFTER
  await page.screenshot({ path: 'test-results/after-per-node-flatten.png', fullPage: true });

  // Check results
  const result = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    if (!engine) return { error: 'No engine' };

    const data = engine.getData();
    if (!data) return { error: 'No data' };

    // Find nodes with perNodeFlattened metadata
    const findFlattenedNode = (nodes: any[]): any => {
      for (const n of nodes) {
        if (n.metadata?.perNodeFlattened) return n;
        if (n.children?.length > 0) {
          const found = findFlattenedNode(n.children);
          if (found) return found;
        }
      }
      return null;
    };

    const flattenedNode = findFlattenedNode(data.nodes);

    const edges = data.edges || [];
    const containsEdges = edges.filter((e: any) => {
      const label = e.label?.toUpperCase();
      const relType = e.metadata?.relationType?.toUpperCase();
      return label === 'CONTAINS' || relType === 'CONTAINS';
    });

    return {
      generatedEdges: flattenedNode?.metadata?.generatedEdges,
      totalEdges: edges.length,
      containsEdges: containsEdges.length,
      edgeList: containsEdges.map((e: any) => `${e.from}->${e.to}`)
    };
  });

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  // We should have CONTAINS edges
  expect(result.containsEdges).toBeGreaterThan(0);

  console.log('\n✅ CONTAINS edges found:', result.edgeList);
  console.log('\n📸 Screenshots saved to test-results/');
});
