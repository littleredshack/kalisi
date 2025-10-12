import {
  LayoutGraph,
  LayoutNode,
  LayoutEdge,
  RawEntity,
  RawRelationship,
  RawDataInput
} from '../core/layout-contract';

/**
 * Utility functions for processing raw data into LayoutGraph structures
 * Extracted from legacy transformer services to enable runtime engines
 * to handle initial data loading
 */

interface NodeSize {
  width: number;
  height: number;
}

/**
 * Get default node dimensions based on entity type
 */
export function getDefaultNodeSize(type: string): NodeSize {
  const sizes: Record<string, NodeSize> = {
    'container': { width: 200, height: 120 },
    'folder': { width: 200, height: 120 },
    'frontend': { width: 200, height: 120 },
    'node': { width: 160, height: 80 },
    'component': { width: 120, height: 60 },
    'file': { width: 120, height: 60 }
  };
  return sizes[type] || sizes['node'];
}

/**
 * Extract GUID from entity (handles multiple property formats)
 */
function extractGUID(entity: RawEntity): string | undefined {
  const props = entity.properties || {};
  return (props as any)['GUID'] || (entity as any)['GUID'] || entity.id;
}

/**
 * Extract entity type from entity properties
 */
function extractType(entity: RawEntity): string {
  const props = entity.properties || {};
  return (props as any)['type'] || entity.type || 'node';
}

/**
 * Extract entity name for display
 */
function extractName(entity: RawEntity): string {
  return entity.name || entity.id;
}

/**
 * Build hierarchy from CONTAINS relationships
 * Returns map of nodeId -> array of child IDs
 */
function buildParentChildMap(relationships: ReadonlyArray<RawRelationship>): Map<string, string[]> {
  const parentChildMap = new Map<string, string[]>();
  const childToParent = new Map<string, string>();

  relationships.forEach(rel => {
    if (rel.type === 'CONTAINS') {
      const parentGUID = (rel as any).fromGUID || rel.source;
      const childGUID = (rel as any).toGUID || rel.target;

      if (!parentChildMap.has(parentGUID)) {
        parentChildMap.set(parentGUID, []);
      }
      parentChildMap.get(parentGUID)!.push(childGUID);
      childToParent.set(childGUID, parentGUID);
    }
  });

  return parentChildMap;
}

/**
 * Find root node IDs (nodes with no parent in CONTAINS relationships)
 */
function findRootNodeIds(
  nodeIds: Set<string>,
  relationships: ReadonlyArray<RawRelationship>
): string[] {
  const childIds = new Set<string>();

  relationships.forEach(rel => {
    if (rel.type === 'CONTAINS') {
      const childGUID = (rel as any).toGUID || rel.target;
      childIds.add(childGUID);
    }
  });

  return Array.from(nodeIds).filter(id => !childIds.has(id));
}

/**
 * Process raw entities and relationships into a LayoutGraph
 * This is the core transformation used by runtime engines
 */
export function processRawDataToGraph(input: RawDataInput): LayoutGraph {
  const nodes: Record<string, LayoutNode> = {};
  const edges: Record<string, LayoutEdge> = {};
  const nodeIds = new Set<string>();

  // Phase 1: Transform entities to layout nodes
  input.entities.forEach(entity => {
    const guid = extractGUID(entity);
    if (!guid || guid === 'test-modular-root') {
      return; // Skip invalid or test nodes
    }

    const type = extractType(entity);
    const name = extractName(entity);
    const size = getDefaultNodeSize(type);

    nodeIds.add(guid);
    nodes[guid] = {
      id: guid,
      label: name,
      type,
      geometry: {
        x: 0,
        y: 0,
        width: size.width,
        height: size.height
      },
      state: {
        collapsed: false,
        visible: true,
        selected: false
      },
      metadata: {
        ...entity.properties,
        rawEntity: entity
      },
      children: [],
      edges: []
    };
  });

  // Phase 2: Build hierarchy from CONTAINS relationships
  const parentChildMap = buildParentChildMap(input.relationships);
  parentChildMap.forEach((childIds, parentId) => {
    if (nodes[parentId]) {
      nodes[parentId] = {
        ...nodes[parentId],
        children: childIds.filter(childId => nodes[childId]) // Only include valid children
      };
    }
  });

  // Phase 3: Create edges from non-CONTAINS relationships
  input.relationships.forEach(rel => {
    if (rel.type !== 'CONTAINS') {
      const fromGUID = (rel as any).fromGUID || rel.source;
      const toGUID = (rel as any).toGUID || rel.target;

      // Only create edge if both nodes exist
      if (nodes[fromGUID] && nodes[toGUID]) {
        const edgeId = rel.id || `edge-${fromGUID}-${toGUID}`;
        edges[edgeId] = {
          id: edgeId,
          from: fromGUID,
          to: toGUID,
          label: rel.type,
          metadata: {
            ...rel.properties,
            relationType: rel.type,
            rawRelationship: rel
          }
        };

        // Update node edge references
        nodes[fromGUID] = {
          ...nodes[fromGUID],
          edges: [...nodes[fromGUID].edges, edgeId]
        };
        nodes[toGUID] = {
          ...nodes[toGUID],
          edges: [...nodes[toGUID].edges, edgeId]
        };
      }
    }
  });

  // Phase 4: Find root nodes
  const rootIds = findRootNodeIds(nodeIds, input.relationships);

  return {
    nodes,
    edges,
    metadata: {
      rootIds,
      layoutVersion: 1
    }
  };
}

/**
 * Validate that a raw data input is well-formed
 */
export function validateRawData(input: RawDataInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.entities || input.entities.length === 0) {
    errors.push('No entities provided');
  }

  if (!input.relationships) {
    errors.push('No relationships provided');
  }

  // Check for entities without GUIDs
  const missingGUIDs = input.entities.filter(e => !extractGUID(e));
  if (missingGUIDs.length > 0) {
    errors.push(`${missingGUIDs.length} entities missing GUID`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
