import { RawDataInput } from '../layouts/core/layout-contract';

export interface GraphDataSetNode {
  readonly guid: string;
  readonly labels?: ReadonlyArray<string>;
  readonly parent_guid?: string | null;
  readonly position?: { x: number; y: number; z?: number | null };
  readonly display?: {
    width?: number;
    height?: number;
    color?: string;
    icon?: string;
    border_color?: string;
    badges?: Array<{ text: string; color?: string }>;
    label_visible?: boolean;
  };
  readonly tags?: Readonly<Record<string, string[]>>;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface GraphDataSetRelationship {
  readonly guid: string;
  readonly fromGUID: string;
  readonly toGUID: string;
  readonly type: string;
  readonly display?: {
    color?: string;
    width?: number;
    label?: string;
    label_visible?: boolean;
    dash?: number[];
  };
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface GraphDataSet {
  readonly id: string;
  readonly viewNodeId?: string;
  readonly queryId: string;
  readonly cypher: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly nodes: ReadonlyArray<GraphDataSetNode>;
  readonly relationships: ReadonlyArray<GraphDataSetRelationship>;
  readonly metadata: { elapsed_ms: number; rows_returned: number };
  readonly rawRows?: ReadonlyArray<Record<string, unknown>>;
}

export function graphDataSetToRawDataInput(dataset: GraphDataSet): RawDataInput {
  const entities = dataset.nodes.map<RawDataInput['entities'][number]>(node => {
    const properties: Record<string, unknown> = {
      ...(node.properties ?? {})
    };

    if (node.parent_guid !== undefined) {
      properties['parent_guid'] = node.parent_guid;
    }

    if (node.position) {
      properties['position'] = { ...node.position };
      properties['x'] = node.position.x;
      properties['y'] = node.position.y;
      if (node.position.z !== undefined) {
        properties['z'] = node.position.z;
      }
    }

    if (node.display) {
      properties['display'] = { ...node.display };
      if (node.display.width !== undefined) {
        properties['width'] = node.display.width;
      }
      if (node.display.height !== undefined) {
        properties['height'] = node.display.height;
      }
      if (node.display.color !== undefined) {
        properties['color'] = node.display.color;
      }
      if (node.display.icon !== undefined) {
        properties['icon'] = node.display.icon;
      }
      if (node.display.border_color !== undefined) {
        properties['border_color'] = node.display.border_color;
      }
      if (node.display.badges !== undefined) {
        properties['badges'] = node.display.badges;
      }
      if (node.display.label_visible !== undefined) {
        properties['label_visible'] = node.display.label_visible;
      }
    }

    if (node.tags) {
      properties['tags'] = { ...node.tags };
    }

    const type =
      (node.labels && node.labels.length > 0 ? node.labels[0] : undefined) ??
      (node.properties?.['type'] as string | undefined) ??
      'node';

    const name =
      (node.properties?.['name'] as string | undefined) ??
      (node.properties?.['label'] as string | undefined) ??
      node.guid;

    return {
      id: node.guid,
      name,
      type,
      properties
    };
  });

  const relationships = dataset.relationships.map<RawDataInput['relationships'][number]>(rel => {
    const properties: Record<string, unknown> = {
      ...(rel.properties ?? {})
    };

    if (rel.display) {
      properties['display'] = { ...rel.display };
      if (rel.display.color !== undefined) {
        properties['color'] = rel.display.color;
      }
      if (rel.display.width !== undefined) {
        properties['width'] = rel.display.width;
      }
      if (rel.display.label !== undefined) {
        properties['label'] = rel.display.label;
      }
      if (rel.display.label_visible !== undefined) {
        properties['label_visible'] = rel.display.label_visible;
      }
      if (rel.display.dash !== undefined) {
        properties['dash'] = rel.display.dash;
      }
    }

    return {
      id: rel.guid,
      source: rel.fromGUID,
      target: rel.toGUID,
      type: rel.type,
      properties
    };
  });

  return { entities, relationships };
}
