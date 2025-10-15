import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  TreeTableColumn,
  TreeTableNode,
  TreeTableQueryResult,
  TreeTableValue
} from '../../shared/tree-table/tree-table.types';
import { TreeTableLayoutResult } from '../../shared/tree-table/tree-table-layout-engine';
import { RawEntity, RawRelationship, RawDataInput } from '../../shared/layouts/core/layout-contract';

export interface GraphRawData extends RawDataInput {
  readonly metadata?: Readonly<Record<string, unknown>>;
}

interface RuntimeGraphResponse {
  query_id: string;
  cypher: string;
  parameters: Record<string, unknown>;
  nodes: Array<{
    guid: string;
    labels?: string[];
    parent_guid?: string | null;
    position?: { x: number; y: number; z?: number | null };
    display?: {
      width?: number;
      height?: number;
      color?: string;
      icon?: string;
      border_color?: string;
      badges?: Array<{ text: string; color?: string }>;
      label_visible?: boolean;
    };
    tags?: Record<string, string[]>;
    properties: Record<string, unknown>;
  }>;
  relationships: Array<{
    guid: string;
    source_guid: string;
    target_guid: string;
    type: string;
    display?: {
      color?: string;
      width?: number;
      label?: string;
      label_visible?: boolean;
      dash?: number[];
    };
    properties: Record<string, unknown>;
  }>;
  metadata: {
    elapsed_ms: number;
    rows_returned: number;
  };
  telemetry_cursor?: string | null;
  raw_rows?: Array<Record<string, unknown>>;
}

@Injectable({ providedIn: 'root' })
export class Neo4jDataService {

  constructor(private readonly http: HttpClient) {}

  async fetchTreeTable(viewNode?: { id?: string; batchId?: string; import_batch?: string }): Promise<TreeTableLayoutResult> {
    interface UnifiedCypherResponse {
      success: boolean;
      data?: { results?: Array<Record<string, unknown>> };
      message: string;
    }

    const batchId = viewNode?.batchId ?? viewNode?.import_batch ?? null;
    const viewNodeId = viewNode?.id ?? 'tree-table-view';

    const query = await this.getTreeTableQuery(viewNodeId, batchId);
    console.debug('[TreeTable] executing query', query.query);

    const response = await firstValueFrom(
      this.http.post<UnifiedCypherResponse>('/v0/cypher/unified', {
        query: query.query,
        parameters: query.parameters
      })
    );

    if (!response.success || !response.data?.results?.length) {
      console.error('[TreeTable] unified endpoint error', response);
      throw new Error(`TreeTable query failed: ${response.message || 'No data returned'}`);
    }

    const row = response.data.results[0] as { result?: TreeTableQueryResult };
    if (!row?.result) {
      throw new Error('TreeTable query did not return a result payload');
    }

    return this.normaliseTreeTableResult(row.result);
  }

  async getAllViewNodes(): Promise<any[]> {
    try {
      const cypherQuery = 'MATCH (vn:ViewNode) RETURN vn ORDER BY vn.name ASC';
      const result: any = await firstValueFrom(
        this.http.post('/v0/cypher/unified', { query: cypherQuery, parameters: {} })
      );

      if (result.success && result.data?.results) {
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

  async executeViewNodeQuery(viewNode: any): Promise<GraphRawData> {
    try {
      const cypher = await this.getQueryFromQueryNode(viewNode);

      const runtimeResponse = await firstValueFrom(
        this.http.post<RuntimeGraphResponse>('/runtime/canvas/data', {
          query: cypher,
          parameters: {},
          include_raw_rows: true
        })
      );

      if (runtimeResponse.nodes && runtimeResponse.nodes.length > 0) {
        return this.convertRuntimeGraph(runtimeResponse);
      }

      if (runtimeResponse.raw_rows && runtimeResponse.raw_rows.length > 0) {
        return this.convertRawRows(runtimeResponse.raw_rows, {
          source: 'runtime-raw',
          queryId: runtimeResponse.query_id,
          cypher
        });
      }

      return this.createEmptyState(viewNode?.name ?? 'view', 'Query returned no data');
    } catch (error) {
      console.error('Error executing ViewNode query:', error);
      return this.createEmptyState(viewNode?.name ?? 'view', `Failed: ${String(error)}`);
    }
  }

  async directQuery(entityName: string): Promise<GraphRawData> {
    const startTime = performance.now();
    const cypherQuery = `
      MATCH (root {name: $entityName})
      OPTIONAL MATCH (root)-[r:CONTAINS*0..]->(descendant)
      OPTIONAL MATCH (descendant)-[rel]->(child)
      RETURN root, descendant, rel, child
    `;

    try {
      const result: any = await firstValueFrom(
        this.http.post('/v0/cypher/unified', {
          query: cypherQuery,
          parameters: { entityName: entityName.charAt(0).toUpperCase() + entityName.slice(1) }
        })
      );

      const cleanNodes: any[] = [];
      const cleanEdges: any[] = [];

      result.data?.results?.forEach((record: any) => {
        Object.values(record).forEach((value: any) => {
          if (!value || typeof value !== 'object') {
            return;
          }
          if (value.labels && value.properties) {
            cleanNodes.push(value);
          } else if (value.type && (value.startNodeId || value.endNodeId)) {
            cleanEdges.push(value);
          }
        });
      });

      const duration = performance.now() - startTime;
      console.debug('[directQuery] parsed nodes/edges', {
        nodes: cleanNodes.length,
        edges: cleanEdges.length,
        durationMs: duration
      });

      return this.convertLegacyRecords(cleanNodes, cleanEdges, {
        source: 'directQuery',
        durationMs: duration,
        entityName
      });
    } catch (error) {
      console.error('🚨 directQuery failed:', error);
      return this.createEmptyState(entityName, `Error: ${String(error)}`);
    }
  }

  async getViewGraph(viewType: 'processes' | 'systems' | 'test-modular'): Promise<GraphRawData> {
    return this.directQuery(viewType);
  }

  private convertRuntimeGraph(response: RuntimeGraphResponse): GraphRawData {
    const entities: RawEntity[] = response.nodes.map(node => this.createRawEntityFromCanonical(node));
    const relationships: RawRelationship[] = response.relationships.map(rel => this.createRawRelationshipFromCanonical(rel));

    return {
      entities,
      relationships,
      metadata: {
        source: 'runtime',
        queryId: response.query_id,
        cypher: response.cypher,
        elapsedMs: response.metadata?.elapsed_ms,
        rowCount: response.metadata?.rows_returned
      }
    };
  }

  private convertRawRows(rows: Array<Record<string, unknown>>, metadata?: Record<string, unknown>): GraphRawData {
    const nodes: any[] = [];
    const edges: any[] = [];
    const seen = new Set<string>();

    rows.forEach(row => {
      Object.values(row).forEach(value => {
        if (!value || typeof value !== 'object') {
          return;
        }

        const candidate = value as any;
        if (Array.isArray(candidate.labels) && candidate.properties) {
          const guid = this.extractGuid(candidate);
          if (guid && !seen.has(guid)) {
            nodes.push(candidate);
            seen.add(guid);
          }
        } else if (candidate.type && (candidate.properties?.['fromGUID'] || candidate.fromGUID || candidate.startNodeId)) {
          edges.push(candidate);
        }
      });
    });

    return this.convertLegacyRecords(nodes, edges, metadata);
  }

  private convertLegacyRecords(
    rawNodes: any[],
    rawEdges: any[],
    metadata?: Record<string, unknown>
  ): GraphRawData {
    const nodeMap = new Map<string, RawEntity>();
    rawNodes.forEach(node => {
      const guid = this.extractGuid(node);
      if (!guid || nodeMap.has(guid)) {
        return;
      }
      nodeMap.set(guid, this.createRawEntityFromLegacy(node, guid));
    });

    const edgeMap = new Map<string, RawRelationship>();
    rawEdges.forEach(edge => {
      const relationship = this.createRawRelationshipFromLegacy(edge);
      if (relationship && !edgeMap.has(relationship.id)) {
        edgeMap.set(relationship.id, relationship);
      }
    });

    return {
      entities: Array.from(nodeMap.values()),
      relationships: Array.from(edgeMap.values()),
      metadata
    };
  }

  private createRawEntityFromCanonical(node: RuntimeGraphResponse['nodes'][number]): RawEntity {
    const properties: Record<string, unknown> = { ...(node.properties ?? {}) };
    if (node.parent_guid !== undefined) {
      properties['parent_guid'] = node.parent_guid;
    }
    if (node.position) {
      properties['position'] = node.position;
    }
    if (node.display) {
      properties['display'] = node.display;
    }
    if (node.tags) {
      properties['tags'] = node.tags;
    }

    return {
      id: node.guid,
      name: this.resolveNodeName(node.guid, properties),
      type: this.resolveNodeType(node.labels, properties),
      properties
    };
  }

  private createRawEntityFromLegacy(node: any, guid: string): RawEntity {
    const properties: Record<string, unknown> = { ...(node.properties ?? {}) };
    if (node.parent_guid || node.parentGuid) {
      properties['parent_guid'] = node.parent_guid ?? node.parentGuid;
    }
    if (node.display) {
      properties['display'] = node.display;
    }
    if (node.position) {
      properties['position'] = node.position;
    }
    if (node.tags) {
      properties['tags'] = node.tags;
    }
    return {
      id: guid,
      name: this.resolveNodeName(guid, properties),
      type: this.resolveNodeType(node.labels, properties),
      properties
    };
  }

  private createRawRelationshipFromCanonical(rel: RuntimeGraphResponse['relationships'][number]): RawRelationship {
    const properties: Record<string, unknown> = { ...(rel.properties ?? {}) };
    if (rel.display) {
      properties['display'] = rel.display;
    }
    return {
      id: rel.guid,
      source: rel.source_guid,
      target: rel.target_guid,
      type: rel.type,
      properties
    };
  }

  private createRawRelationshipFromLegacy(edge: any): RawRelationship | null {
    const source =
      this.extractGuid(edge.properties?.['fromGUID']) ||
      this.extractGuid(edge.properties?.['fromGuid']) ||
      this.extractGuid(edge.properties?.['from_guid']) ||
      this.extractGuid(edge.fromGUID) ||
      this.extractGuid(edge.fromGuid) ||
      this.extractGuid(edge.from_guid) ||
      this.extractGuid(edge.startNodeId) ||
      null;

    const target =
      this.extractGuid(edge.properties?.['toGUID']) ||
      this.extractGuid(edge.properties?.['toGuid']) ||
      this.extractGuid(edge.properties?.['to_guid']) ||
      this.extractGuid(edge.toGUID) ||
      this.extractGuid(edge.toGuid) ||
      this.extractGuid(edge.to_guid) ||
      this.extractGuid(edge.endNodeId) ||
      null;

    if (!source || !target) {
      return null;
    }

    const type = edge.type || edge.properties?.['type'] || 'RELATES_TO';
    const guid =
      this.extractGuid(edge.properties?.['GUID']) ||
      this.extractGuid(edge.properties?.['guid']) ||
      this.extractGuid(edge.GUID) ||
      this.extractGuid(edge.guid) ||
      `${type}-${source}-${target}`;

    return {
      id: guid,
      source,
      target,
      type,
      properties: { ...(edge.properties ?? {}) }
    };
  }

  private extractGuid(candidate: unknown): string | null {
    if (!candidate) {
      return null;
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }

    if (typeof candidate === 'number') {
      return candidate.toString();
    }

    if (typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      const props = record['properties'] as Record<string, unknown> | undefined;
      const guidSources = [
        record['GUID'],
        record['guid'],
        record['id'],
        record['elementId'],
        record['element_id'],
        record['identity'],
        props?.['GUID'],
        props?.['guid'],
        props?.['id']
      ];

      for (const source of guidSources) {
        const resolved = this.extractGuid(source);
        if (resolved) {
          return resolved;
        }
      }
    }

    return null;
  }

  private resolveNodeName(fallback: string, properties: Record<string, unknown>): string {
    const name = properties['name'] ?? properties['label'] ?? fallback;
    return typeof name === 'string' && name.trim().length > 0 ? name : fallback;
  }

  private resolveNodeType(labels?: string[], properties?: Record<string, unknown>): string {
    const typeCandidate = properties?.['type'];
    if (typeof typeCandidate === 'string' && typeCandidate.trim().length > 0) {
      return typeCandidate;
    }
    if (Array.isArray(labels) && labels.length > 0) {
      return labels[0];
    }
    return 'Node';
  }

  private createEmptyState(viewType: string, message: string): GraphRawData {
    return {
      entities: [
        {
          id: `empty-${viewType}`,
          name: message,
          type: 'message',
          properties: { message, viewType }
        }
      ],
      relationships: [],
      metadata: {
        empty: true,
        message,
        viewType
      }
    };
  }

  private async getQueryFromQueryNode(viewNode: any): Promise<string> {
    try {
      const cypherQuery = `
        MATCH (vn:ViewNode {id: $viewNodeId})<-[:HAS_VIEWNODE]-(sn:SetNode)-[:HAS_QUERYNODE]->(qn:QueryNode)
        RETURN qn.cypherQuery AS query
      `;

      const result: any = await firstValueFrom(
        this.http.post('/v0/cypher/unified', {
          query: cypherQuery,
          parameters: { viewNodeId: viewNode.id }
        })
      );

      const queryFromQueryNode = result.data?.results?.[0]?.query;
      if (result.success && typeof queryFromQueryNode === 'string' && queryFromQueryNode.trim()) {
        return queryFromQueryNode;
      }

      console.warn('No SetNode QueryNode found or query empty, falling back to ViewNode cypherQuery');
      return viewNode.cypherQuery || viewNode.cypher_query || '';
    } catch (error) {
      console.error('Error fetching query from SetNode QueryNode, falling back to ViewNode:', error);
      return viewNode.cypherQuery || viewNode.cypher_query || '';
    }
  }

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

      if (result.success && result.data?.results) {
        return result.data.results.map((record: any) => ({
          ...record.sn.properties,
          viewNodes: record.viewNodes.map((vn: any) => ({
            ...vn.properties
          })),
          queryDetails: record.qn ? { ...record.qn.properties } : null
        }));
      }

      console.error('Failed to fetch SetNodes:', result.error);
      return [];
    } catch (error) {
      console.error('Error fetching SetNodes:', error);
      return [];
    }
  }

  private normaliseTreeTableResult(result: TreeTableQueryResult): TreeTableLayoutResult {
    const columns = result.columns.map(column => this.normaliseTreeTableColumn(column));
    const nodes = result.nodes.map(node => this.normaliseTreeTableNode(node));

    return {
      columns,
      nodes,
      batchId: result.batchId,
      generatedAt: result.generatedAt
    };
  }

  private normaliseTreeTableColumn(column: TreeTableColumn): TreeTableColumn {
    return {
      key: column.key,
      label: column.label,
      valueType: column.valueType,
      description: column.description,
      isDefault: column.isDefault,
      allowAggregation: column.allowAggregation
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
      aggregates: node.aggregates ? this.normaliseTreeTableValueMap(node.aggregates) : undefined
    };
  }

  private normaliseTreeTableValueMap(values: Record<string, TreeTableValue | undefined>): Record<string, TreeTableValue | undefined> {
    return Object.entries(values ?? {}).reduce((acc, [key, value]) => {
      acc[key] = value
        ? {
            raw: value.raw,
            formatted: value.formatted,
            meta: value.meta
          }
        : undefined;
      return acc;
    }, {} as Record<string, TreeTableValue | undefined>);
  }

  private parseTreeTableMetadata(metadata: Record<string, unknown> | string | undefined): Record<string, unknown> | undefined {
    if (metadata && typeof metadata === 'object') {
      return metadata;
    }

    if (typeof metadata === 'string') {
      try {
        return JSON.parse(metadata);
      } catch (error) {
        console.warn('[TreeTable] failed to parse metadata JSON', { metadata, error });
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
}
