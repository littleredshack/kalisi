export interface GraphLensDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly tags?: ReadonlyArray<string>;
}

const LENSES: GraphLensDescriptor[] = [
  {
    id: 'full-graph',
    label: 'Entire Graph',
    description: 'Displays the entire dataset without filtering.',
    tags: ['default', 'global']
  },
  {
    id: 'selected-root-neighborhood',
    label: 'Root Neighborhood',
    description: 'Focus on the selected root node and its immediate relationships.',
    tags: ['focus', 'neighborhood']
  },
  {
    id: 'active-containment',
    label: 'Active Containment',
    description: 'Show the active container and its expanded descendants.',
    tags: ['containment', 'hierarchy']
  }
];

const lensMap = new Map<string, GraphLensDescriptor>();
LENSES.forEach(lens => lensMap.set(lens.id, lens));

export const GraphLensRegistry = {
  list(): ReadonlyArray<GraphLensDescriptor> {
    return LENSES;
  },

  get(id: string): GraphLensDescriptor | undefined {
    return lensMap.get(id);
  }
};
