import { test, expect } from '@playwright/test';

test('debug duplicate children on load', async ({ page }) => {
  // Listen to console logs
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log('[BROWSER]', text);
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
  await page.waitForTimeout(3000);

  // IMMEDIATELY after load, check ViewGraph
  const loadResults = await page.evaluate(() => {
    const engine = (window as any).__canvasEngine;
    const viewGraph = engine?.layoutRuntime?.viewGraph;
    const layoutVersion = engine?.layoutRuntime?.store?.current?.graph?.version;

    const node1 = viewGraph?.nodes?.find((n: any) => n.GUID === 'parent-1');

    return {
      node1ChildrenCount: node1?.children?.length || 0,
      node1ChildrenGUIDs: (node1?.children || []).map((c: any) => c.GUID || c.id),
      layoutVersion: layoutVersion || 'unknown',
      hasPerNodeFlattened: node1?.metadata?.perNodeFlattened || false,
      hasFlattenedChildren: !!(node1?.metadata?.flattenedChildren)
    };
  });

  console.log('\n=== VIEWGRAPH STATE IMMEDIATELY AFTER LOAD ===');
  console.log('Node 1 children count:', loadResults.node1ChildrenCount);
  console.log('Node 1 children GUIDs:', loadResults.node1ChildrenGUIDs);
  console.log('Layout version:', loadResults.layoutVersion);
  console.log('Has perNodeFlattened:', loadResults.hasPerNodeFlattened);
  console.log('Has flattenedChildren metadata:', loadResults.hasFlattenedChildren);

  // Count unique GUIDs
  const uniqueGUIDs = new Set(loadResults.node1ChildrenGUIDs);
  console.log('Unique children:', uniqueGUIDs.size);
  console.log('Duplicate count:', loadResults.node1ChildrenCount - uniqueGUIDs.size);

  // Check if any layout-related logs appeared
  const layoutLogs = consoleLogs.filter(log =>
    log.includes('runLayout') ||
    log.includes('applyLayoutResult') ||
    log.includes('layoutGraphToHierarchical')
  );

  console.log('\n=== LAYOUT ACTIVITY ===');
  if (layoutLogs.length > 0) {
    console.log('Layout was triggered!');
    layoutLogs.forEach(log => console.log('  -', log));
  } else {
    console.log('No layout activity detected');
  }

  // Database has 4 children (1 child-1 + 3x grandchild-1)
  // Expected: ViewGraph should also have 4 (corrupted data loaded as-is)
  // OR: If deduplication happened, we'd see 2 (child-1 + 1x grandchild-1)

  console.log('\n=== ANALYSIS ===');
  if (loadResults.node1ChildrenCount === 4) {
    console.log('✅ Database duplicates PRESERVED in ViewGraph (as-is load)');
  } else if (loadResults.node1ChildrenCount === 2) {
    console.log('⚠️  Duplicates were REMOVED during load (deduplication happened)');
  } else {
    console.log('❓ Unexpected count:', loadResults.node1ChildrenCount);
  }

  if (loadResults.layoutVersion > 1) {
    console.log('⚠️  Layout RAN after load (version > 1)');
  } else {
    console.log('✅ Layout did NOT run (version = 1)');
  }
});
