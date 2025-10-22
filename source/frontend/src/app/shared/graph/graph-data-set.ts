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
  readonly source_guid: string;
  readonly target_guid: string;
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
