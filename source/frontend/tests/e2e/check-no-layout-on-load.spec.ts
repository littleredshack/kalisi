import { test, expect } from '@playwright/test';

test('verify no layout runs after loading saved positions', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[RuntimeCanvas]') || text.includes('[LayoutRuntime]')) {
      logs.push(text);
      console.log('BROWSER:', text);
    }
  });

  await page.goto('https://localhost:8443', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const exploreButton = page.getByRole('button', { name: /explore/i });
  await exploreButton.click();
  await page.waitForTimeout(5000);

  const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
  await chevron.click();
  await page.waitForTimeout(1000);

  const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
  await runtimeMergeItem.click();
  await page.waitForTimeout(6000);

  console.log('\n=== CHECKING LOGS ===\n');

  // Find the "Snapshot loaded" log
  const snapshotLoadedIndex = logs.findIndex(log => log.includes('Snapshot loaded, positions should be preserved'));

  if (snapshotLoadedIndex === -1) {
    console.log('ERROR: Snapshot loaded log not found');
    throw new Error('Snapshot not loaded');
  }

  // Check if runLayout was called AFTER snapshot loaded
  const logsAfterSnapshot = logs.slice(snapshotLoadedIndex + 1);
  const layoutCalledAfter = logsAfterSnapshot.filter(log => log.includes('runLayout called'));

  console.log('\n=== RESULT ===');
  console.log('Logs after snapshot loaded:', logsAfterSnapshot.length);
  console.log('runLayout calls after snapshot:', layoutCalledAfter.length);

  if (layoutCalledAfter.length === 0) {
    console.log('✅ SUCCESS: No runLayout calls after loading saved positions');
  } else {
    console.log('❌ FAIL: runLayout was called', layoutCalledAfter.length, 'times after loading');
    layoutCalledAfter.forEach((log, i) => {
      console.log(`  ${i + 1}.`, log);
    });
  }

  expect(layoutCalledAfter.length).toBe(0);
});
