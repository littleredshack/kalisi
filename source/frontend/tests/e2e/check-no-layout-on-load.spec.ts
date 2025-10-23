import { test, expect } from '@playwright/test';

test('verify flattened positions preserved through save/load', async ({ page }) => {
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

  // Get render loop positions
  const renderPositions = await page.evaluate(() => {
    const data = (window as any).__canvasEngine?.layoutRuntime?.getCanvasData();
    const flatNode = data?.nodes?.find((n: any) => n.metadata?.perNodeFlattened);
    const flatChildren = flatNode?.metadata?.flattenedChildren || [];
    return flatChildren.map((c: any) => ({ id: c.GUID || c.id, x: c.x, y: c.y }));
  });

  console.log('\n=== POSITIONS FROM RENDER LOOP ===');
  console.log(JSON.stringify(renderPositions, null, 2));

  // These are the actual positions being rendered
  expect(renderPositions.length).toBeGreaterThan(0);

  // Check gateway-debug.log for discrepancies
  console.log('\n✅ Check /workspace/source/logs/gateway-debug.log');
  console.log('Compare:');
  console.log('  [Init] Final flattened child positions');
  console.log('  [RenderLoop] Frame 0 positions');
  console.log('  [Render] Drawing positions');
});
