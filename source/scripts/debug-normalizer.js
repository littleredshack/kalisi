const fs = require('fs');

const containmentTypes = new Set(['CONTAINS', 'HAS_CHILD', 'HAS_COMPONENT', 'PARENT_OF']);

function asRecord(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

function extractGuid(value) {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.GUID ?? value.guid ?? value.id ?? value.toString();
  }
  return undefined;
}

function buildRuntimeGraphSnapshot(input) {
  const nodes = new Map();
  const parentByChild = new Map();

  input.entities.forEach(entity => {
    const properties = asRecord(entity.properties);
    const guid = extractGuid(entity.guid ?? entity.id ?? properties['GUID'] ?? properties['guid'] ?? properties['id']);
    if (!guid) {
      return;
    }

    const parentCandidate =
      entity.parent_guid ??
      entity.parentGuid ??
      entity.parentGUID ??
      entity.parent ??
      properties['parent_guid'] ??
      properties['parentGuid'] ??
      properties['parentGUID'] ??
      properties['parent'];

    nodes.set(guid, {
      guid,
      parentGuid: extractGuid(parentCandidate),
      x: entity.position?.x ?? properties['x'],
      y: entity.position?.y ?? properties['y'],
      width: entity.display?.width,
      height: entity.display?.height
    });
  });

  input.relationships?.forEach(rel => {
    if (!containmentTypes.has(rel.type)) {
      return;
    }
    const from = extractGuid(rel.fromGUID ?? rel.source_guid ?? rel.source);
    const to = extractGuid(rel.toGUID ?? rel.target_guid ?? rel.target);
    if (from && to && nodes.has(to)) {
      parentByChild.set(to, from);
    }
  });

  const rootIds = [];
  nodes.forEach(node => {
    node.parentGuid = parentByChild.get(node.guid) ?? node.parentGuid;
  });

  nodes.forEach(node => {
    if (!node.parentGuid || !nodes.has(node.parentGuid)) {
      rootIds.push(node.guid);
    }
  });

  return { nodes, parentByChild, rootIds };
}

if (require.main === module) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node scripts/debug-normalizer.js <runtime-sample.json>');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const snapshot = buildRuntimeGraphSnapshot(data);
  console.log('Node count:', snapshot.nodes.size);
  console.log('Root count:', snapshot.rootIds.length);
  console.log('Parents:', Array.from(snapshot.parentByChild.entries()));
}
