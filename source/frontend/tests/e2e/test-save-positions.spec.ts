import { test } from '@playwright/test';

test('trace runLayout calls on load', async ({ page }) => {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[RuntimeCanvas]') || text.includes('[LayoutRuntime]')) {
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
  await page.waitForTimeout(8000);

  console.log('=== Test complete - check logs above for runLayout calls ===');
});
