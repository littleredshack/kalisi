#!/usr/bin/env python3
"""
Fast, optimized codebase loader for Neo4j
Uses batch transactions and UNWIND for speed
"""

import json
from datetime import datetime
import sys
from neo4j import GraphDatabase

class FastNeo4jLoader:
    def __init__(self, uri, username, password):
        self.driver = GraphDatabase.driver(uri, auth=(username, password))

    def close(self):
        self.driver.close()

    def load_nodes_batch(self, nodes, batch_size=1000):
        """Load nodes in large batches using UNWIND"""
        print(f"\n📦 Loading {len(nodes)} nodes in batches of {batch_size}...")

        with self.driver.session() as session:
            for i in range(0, len(nodes), batch_size):
                batch = nodes[i:i+batch_size]

                # Use UNWIND for batch insert
                result = session.run("""
                    UNWIND $batch AS node
                    CREATE (n:CodebaseNode {
                        GUID: node.GUID,
                        name: node.name,
                        type: node.type,
                        description: node.description,
                        path: node.path,
                        source: node.source,
                        import_date: node.import_date
                    })
                    RETURN count(n) as created
                """, batch=batch)

                created = result.single()['created']
                print(f"  Batch {i//batch_size + 1}: Created {created} nodes ({i+created}/{len(nodes)})")

        # Create index for faster lookups
        with self.driver.session() as session:
            session.run("CREATE INDEX IF NOT EXISTS FOR (n:CodebaseNode) ON (n.GUID)")
            print("  ✓ Created index on guid for faster lookups")

    def load_relationships_batch(self, relationships, batch_size=1000):
        """Load CONTAINS relationships in batches"""
        print(f"\n🔗 Loading {len(relationships)} CONTAINS relationships in batches of {batch_size}...")

        total_created = 0
        with self.driver.session() as session:
            for i in range(0, len(relationships), batch_size):
                batch = relationships[i:i+batch_size]

                result = session.run("""
                    UNWIND $batch AS rel
                    MATCH (parent:CodebaseNode {GUID: rel.parent_GUID})
                    MATCH (child:CodebaseNode {GUID: rel.child_GUID})
                    MERGE (parent)-[:CONTAINS {fromGUID: rel.parent_GUID, toGUID: rel.child_GUID}]->(child)
                    RETURN count(*) as created
                """, batch=batch)

                created = result.single()['created']
                total_created += created
                print(f"  Batch {i//batch_size + 1}: Created {created} relationships ({total_created}/{len(relationships)})")

    def load_edges_batch(self, edges):
        """Load edge relationships, handling missing nodes gracefully"""
        if not edges:
            print("No edges to load")
            return

        print(f"\n🌐 Loading {len(edges)} edges...")

        # Group by type
        edge_types = {}
        for edge in edges:
            edge_type = edge['type'].upper().replace(' ', '_')
            if edge_type not in edge_types:
                edge_types[edge_type] = []
            edge_types[edge_type].append(edge)

        with self.driver.session() as session:
            for edge_type, type_edges in edge_types.items():
                print(f"\n  Loading {len(type_edges)} {edge_type} edges...")

                # First, let's see which nodes actually exist
                # Extract unique node GUIDs from edges
                source_guids = set(e['source'] for e in type_edges)
                target_guids = set(e['target'] for e in type_edges)
                all_guids = list(source_guids | target_guids)

                # Check which GUIDs exist in database
                result = session.run("""
                    UNWIND $guids AS guid
                    MATCH (n:CodebaseNode {GUID: guid})
                    RETURN collect(n.GUID) as existing_guids
                """, guids=all_guids)

                existing = set(result.single()['existing_guids'])

                # Filter edges to only those where both nodes exist
                valid_edges = [
                    e for e in type_edges
                    if e['source'] in existing and e['target'] in existing
                ]

                skipped = len(type_edges) - len(valid_edges)
                if skipped > 0:
                    print(f"    Skipping {skipped} edges with missing nodes")

                if valid_edges:
                    # Create edges in batches
                    batch_size = 500
                    for i in range(0, len(valid_edges), batch_size):
                        batch = valid_edges[i:i+batch_size]

                        # Build dynamic query based on edge type
                        query = f"""
                        UNWIND $batch AS edge
                        MATCH (source:CodebaseNode {{GUID: edge.source}})
                        MATCH (target:CodebaseNode {{GUID: edge.target}})
                        CREATE (source)-[:{edge_type} {{
                            name: edge.name,
                            edge_guid: edge.guid,
                            fromGUID: edge.source,
                            toGUID: edge.target
                        }}]->(target)
                        RETURN count(*) as created
                        """

                        result = session.run(query, batch=batch)
                        created = result.single()['created']

                        if (i + batch_size) < len(valid_edges):
                            print(f"    Progress: {i+created}/{len(valid_edges)} {edge_type} edges")

                    print(f"  ✓ Created {len(valid_edges)} {edge_type} edges")

    def verify_load(self):
        """Quick verification of the load"""
        print("\n" + "="*60)
        print("VERIFICATION REPORT")
        print("="*60)

        with self.driver.session() as session:
            # Get counts separately to avoid issues with missing relationship types
            result = session.run("MATCH (n:CodebaseNode) RETURN count(n) as count")
            node_count = result.single()['count']

            result = session.run("MATCH (:CodebaseNode)-[c:CONTAINS]->(:CodebaseNode) RETURN count(c) as count")
            contains_count = result.single()['count']

            result = session.run("MATCH (:CodebaseNode)-[i:IMPORTS]->() RETURN count(i) as count")
            imports_count = result.single()['count'] if result.peek() else 0

            result = session.run("MATCH (:CodebaseNode)-[d:DEPENDS_ON]->() RETURN count(d) as count")
            depends_count = result.single()['count'] if result.peek() else 0

            result = session.run("MATCH (k:CodebaseNode {name: 'Kalisi'})-[:CONTAINS]->(child) RETURN count(child) as count")
            kalisi_children = result.single()['count']

            stats = {
                'node_count': node_count,
                'contains_count': contains_count,
                'imports_count': imports_count,
                'depends_count': depends_count,
                'kalisi_children': kalisi_children
            }

            print(f"Nodes:                {stats['node_count']:,} (expected 6,943)")
            print(f"CONTAINS:             {stats['contains_count']:,} (expected 6,942)")
            print(f"IMPORTS:              {stats['imports_count']:,} (expected 2,008)")
            print(f"DEPENDS_ON:           {stats['depends_count']:,} (expected 25)")
            print(f"Kalisi children:      {stats['kalisi_children']} (expected 22)")

            # Check if perfect
            perfect = (
                stats['node_count'] == 6943 and
                stats['contains_count'] == 6942 and
                stats['kalisi_children'] == 22
            )

            print("\n" + "="*60)
            if perfect:
                print("✅ PERFECT LOAD - Core structure loaded correctly!")
                if stats['imports_count'] < 2008 or stats['depends_count'] < 25:
                    print("⚠️  Note: Some edges couldn't be created (nodes referenced don't exist in analysis)")
            else:
                print("❌ IMPERFECT LOAD - Check counts above")
            print("="*60)

def flatten_nodes(node, parent_guid=None, nodes_list=None, relationships=None):
    """Recursively flatten the hierarchical structure"""
    if nodes_list is None:
        nodes_list = []
    if relationships is None:
        relationships = []

    # Add current node
    node_data = {
        'GUID': node['GUID'],  # Use uppercase GUID
        'type': node['type'],
        'name': node['name'],
        'description': node.get('description', ''),
        'path': node.get('path', ''),
        'source': 'codebase-analyzer',
        'import_date': datetime.now().isoformat()
    }
    nodes_list.append(node_data)

    # Add relationship to parent
    if parent_guid:
        relationships.append({
            'parent_GUID': parent_guid,
            'child_GUID': node['GUID']  # Use uppercase GUID
        })

    # Process children
    if 'children' in node and node['children']:
        for child in node['children']:
            flatten_nodes(child, node['GUID'], nodes_list, relationships)  # Use uppercase GUID

    return nodes_list, relationships

def main():
    start_time = datetime.now()

    # Neo4j connection
    neo4j_uri = "bolt://localhost:7687"
    neo4j_username = "neo4j"
    neo4j_password = "cDFLeHH9x2jTsGLwyrrL"

    # Load JSON
    json_file = sys.argv[1] if len(sys.argv) > 1 else "/home/devuser/edt2/real-codebase-analysis.json"
    print(f"📂 Loading: {json_file}")
    with open(json_file, 'r') as f:
        data = json.load(f)

    # Process data
    print("🔄 Processing hierarchical structure...")
    nodes, relationships = flatten_nodes(data['nodes'])
    edges = data.get('edges', [])

    print(f"\n📊 Data Summary:")
    print(f"  Nodes: {len(nodes):,}")
    print(f"  CONTAINS: {len(relationships):,}")
    print(f"  Edges: {len(edges):,}")

    # Connect and load
    print(f"\n🔌 Connecting to Neo4j at {neo4j_uri}")
    loader = FastNeo4jLoader(neo4j_uri, neo4j_username, neo4j_password)

    try:
        # Clear any existing data (should be empty already)
        with loader.driver.session() as session:
            session.run("MATCH (n:CodebaseNode) DETACH DELETE n")

        # Load everything
        loader.load_nodes_batch(nodes)
        loader.load_relationships_batch(relationships)
        loader.load_edges_batch(edges)

        # Verify
        loader.verify_load()

        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"\n⏱️  Total time: {elapsed:.1f} seconds")

    finally:
        loader.close()

    return 0

if __name__ == "__main__":
    sys.exit(main())