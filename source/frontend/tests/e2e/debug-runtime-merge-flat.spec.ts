import { test, expect } from '@playwright/test';

test('check Runtime Merge flat layout and ViewGraph', async ({ page }) => {
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
  await page.waitForTimeout(6000);

  // Get ViewGraph data
  const viewGraphData = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    const viewGraph = engine?.getLayoutRuntime()?.viewGraph;

    return {
      nodeCount: viewGraph?.nodes?.length || 0,
      edgeCount: viewGraph?.edges?.length || 0,
      nodes: viewGraph?.nodes?.map((n: any) => ({
        id: n.id,
        GUID: n.GUID,
        text: n.text,
        x: n.x,
        y: n.y,
        childrenCount: n.children?.length || 0
      })) || [],
      edges: viewGraph?.edges?.map((e: any) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        label: e.label
      })) || [],
      displayMode: viewGraph?.metadata?.displayMode
    };
  });

  console.log('\n=== ViewGraph Structure ===');
  console.log(JSON.stringify(viewGraphData, null, 2));

  console.log('\n✅ Check /workspace/source/logs/gateway-debug.log for database response');

  // Take screenshot
  await page.screenshot({ path: '/workspace/source/logs/runtime-merge-flat-screenshot.png', fullPage: true });
  console.log('\n📸 Screenshot saved to /workspace/source/logs/runtime-merge-flat-screenshot.png');
});
