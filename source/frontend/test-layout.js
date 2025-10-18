// Quick test to verify layout positions
const fs = require('fs');

// Simple test data - two children that should be at different positions
const testData = {
  entities: [
    {
      id: 'parent-1',
      labels: ['Container'],
      properties: {
        GUID: 'parent-1',
        name: 'Parent Container',
        type: 'container',
        x: 0,
        y: 0,
        width: 500,
        height: 500
      }
    },
    {
      id: 'child-2',
      labels: ['Service'],
      properties: {
        GUID: 'child-2',
        name: 'Service A',
        type: 'service',
        x: 48,
        y: 48,
        width: 200,
        height: 150
      }
    },
    {
      id: 'child-3',
      labels: ['Service'],
      properties: {
        GUID: 'child-3',
        name: 'Service B',
        type: 'service',
        x: 48,
        y: 320,
        width: 200,
        height: 150
      }
    }
  ],
  relationships: [
    {
      type: 'CONTAINS',
      source: 'parent-1',
      target: 'child-2',
      properties: {}
    },
    {
      type: 'CONTAINS',
      source: 'parent-1',
      target: 'child-3',
      properties: {}
    }
  ]
};

console.log('Test data created:');
console.log('  child-2 should be at (48, 48)');
console.log('  child-3 should be at (48, 320)');
console.log('');
console.log('POST this to http://localhost:3030/api/canvas/layout');
console.log('with engine: containment-runtime');
console.log('');
console.log(JSON.stringify(testData, null, 2));
