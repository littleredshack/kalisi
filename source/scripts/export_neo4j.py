#!/usr/bin/env python3
"""
Export Neo4j database to JSON, excluding CodeElement nodes and their relationships.
This script is idempotent and can be run multiple times.
"""

import json
import os
from datetime import datetime
from neo4j import GraphDatabase
from neo4j.time import DateTime as Neo4jDateTime

def load_env_file(env_path='.env'):
    """Load environment variables from .env file."""
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value
    return env_vars

def serialize_neo4j_value(obj):
    """Convert Neo4j data types to JSON-serializable values."""
    if isinstance(obj, Neo4jDateTime):
        return obj.iso_format()
    elif isinstance(obj, (list, tuple)):
        return [serialize_neo4j_value(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: serialize_neo4j_value(value) for key, value in obj.items()}
    return obj

def export_neo4j_to_json():
    """Export all non-CodeElement nodes and edges to JSON."""

    # Load environment variables from .env file
    env_vars = load_env_file()

    # Get connection details from environment
    neo4j_uri = env_vars.get("NEO4J_URI", "bolt://localhost:7687")
    neo4j_username = env_vars.get("NEO4J_USERNAME", "neo4j")
    neo4j_password = env_vars.get("NEO4J_PASSWORD")

    if not neo4j_password:
        raise ValueError("NEO4J_PASSWORD not found in environment variables")

    # Connect to Neo4j
    driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_username, neo4j_password))

    nodes = []
    edges = []

    try:
        with driver.session() as session:
            # Export all nodes EXCEPT CodeElement nodes
            print("📦 Exporting nodes (excluding CodeElement)...")
            result = session.run("""
                MATCH (n)
                WHERE NOT n:CodeElement
                RETURN n, labels(n) as labels, id(n) as id
            """)

            for record in result:
                node = record['n']
                node_labels = record['labels']
                node_id = record['id']

                # Convert node to dictionary with all properties
                node_dict = {
                    'id': node_id,
                    'labels': node_labels,
                    'properties': serialize_neo4j_value(dict(node.items()))
                }
                nodes.append(node_dict)

            print(f"  ✓ Exported {len(nodes)} nodes")

            # Export all relationships EXCEPT those connected to CodeElement nodes
            print("\n🔗 Exporting edges (excluding those connected to CodeElement)...")
            result = session.run("""
                MATCH (source)-[r]->(target)
                WHERE NOT source:CodeElement AND NOT target:CodeElement
                RETURN id(r) as id,
                       type(r) as type,
                       id(source) as source_id,
                       id(target) as target_id,
                       properties(r) as properties
            """)

            for record in result:
                edge_dict = {
                    'id': record['id'],
                    'type': record['type'],
                    'source_id': record['source_id'],
                    'target_id': record['target_id'],
                    'properties': serialize_neo4j_value(record['properties'])
                }
                edges.append(edge_dict)

            print(f"  ✓ Exported {len(edges)} edges")

    finally:
        driver.close()

    # Create output data structure
    output_data = {
        'export_metadata': {
            'timestamp': datetime.now().isoformat(),
            'neo4j_uri': neo4j_uri,
            'excluded_labels': ['CodeElement'],
            'node_count': len(nodes),
            'edge_count': len(edges)
        },
        'nodes': nodes,
        'edges': edges
    }

    # Write to JSON file (idempotent - overwrites if exists)
    output_dir = '/workspace/source/data/neo4j'
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, 'neo4j_export.json')

    print(f"\n💾 Writing to {output_file}...")
    with open(output_file, 'w') as f:
        json.dump(output_data, f, indent=2)

    # Print summary
    print("\n" + "="*60)
    print("EXPORT SUMMARY")
    print("="*60)
    print(f"Nodes exported:       {len(nodes):,}")
    print(f"Edges exported:       {len(edges):,}")
    print(f"Output file:          {output_file}")
    print(f"File size:            {os.path.getsize(output_file):,} bytes")
    print("="*60)
    print("\n✅ Export complete!")

    return output_file, len(nodes), len(edges)

if __name__ == "__main__":
    try:
        export_neo4j_to_json()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
