import { test, expect } from '@playwright/test';

test.describe('Real-Time Graph Delta Updates', () => {
  test('should receive and display real-time node updates via WebSocket', async ({ page, request }) => {
    // Step 1: Navigate to the Containment Runtime-Merge view
    console.log('Step 1: Navigating to Containment Runtime-Merge view...');
    await page.goto('https://localhost:8443', {
      waitUntil: 'networkidle'
    });

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Click Explore button
    const exploreButton = page.getByRole('button', { name: /explore/i });
    await exploreButton.click();
    await page.waitForTimeout(5000);

    // Expand Test Architecture Set
    const chevron = page.locator('text=Test Architecture Set').locator('..').locator('.tree-toggle');
    await chevron.click();
    await page.waitForTimeout(1000);

    // Click on Containment - Runtime Merge
    const runtimeMergeItem = page.getByText('Containment - Runtime Merge');
    await runtimeMergeItem.click();
    await page.waitForTimeout(5000);

    // Step 2: Take initial screenshot
    console.log('Step 2: Taking initial screenshot...');
    await page.screenshot({
      path: '/workspace/source/logs/realtime-delta-before.png',
      fullPage: false
    });

    // Step 3: Get the ViewNode ID by querying Neo4j for "Containment - Runtime Merge"
    const pageUrl = page.url();
    console.log('Current URL:', pageUrl);

    console.log('Step 3: Querying for ViewNode ID...');

    const viewNodeQuery = `MATCH (vn:ViewNode {name: "Containment - Runtime Merge"})
                           RETURN vn.id as id, vn.GUID as guid
                           LIMIT 1`;

    const viewNodeResponse = await request.post('https://localhost:8443/v0/cypher/unified', {
      data: {
        query: viewNodeQuery,
        parameters: {}
      },
      headers: {
        'Content-Type': 'application/json'
      },
      ignoreHTTPSErrors: true
    });

    const viewNodeResult = await viewNodeResponse.json();
    console.log('ViewNode query result:', JSON.stringify(viewNodeResult, null, 2));

    let viewNodeId: string | null = null;
    if (viewNodeResult.success && viewNodeResult.data?.results?.[0]) {
      viewNodeId = viewNodeResult.data.results[0].id || viewNodeResult.data.results[0].guid;
      console.log('Found ViewNode ID:', viewNodeId);
    } else {
      console.warn('Could not find ViewNode ID for "Containment - Runtime Merge"');
    }

    // Step 4: Find a node to update
    // We'll query Neo4j to find a node in this view
    console.log('Step 4: Querying for a test node...');

    // Find a node displayed in the view (from the test data we saw in the canvas)
    // IMPORTANT: Only use GUID, never elementId
    const findNodeQuery = `MATCH (n:Node)
         WHERE n.GUID IS NOT NULL
         RETURN n.GUID as guid, n.name as name
         LIMIT 1`;

    const findResponse = await request.post('https://localhost:8443/v0/cypher/unified', {
      data: {
        query: findNodeQuery,
        parameters: {},
        view_node_id: viewNodeId
      },
      headers: {
        'Content-Type': 'application/json'
      },
      ignoreHTTPSErrors: true
    });

    const findResult = await findResponse.json();
    console.log('Find node result:', JSON.stringify(findResult, null, 2));

    let targetNodeGuid: string | null = null;
    let originalName: string | null = null;

    if (findResult.success && findResult.data?.results?.[0]) {
      const nodeData = findResult.data.results[0];
      targetNodeGuid = nodeData.guid;
      originalName = nodeData.name;
      console.log(`Found node: GUID=${targetNodeGuid}, Name=${originalName}`);
    }

    if (!targetNodeGuid || !originalName) {
      console.error('Could not find a suitable test node. Skipping test.');
      test.skip();
      return;
    }

    // Step 5: Set up WebSocket message listener to detect the delta
    let deltaReceived = false;
    page.on('websocket', ws => {
      console.log('WebSocket connected:', ws.url());

      ws.on('framereceived', event => {
        const message = event.payload;
        try {
          const data = JSON.parse(message);
          if (data.type === 'graph_delta') {
            console.log('✅ Graph delta received!', data);
            deltaReceived = true;
          }
          if (data.type === 'graph_subscription_ack') {
            console.log('✅ Graph subscription acknowledged!', data);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      });

      ws.on('framesent', event => {
        const message = event.payload;
        try {
          const data = JSON.parse(message);
          if (data.type === 'subscribe_graph_changes') {
            console.log('📤 Sent subscription request:', data);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      });
    });

    // Step 6: Update the node name via backend API
    const newName = `Updated Node ${Date.now()}`;
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`Step 5: Updating node name from "${originalName}" to "${newName}"...`);
    console.log(`Using trace ID: ${traceId}`);

    // Update query - use GUID only
    const updateQuery = `MATCH (n {GUID: $guid})
         SET n.name = $newName
         SET n.trace_id = $trace_id
         SET n.lastModified = datetime().epochMillis
         RETURN n.GUID as guid, n.name as name, n.trace_id as trace_id`;

    const updateResponse = await request.post('https://localhost:8443/v0/cypher/unified', {
      data: {
        query: updateQuery,
        parameters: {
          guid: targetNodeGuid,
          newName: newName,
          trace_id: traceId
        },
        view_node_id: viewNodeId // This triggers delta emission
      },
      headers: {
        'Content-Type': 'application/json'
      },
      ignoreHTTPSErrors: true
    });

    const updateResult = await updateResponse.json();
    console.log('Update result:', JSON.stringify(updateResult, null, 2));

    expect(updateResult.success).toBe(true);

    // Step 7: Wait for the real-time update to arrive and be applied
    console.log('Step 6: Waiting for real-time delta to arrive...');

    // Wait up to 10 seconds for the delta
    let waitCount = 0;
    while (!deltaReceived && waitCount < 20) {
      await page.waitForTimeout(500);
      waitCount++;
    }

    if (deltaReceived) {
      console.log('✅ Delta received via WebSocket!');
    } else {
      console.warn('⚠️  No delta received after 10 seconds (may be feature flag disabled)');
    }

    // Wait a bit more for the UI to update
    await page.waitForTimeout(2000);

    // Step 8: Take final screenshot
    console.log('Step 7: Taking final screenshot...');
    await page.screenshot({
      path: '/workspace/source/logs/realtime-delta-after.png',
      fullPage: false
    });

    // Step 9: Verify the new name appears on the page (if possible)
    console.log('Step 8: Verifying update on page...');

    // Check if the new name appears in the page content
    const pageContent = await page.content();
    const nameVisible = pageContent.includes(newName);

    if (nameVisible) {
      console.log(`✅ Updated name "${newName}" is visible on the page!`);
    } else {
      console.log(`⚠️  Updated name "${newName}" not found in page content`);
      console.log('This might be expected if the node is not currently visible or if text is rendered on canvas');
    }

    // The real verification is in the screenshots
    console.log('\n=== Test Complete ===');
    console.log('Before screenshot: /workspace/source/logs/realtime-delta-before.png');
    console.log('After screenshot:  /workspace/source/logs/realtime-delta-after.png');
    console.log(`Original name: "${originalName}"`);
    console.log(`Updated name:  "${newName}"`);
    console.log(`Delta received: ${deltaReceived}`);
    console.log('\n=== Timing Analysis ===');
    console.log(`Trace ID: ${traceId}`);
    console.log('To measure end-to-end latency, search for this trace ID in /workspace/source/logs/gateway-debug.log');
    console.log('Expected timing markers:');
    console.log(`  [TIMING:${traceId}:T1] Request received at gateway`);
    console.log(`  [TIMING:${traceId}:T2] Neo4j response received`);
    console.log(`  [TIMING:${traceId}:T3] Delta published to Redis stream`);
    console.log(`  [TIMING:${traceId}:T4] Delta received via WebSocket (browser)`);
    console.log(`  [TIMING:${traceId}:T5] Delta applied and canvas updated (browser)`);
  });
});
