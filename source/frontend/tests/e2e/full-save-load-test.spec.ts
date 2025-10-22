import { test } from '@playwright/test';

test('full save/load cycle preserves positions', async ({ page }) => {
  const savedPositions: any[] = [];
  const loadedPositions: any[] = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('SAVE - Preparing') && text.includes('Sample node 0:')) {
      const match = text.match(/Sample node 0: ({.*})/);
      if (match) {
        savedPositions.push(match[1]);
        console.log('SAVED POSITION:', match[1]);
      }
    }
    if (text.includes('Node 0 now:') && text.includes('After setData')) {
      const match = text.match(/Node 0 now: ({.*})/);
      if (match) {
        loadedPositions.push(match[1]);
        console.log('LOADED POSITION:', match[1]);
      }
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

  // Try to find and click save - properties panel might be visible
  const saveButton = page.getByRole('button', { name: /save layout/i });
  const canSave = await saveButton.isVisible().catch(() => false);

  if (canSave) {
    await saveButton.click();
    await page.waitForTimeout(3000);
    console.log('\n=== SAVE CLICKED ===\n');

    // Reload
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await exploreButton.click();
    await page.waitForTimeout(5000);
    await chevron.click();
    await page.waitForTimeout(1000);
    await runtimeMergeItem.click();
    await page.waitForTimeout(6000);

    console.log('\n=== COMPARISON ===');
    console.log('Saved:', savedPositions[0] || 'none');
    console.log('Loaded:', loadedPositions[loadedPositions.length - 1] || 'none');
  } else {
    console.log('=== Save button not visible, checking load only ===');
    console.log('Loaded position:', loadedPositions[0] || 'none');
  }
});
