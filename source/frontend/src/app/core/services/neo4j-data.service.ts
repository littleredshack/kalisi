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
  properties?: Record<string, any>;
}

interface RuntimeGraphResponse {
  query_id: string;
  cypher: string;
  parameters: Record<string, any>;
  nodes: Array<{
    guid: string;
    labels?: string[];
    parent_guid?: string | null;
    properties: Record<string, any>;
  }>;
  relationships: Array<{
    guid: string;
    source_guid: string;
    target_guid: string;
    type: string;
    properties: Record<string, any>;
  }>;
  metadata: {
    elapsed_ms: number;
    rows_returned: number;
  };
  telemetry_cursor?: string | null;
  raw_rows?: Array<Record<string, unknown>>;
}


@Injectable({
  providedIn: 'root'
})
export class Neo4jDataService {
  
  constructor(
    private http: HttpClient
  ) {}
  /**
   * Fetch the flattened tree-table data in the canonical format consumed by
   * the TreeTable layout/renderer stack. If no batch id is supplied we use
   * the most recent import.
   */
  async fetchTreeTable(viewNode?: { id?: string; batchId?: string; import_batch?: string }): Promise<TreeTableLayoutResult> {
    interface UnifiedCypherResponse {
      success: boolean;
      data?: { results?: Array<Record<string, unknown>> };
      message: string;
    }

    const batchId = viewNode?.batchId ?? viewNode?.import_batch ?? null;
    const viewNodeId = viewNode?.id ?? 'tree-table-view';

    const query = await this.getTreeTableQuery(viewNodeId, batchId);
    console.log('[TreeTable] Executing query:', query.query);

    const response = await firstValueFrom(
      this.http.post<UnifiedCypherResponse>('/v0/cypher/unified', {
        query: query.query,
        parameters: query.parameters,
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
        return result.data.results.map((record: any) => ({
          ...record.vn.properties
        }));
      }

      console.error('Failed to fetch ViewNodes:', result.error);
      return [];
    } catch (error) {
      console.error('Error fetching ViewNodes:', error);
      return [];
    }
  }

  async executeViewNodeQuery(viewNode: any): Promise<{entities: EntityModel[], relationships: GraphRelationship[]}> {
    try {
      // Get the cypherQuery from the associated QueryNode instead of ViewNode
      let queryToExecute = await this.getQueryFromQueryNode(viewNode);

      // Temporary override while tree renderer is stabilised; avoids stale DB queries
      if (viewNode.name === 'Code Model') {
        queryToExecute = `
          MATCH (root:CodeElement {name: "workspace"})
          WITH root.import_batch AS batch
          MATCH (n:CodeElement {import_batch: batch})
          OPTIONAL MATCH (n)-[r:HAS_CHILD]->(m:CodeElement {import_batch: batch})
          RETURN n, r, m
        `;
      }

      const runtimeResponse = await firstValueFrom(
        this.http.post<RuntimeGraphResponse>('/runtime/canvas/data', {
          query: queryToExecute,
          parameters: {},
          include_raw_rows: true
        })
      );

      console.log('[RuntimeGraph] Metadata:', runtimeResponse.metadata);

      return this.convertRuntimeGraph(runtimeResponse);
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
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      console.log(`🟢 PARSED OBJECT:`, { nodes: cleanNodes, edges: cleanEdges });
      console.log(`⏱️ TOTAL TIME: ${totalTime.toFixed(2)}ms (Click to Final JSON)`);
      console.log(`⏰ COMPLETED: ${new Date().toISOString()} - ${endTime}ms`);

      const converted = this.convertLegacyLists(cleanNodes, cleanEdges);

      return {
        success: true,
        data: {
          count: result.data.count,
          query: cypherQuery,
          results: converted
        }
      };
    } catch (error) {
      console.error('🚨 QUERY FAILED:', error);
      throw error;
    }
  }


  private convertRuntimeGraph(response: RuntimeGraphResponse): { entities: EntityModel[]; relationships: GraphRelationship[] } {
    if (response.nodes && response.nodes.length > 0) {
      const entities = response.nodes.map((node, index) => this.createEntityFromCanonical(node, index));
      const relationships = response.relationships.map(rel => ({
        id: rel.guid,
        source: rel.source_guid,
        target: rel.target_guid,
        type: rel.type,
        properties: rel.properties
      }));
      return { entities, relationships };
    }

    if (response.raw_rows && response.raw_rows.length > 0) {
      return this.convertRawRows(response.raw_rows);
    }

    return { entities: [], relationships: [] };
  }

  private convertLegacyLists(rawNodes: any[], rawEdges: any[]): { entities: EntityModel[]; relationships: GraphRelationship[] } {
    const nodeMap = new Map<string, EntityModel>();

    rawNodes.forEach(node => {
      const guid = this.extractGuidFromValue(node);
      if (!guid || nodeMap.has(guid)) {
        return;
      }
      const index = nodeMap.size;
      nodeMap.set(guid, this.createEntityFromLegacy(node, guid, index));
    });

    const relationshipMap = new Map<string, GraphRelationship>();

    rawEdges.forEach(edge => {
      const relationship = this.createRelationshipFromLegacy(edge);
      if (relationship && !relationshipMap.has(relationship.id)) {
        relationshipMap.set(relationship.id, relationship);
      }
    });

    return {
      entities: Array.from(nodeMap.values()),
      relationships: Array.from(relationshipMap.values())
    };
  }

  private convertRawRows(rows: Array<Record<string, unknown>>): { entities: EntityModel[]; relationships: GraphRelationship[] } {
    const nodes: any[] = [];
    const relationships: any[] = [];
    const seenNodes = new Set<string>();

    rows.forEach(record => {
      Object.values(record).forEach(value => {
        if (!value || typeof value !== 'object') {
          return;
        }

        const candidate = value as any;

        if (Array.isArray(candidate.labels) && candidate.properties) {
          const guid = this.extractGuidFromValue(candidate);
          if (guid && !seenNodes.has(guid)) {
            nodes.push(candidate);
            seenNodes.add(guid);
          }
        } else if (candidate.type && (candidate.properties?.['fromGUID'] || candidate.fromGUID || candidate.startNodeId)) {
          relationships.push(candidate);
        }
      });
    });

    return this.convertLegacyLists(nodes, relationships);
  }

  private createEntityFromCanonical(node: RuntimeGraphResponse['nodes'][number], index: number): EntityModel {
    return {
      id: node.guid,
      name: node.properties?.['name'] || node.guid,
      x: (index % 4) * 200,
      y: Math.floor(index / 4) * 160,
      width: 200,
      height: 100,
      color: this.getNodeColor(index),
      properties: node.properties || {},
      parent: node.parent_guid ?? null,
      children: [],
      expanded: false,
      animating: false
    };
  }

  private createEntityFromLegacy(node: any, guid: string, index: number): EntityModel {
    const name = node.properties?.['name'] || node.name || guid;
    const parentGuid =
      node.parent_guid ??
      node.parentGuid ??
      node.properties?.['parentGUID'] ??
      node.properties?.['parent_guid'] ??
      null;

    return {
      id: guid,
      name,
      x: (index % 4) * 200,
      y: Math.floor(index / 4) * 160,
      width: 200,
      height: 100,
      color: this.getNodeColor(index),
      properties: node.properties || {},
      parent: parentGuid,
      children: [],
      expanded: false,
      animating: false
    };
  }

  private createRelationshipFromLegacy(edge: any): GraphRelationship | null {
    const source =
      this.extractGuidFromValue(edge.properties?.['fromGUID']) ||
      this.extractGuidFromValue(edge.properties?.['fromGuid']) ||
      this.extractGuidFromValue(edge.properties?.['from_guid']) ||
      this.extractGuidFromValue(edge.fromGUID) ||
      this.extractGuidFromValue(edge.fromGuid) ||
      this.extractGuidFromValue(edge.from_guid) ||
      this.extractGuidFromValue(edge.startNodeId) ||
      null;

    const target =
      this.extractGuidFromValue(edge.properties?.['toGUID']) ||
      this.extractGuidFromValue(edge.properties?.['toGuid']) ||
      this.extractGuidFromValue(edge.properties?.['to_guid']) ||
      this.extractGuidFromValue(edge.toGUID) ||
      this.extractGuidFromValue(edge.toGuid) ||
      this.extractGuidFromValue(edge.to_guid) ||
      this.extractGuidFromValue(edge.endNodeId) ||
      null;

    if (!source || !target) {
      return null;
    }

    const type = edge.type || edge.properties?.['type'] || 'RELATES_TO';
    const guid =
      this.extractGuidFromValue(edge.properties?.['GUID']) ||
      this.extractGuidFromValue(edge.properties?.['guid']) ||
      this.extractGuidFromValue(edge.GUID) ||
      this.extractGuidFromValue(edge.guid) ||
      `${type}-${source}-${target}`;

    return {
      id: guid,
      source,
      target,
      type,
      properties: edge.properties || {}
    };
  }

  private extractGuidFromValue(value: any): string | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    if (typeof value === 'object') {
      const candidates = [
        value.GUID,
        value.guid,
        value.id,
        value.elementId,
        value.element_id,
        value.identity,
        value.properties?.['GUID'],
        value.properties?.['guid'],
        value.properties?.['id']
      ];

      for (const candidate of candidates) {
        const resolved = this.extractGuidFromValue(candidate);
        if (resolved) {
          return resolved;
        }
      }
    }

    return null;
  }

  private getNodeColor(index: number): string {
    const colors = ['#4A90E2', '#7B68EE', '#20B2AA', '#FF6B6B'];
    return colors[index % colors.length];
  }

  // Unified dynamic method - replaces all hardcoded parsing
  async getViewGraph(viewType: 'processes' | 'systems' | 'test-modular'): Promise<{entities: EntityModel[], relationships: GraphRelationship[]}> {
    try {
      // Use the existing directQuery method for consistency
      const result = await this.directQuery(viewType);
      
      if (result.success && result.data && result.data.results) {
        return result.data.results as { entities: EntityModel[]; relationships: GraphRelationship[] };
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

  private async getTreeTableQuery(viewNodeId: string, batchId: string | null): Promise<{ query: string; parameters: Record<string, unknown> }> {
    const result: any = await firstValueFrom(
      this.http.post('/v0/cypher/unified', {
        query: `
          MATCH (view:ViewNode {id: $viewNodeId})
          OPTIONAL MATCH (view)<-[:HAS_VIEWNODE]-(set:SetNode)-[:HAS_QUERYNODE]->(qn:QueryNode)
          RETURN qn.cypherQuery AS query
        `,
        parameters: { viewNodeId }
      })
    );

    if (!result.success || !result.data?.results?.length) {
      throw new Error('TreeTable QueryNode is missing or failed to load');
    }

    const rawQuery = result.data.results[0].query;
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      throw new Error('TreeTable QueryNode contains no cypherQuery text');
    }

    return {
      query: rawQuery,
      parameters: { batchId }
    };
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
        return result.data.results.map((record: any) => ({
          ...record.sn.properties,
          viewNodes: record.viewNodes.map((vn: any) => ({
            ...vn.properties
          })),
          queryDetails: record.qn ? {
            ...record.qn.properties
          } : null
        }));
      }

      console.error('Failed to fetch SetNodes:', result.error);
      return [];
    } catch (error) {
      console.error('Error fetching SetNodes:', error);
      return [];
    }
  }

}
