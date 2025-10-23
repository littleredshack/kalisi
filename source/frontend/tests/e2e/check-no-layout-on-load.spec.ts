import { test, expect } from '@playwright/test';

test('debug: trace unwanted layout calls after load', async ({ page }) => {
  const layoutCalls: Array<{ time: number; reason: string; stack?: string }> = [];
  let initCompleteTime = 0;

  page.on('console', msg => {
    const text = msg.text();

    if (text.includes('[Init] Final snapshot edges')) {
      initCompleteTime = Date.now();
      console.log('✓ Init completed at:', initCompleteTime);
    }

    if (text.includes('[LayoutRuntime] runLayout called')) {
      const match = text.match(/reason: (\w+)/);
      layoutCalls.push({
        time: Date.now(),
        reason: match ? match[1] : 'unknown'
      });
    }
  });

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
  await page.waitForTimeout(6000); // Wait for everything to settle

  console.log('\n=== LAYOUT CALLS DURING LOAD ===');
  layoutCalls.forEach(call => {
    const afterInit = initCompleteTime > 0 ? (call.time - initCompleteTime) : 'N/A';
    console.log(`Reason: ${call.reason}, Time after init: ${afterInit}ms`);
  });

  // Check for unwanted layout calls
  const layoutsAfterInit = layoutCalls.filter((call, idx) => {
    return initCompleteTime > 0 && call.time > initCompleteTime + 100;
  });

  console.log('\n=== ANALYSIS ===');
  console.log('Total layout calls:', layoutCalls.length);
  console.log('Layouts AFTER init complete:', layoutsAfterInit.length);

  if (layoutsAfterInit.length > 0) {
    console.log('\n❌ UNWANTED LAYOUT CALLS AFTER INIT:');
    layoutsAfterInit.forEach(call => {
      console.log(`  - Reason: ${call.reason}`);
    });
  }

  // Should only have initial layout, nothing after
  expect(layoutsAfterInit.length).toBe(0);
});
