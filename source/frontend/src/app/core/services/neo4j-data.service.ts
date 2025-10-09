import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  TreeTableColumn,
  TreeTableNode,
  TreeTableQueryResult,
  TreeTableValue,
} from '../../shared/tree-table/tree-table.types';
import { TreeTableLayoutResult } from '../../shared/tree-table/tree-table-layout-engine';

// Simple entity model without renderer dependency
interface EntityModel {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  properties?: Record<string, any>;
  parent: string | null;
  children: string[];
  expanded: boolean;
  animating: boolean;
}
// Consolidated Neo4j service - no separate parser needed

// =============================================================================
// NEO4J DATA SERVICE  
// Pure data operations for Neo4j queries and transformations
// =============================================================================

export interface GraphRelationship {
  id: string;
  source: string;
  target: string;
  type: string;
}


@Injectable({
  providedIn: 'root'
})
export class Neo4jDataService {
  
  constructor(
    private http: HttpClient
  ) {}

  private static readonly TREE_TABLE_QUERY_TEMPLATE = `
CALL {
  MATCH (n:CodeElement)
  WHERE n.import_batch IS NOT NULL
  WITH n
  ORDER BY n.updatedAt DESC
  RETURN n.import_batch AS latestBatch
  LIMIT 1
}
WITH {BATCH_EXPR} AS batchId,
     [
       { key: 'calls', label: 'Calls', valueType: 'integer', allowAggregation: true, isDefault: true },
       { key: 'descendants', label: 'Descendants', valueType: 'integer', allowAggregation: true }
     ] AS columns
CALL {
  WITH batchId
  MATCH (root:CodeElement {import_batch: batchId})
  WHERE root.parent_guid IS NULL
  MATCH path = (root)-[:HAS_CHILD*0..]->(node:CodeElement {import_batch: batchId})
  WITH batchId, node, length(path) AS depth
  OPTIONAL MATCH (node)<-[:HAS_CHILD]-(parent:CodeElement {import_batch: batchId})
  OPTIONAL MATCH (node)-[callRel:CALLS]->(:CodeElement {import_batch: batchId})
  WITH batchId, node, depth, parent, count(callRel) AS callCount
  OPTIONAL MATCH (node)-[:HAS_CHILD*1..]->(descendant:CodeElement {import_batch: batchId})
  WITH batchId, node, depth, parent, callCount, count(DISTINCT descendant) AS descendantCount
  RETURN collect({
    guid: node.guid,
    parentGuid: parent.guid,
    label: node.name,
    kind: node.kind,
    language: node.language,
    depth: depth,
    values: {
      calls: { raw: callCount, formatted: toString(callCount) },
      descendants: { raw: descendantCount, formatted: toString(descendantCount) }
    },
    tags: node.labels,
    metadataJson: node.metadata_json,
    batchId: node.import_batch
  }) AS nodes
}
RETURN {
  columns: columns,
  nodes: nodes,
  batchId: batchId,
  generatedAt: toString(datetime())
} AS result
`;

  /**
   * Fetch the flattened tree-table data in the canonical format consumed by
   * the TreeTable layout/renderer stack. If no batch id is supplied we use
   * the most recent import.
   */
  async fetchTreeTable(batchId?: string): Promise<TreeTableLayoutResult> {
    interface UnifiedCypherResponse {
      success: boolean;
      data?: { results?: Array<Record<string, unknown>> };
      message: string;
    }

    const query = Neo4jDataService.buildTreeTableQuery(batchId);
    console.log('[TreeTable] Executing query:', query);

    const response = await firstValueFrom(
      this.http.post<UnifiedCypherResponse>('/v0/cypher/unified', {
        query,
        parameters: {},
      }),
    );

    if (!response.success || !response.data?.results?.length) {
      console.error('[TreeTable] Unified endpoint error', response);
      throw new Error(
        `TreeTable query failed: ${response.message || 'No data returned'}`,
      );
    }

    const row = response.data.results[0] as { result?: TreeTableQueryResult };
    if (!row?.result) {
      throw new Error('TreeTable query did not return a result payload');
    }

    return this.normaliseTreeTableResult(row.result);
  }

  // ViewNode API methods for FR-030 using existing cypher endpoint
  async getAllViewNodes(): Promise<any[]> {
    try {
      const cypherQuery = 'MATCH (vn:ViewNode) RETURN vn ORDER BY vn.name ASC';
      
      const result: any = await firstValueFrom(
        this.http.post('/v0/cypher/unified', { 
          query: cypherQuery,
          parameters: {}
        })
      );
      
      if (result.success && result.data && result.data.results) {
        // Backend returns complete objects with ALL properties - use directly
        const viewNodes = result.data.results.map((record: any) => ({
          ...record.vn.properties
        }));
        
        return viewNodes;
      } else {
        console.error('Failed to fetch ViewNodes:', result.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching ViewNodes:', error);
      return [];
    }
  }

  async executeViewNodeQuery(viewNode: any): Promise<{entities: EntityModel[], relationships: GraphRelationship[]}> {
    console.log('🔍 DEBUG: executeViewNodeQuery for ViewNode:', viewNode.name, viewNode.id);
    try {
      // Get the cypherQuery from the associated QueryNode instead of ViewNode
      const queryToExecute = await this.getQueryFromQueryNode(viewNode);
      console.log('🔍 DEBUG: Query to execute:', queryToExecute);
      
      // Execute the cypherQuery via existing cypher endpoint
      console.log('🔍 DEBUG: Executing query via /v0/cypher/unified');
      const result: any = await firstValueFrom(
        this.http.post('/v0/cypher/unified', {
          query: queryToExecute,
          parameters: {}
        })
      );
      console.log('🔍 DEBUG: Query result:', {success: result.success, resultCount: result.data?.results?.length});
      
      if (result.success && result.data && result.data.results) {
        // Backend now returns clean JSON objects directly
        const cleanNodes: any[] = [];
        const cleanEdges: any[] = [];
        
        // Extract nodes and edges from clean JSON results with deduplication
        const seenNodeIds = new Set<number>();
        const seenEdgeIds = new Set<number>();
        
        result.data.results.forEach((record: any) => {
          Object.values(record).forEach((value: any) => {
            if (value && typeof value === 'object') {
              if (value.labels && value.properties) {
                // Deduplicate nodes by neo4jId
                if (!seenNodeIds.has(value.neo4jId)) {
                  seenNodeIds.add(value.neo4jId);
                  cleanNodes.push(value);
                }
              } else if (value.type && value.startNodeId && value.endNodeId) {
                // Deduplicate edges by neo4jId
                if (!seenEdgeIds.has(value.neo4jId)) {
                  seenEdgeIds.add(value.neo4jId);
                  cleanEdges.push(value);
                }
              }
            }
          });
        });
        
        const canvasData = this.convertToEntityModels(cleanNodes, cleanEdges);
        return canvasData;
      } else {
        console.error('ViewNode query failed:', result.error);
        return { entities: [], relationships: [] };
      }
    } catch (error) {
      console.error('Error executing ViewNode query:', error);
      return { entities: [], relationships: [] };
    }
  }

  async directQuery(entityName: string): Promise<any> {
    const startTime = performance.now();
    console.log(`⏰ CLICK START: ${new Date().toISOString()} - ${startTime}ms`);
    
    // Convert entity name to proper database name
    const dbName = entityName.charAt(0).toUpperCase() + entityName.slice(1);
    
    // Build query
    const cypherQuery = `
      MATCH (root {name: "${dbName}"}) 
      OPTIONAL MATCH (root)-[r:CONTAINS*0..]->(descendant) 
      OPTIONAL MATCH (descendant)-[rel]->(child) 
      RETURN root, descendant, rel, child
    `;
    
    try {
      const result: any = await firstValueFrom(
        this.http.post('/v0/cypher/unified', { 
          query: cypherQuery,
          parameters: {}
        })
      );
      
      // Backend now returns clean JSON objects directly
      const cleanNodes: any[] = [];
      const cleanEdges: any[] = [];
      
      // Extract nodes and edges from clean JSON results
      result.data.results.forEach((record: any) => {
        Object.values(record).forEach((value: any) => {
          if (value && typeof value === 'object') {
            if (value.labels && value.properties) {
              cleanNodes.push(value);
            } else if (value.type && value.startNodeId && value.endNodeId) {
              cleanEdges.push(value);
            }
          }
        });
      });
      
      const cleanData = { nodes: cleanNodes, edges: cleanEdges };
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`🟢 PARSED OBJECT:`, cleanData);
      console.log(`⏱️ TOTAL TIME: ${totalTime.toFixed(2)}ms (Click to Final JSON)`);
      console.log(`⏰ COMPLETED: ${new Date().toISOString()} - ${endTime}ms`);
      
      return {
        success: true,
        data: {
          count: result.data.count,
          query: cypherQuery,
          results: cleanData
        }
      };
    } catch (error) {
      console.error('🚨 QUERY FAILED:', error);
      throw error;
    }
  }


  // Dynamic converter: raw Neo4j nodes/edges -> EntityModel format for canvas
private convertToEntityModels(rawNodes: any[], rawEdges: any[]): {entities: EntityModel[], relationships: GraphRelationship[]} {
    const entities: EntityModel[] = [];
    const relationships: GraphRelationship[] = [];

    // Convert nodes to EntityModel format dynamically
    rawNodes.forEach((node, index) => {
      entities.push({
        id: node.properties?.GUID || node.GUID, // Use GUID only
        name: node.properties?.name || `Node ${index + 1}`,
        x: index * 180, // Better spacing for readability
        y: Math.floor(index / 3) * 120,
        width: 160, // Wider for better text visibility
        height: 80, // Taller for better proportions 
        color: this.getNodeColor(index),
        properties: node.properties,
        parent: null,
        children: [],
        expanded: false,
        animating: false
      });
    });

    // Convert edges to GraphRelationship format dynamically
    rawEdges.forEach(edge => {
      // Use GUID-based matching only
      const fromGUID = edge.properties?.fromGUID;
      const toGUID = edge.properties?.toGUID;
      
      if (fromGUID && toGUID) {
        relationships.push({
          id: edge.properties?.GUID || edge.id,
          fromGUID: fromGUID,  // Use fromGUID consistently
          toGUID: toGUID,      // Use toGUID consistently
          source: fromGUID,    // Keep for backward compatibility
          target: toGUID,      // Keep for backward compatibility
          type: edge.type,
          ...edge.properties
        });
      }
    });

    return { entities, relationships };
  }

  private findNodeByAnyId(nodes: any[], searchId: any): any | null {
    return nodes.find(node => 
      node.properties?.GUID === searchId ||
      node.GUID === searchId ||
      node.properties?.id === searchId ||
      node.id === searchId ||
      node.neo4jId === searchId
    ) || null;
  }

  private getNodeColor(index: number): string {
    // Dark Theme Specification colors from WebGL/WASM Dark Theme spec
    const colors = [
      '#4A90E2', // Process Color (spec blue)
      '#7B68EE', // System Color (spec purple)  
      '#20B2AA', // Service Color (spec teal)
      '#FF6B6B', // Data Color (spec coral)
      '#4A90E2', // Process Color (repeat for consistency)
      '#7B68EE', // System Color (repeat)
      '#20B2AA', // Service Color (repeat)
      '#FF6B6B'  // Data Color (repeat)
    ];
    return colors[index % colors.length] || '#4A90E2'; // Default to process color
  }

  private isNode(value: any): boolean {
    return value && typeof value === 'object' && value.labels && value.properties;
  }

  private isRelationship(value: any): boolean {
    return value && typeof value === 'object' && value.type && value.startNodeId && value.endNodeId;
  }

  private extractNodeData(node: any): any {
    // After deduplication: neo4jId, GUID, labels, properties
    return {
      neo4jId: node.id,
      GUID: node.properties?.GUID,
      labels: node.labels || [],
      properties: { ...node.properties }
    };
  }

  private extractRelationshipData(rel: any): any {
    // After deduplication: neo4jId, GUID, type, fromGUID, toGUID, properties
    return {
      neo4jId: rel.id,
      GUID: rel.properties?.GUID,
      type: rel.type,
      fromGUID: rel.properties?.fromGUID,
      toGUID: rel.properties?.toGUID,
      startNodeId: rel.startNodeId,
      endNodeId: rel.endNodeId,
      properties: { ...rel.properties }
    };
  }

  // Unified dynamic method - replaces all hardcoded parsing
  async getViewGraph(viewType: 'processes' | 'systems' | 'test-modular'): Promise<{entities: EntityModel[], relationships: GraphRelationship[]}> {
    try {
      // Use the existing directQuery method for consistency
      const result = await this.directQuery(viewType);
      
      if (result.success && result.data && result.data.results) {
        // directQuery now returns clean { nodes, edges } structure
        const cleanData = result.data.results;
        
        // Convert to EntityModel format for canvas
        const canvasData = this.convertToEntityModels(cleanData.nodes, cleanData.edges);
        
        return canvasData;
      } else {
        return this.createEmptyState(viewType, 'No data found');
      }
    } catch (error) {
      console.log('❌ DYNAMIC ERROR:', error);
      return this.createEmptyState(viewType, `Error: ${error}`);
    }
  }

  private normaliseTreeTableResult(result: TreeTableQueryResult): TreeTableLayoutResult {
    const columns = result.columns.map((column) => this.normaliseTreeTableColumn(column));
    const nodes = result.nodes.map((node) => this.normaliseTreeTableNode(node));

    return {
      columns,
      nodes,
      batchId: result.batchId,
      generatedAt: result.generatedAt,
    };
  }

  private normaliseTreeTableColumn(column: TreeTableColumn): TreeTableColumn {
    return {
      key: column.key,
      label: column.label,
      valueType: column.valueType,
      description: column.description,
      isDefault: column.isDefault,
      allowAggregation: column.allowAggregation,
    };
  }

  private normaliseTreeTableNode(node: TreeTableNode): TreeTableNode {
    return {
      guid: node.guid,
      parentGuid: node.parentGuid ?? null,
      label: node.label,
      kind: node.kind,
      language: node.language,
      depth: node.depth,
      position: node.position,
      batchId: node.batchId,
      tags: node.tags ?? [],
      metadataJson: this.parseTreeTableMetadata(node.metadataJson),
      values: this.normaliseTreeTableValueMap(node.values),
      aggregates: node.aggregates
        ? this.normaliseTreeTableValueMap(node.aggregates)
        : undefined,
    };
  }

  private normaliseTreeTableValueMap(
    values: Record<string, TreeTableValue | undefined>,
  ): Record<string, TreeTableValue | undefined> {
    return Object.entries(values ?? {}).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value
          ? {
              raw: value.raw,
              formatted: value.formatted,
              meta: value.meta,
            }
          : undefined,
      }),
      {} as Record<string, TreeTableValue | undefined>,
    );
  }

  private parseTreeTableMetadata(
    metadata: Record<string, unknown> | string | undefined,
  ): Record<string, unknown> | undefined {
    if (metadata && typeof metadata === 'object') {
      return metadata;
    }

    if (typeof metadata === 'string' && metadata.trim().length > 0) {
      try {
        return JSON.parse(metadata);
      } catch (error) {
        console.warn('[Neo4jDataService] Failed to parse metadata JSON', {
          metadata,
          error,
        });
      }
    }

    return undefined;
  }

  private static buildTreeTableQuery(batchId?: string): string {
    const expression = batchId
      ? `'${batchId.replace(/\\/g, '\\').replace(/'/g, "\\'")}'`
      : 'latestBatch';
    return Neo4jDataService.TREE_TABLE_QUERY_TEMPLATE.replace('{BATCH_EXPR}', expression);
  }

  private createEmptyState(viewType: string, message: string): {entities: EntityModel[], relationships: GraphRelationship[]} {
    return {
      entities: [{
        id: 'empty-state',
        name: message,
        x: 0,
        y: 0,
        width: 200,
        height: 80,
        color: '#666',
        properties: { type: 'message' },
        parent: null,
        children: [],
        expanded: false,
        animating: false
      }],
      relationships: []
    };
  }

  // Get cypherQuery from parent SetNode's QueryNode via hierarchical relationship
  private async getQueryFromQueryNode(viewNode: any): Promise<string> {
    try {
      // Primary path: Get query from parent SetNode's QueryNode
      const cypherQuery = `
        MATCH (vn:ViewNode {id: "${viewNode.id}"})<-[:HAS_VIEWNODE]-(sn:SetNode)-[:HAS_QUERYNODE]->(qn:QueryNode)
        RETURN qn.cypherQuery as query
      `;
      
      const result: any = await firstValueFrom(
        this.http.post('/v0/cypher/unified', { 
          query: cypherQuery,
          parameters: {}
        })
      );
      
      if (result.success && result.data && result.data.results && result.data.results.length > 0) {
        const queryFromQueryNode = result.data.results[0].query;
        if (queryFromQueryNode && queryFromQueryNode.trim()) {
          return queryFromQueryNode;
        }
      }
      
      // Secondary path: Fallback to ViewNode's own cypherQuery only if SetNode/QueryNode fails
      console.warn('No SetNode QueryNode found or empty query, falling back to ViewNode cypherQuery');
      return viewNode.cypherQuery || viewNode.cypher_query || '';
      
    } catch (error) {
      console.error('Error fetching query from SetNode QueryNode, falling back to ViewNode:', error);
      // Fallback to ViewNode's own cypherQuery only on error
      return viewNode.cypherQuery || viewNode.cypher_query || '';
    }
  }

  // Load SetNodes with their ViewNodes for hierarchical Library display
  async getAllSetNodes(): Promise<any[]> {
    try {
      const cypherQuery = `
        MATCH (sn:SetNode)
        OPTIONAL MATCH (sn)-[:HAS_VIEWNODE]->(vn:ViewNode)
        OPTIONAL MATCH (sn)-[:HAS_QUERYNODE]->(qn:QueryNode)
        WITH sn, collect(DISTINCT vn) as viewNodes, collect(DISTINCT qn) as queryNodes
        RETURN sn, viewNodes, head(queryNodes) as qn
        ORDER BY sn.name ASC
      `;
      
      const result: any = await firstValueFrom(
        this.http.post('/v0/cypher/unified', { 
          query: cypherQuery,
          parameters: {}
        })
      );
      
      if (result.success && result.data && result.data.results) {
        const setNodes = result.data.results.map((record: any) => ({
          ...record.sn.properties,
          viewNodes: record.viewNodes.map((vn: any) => ({
            ...vn.properties
          })),
          queryDetails: record.qn ? {
            ...record.qn.properties
          } : null
        }));
        
        return setNodes;
      } else {
        console.error('Failed to fetch SetNodes:', result.error);
        return [];
      }
    } catch (error) {
      console.error('Error fetching SetNodes:', error);
      return [];
    }
  }

}
