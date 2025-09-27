#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

from neo4j import GraphDatabase


def load_json(path: Path) -> Dict[str, Any]:
    with path.open() as fh:
        return json.load(fh)


def ensure_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if value is None:
        return []
    return [str(value)]


def merge_node(tx, node: Dict[str, Any]):
    guid = node["GUID"]
    labels = ensure_list(node.get("labels"))
    labels.append("Imported")
    labels = sorted({label for label in labels if label})
    props = dict(node.get("properties") or {})
    props["GUID"] = guid
    # Preserve legacy IDs for reference if present
    if "neo4jId" in node:
        props.setdefault("legacyNeo4jId", node["neo4jId"])
    label_clause = ':' + ':'.join(labels) if labels else ':Imported'
    cypher = f"MERGE (n{label_clause} {{GUID: $guid}}) SET n += $props"
    tx.run(cypher, guid=guid, props=props)


def merge_relationship(tx, edge: Dict[str, Any]):
    guid = edge["GUID"]
    rel_type = edge.get("type") or "RELATED_TO"
    from_guid = edge.get("fromGUID")
    to_guid = edge.get("toGUID")
    if not from_guid or not to_guid:
        raise ValueError(f"Edge {guid} missing endpoint GUIDs")
    props = dict(edge.get("properties") or {})
    props["GUID"] = guid
    props.setdefault("fromGUID", from_guid)
    props.setdefault("toGUID", to_guid)
    if "neo4jId" in edge:
        props.setdefault("legacyNeo4jId", edge["neo4jId"])
    cypher = (
        f"MATCH (start {{GUID: $from_guid}}) "
        f"MATCH (end {{GUID: $to_guid}}) "
        f"MERGE (start)-[rel:{rel_type} {{GUID: $guid}}]->(end) "
        f"SET rel += $props"
    )
    tx.run(cypher, guid=guid, from_guid=from_guid, to_guid=to_guid, props=props)


def main() -> None:
    parser = argparse.ArgumentParser(description="Import nodes and edges JSON into Neo4j")
    parser.add_argument("json_path", type=Path, help="Path to JSON file with nodes/edges")
    parser.add_argument("--uri", default="bolt://localhost:7687", help="Neo4j bolt URI")
    parser.add_argument("--user", default="neo4j", help="Neo4j username")
    parser.add_argument("--password", required=True, help="Neo4j password")
    parser.add_argument("--database", default="neo4j", help="Neo4j database name")
    parser.add_argument("--dry-run", action="store_true", help="Parse without writing to Neo4j")
    args = parser.parse_args()

    payload = load_json(args.json_path)
    nodes = payload.get("nodes", [])
    edges = payload.get("edges", [])

    if args.dry_run:
        print(f"Loaded {len(nodes)} nodes and {len(edges)} edges (dry run)")
        return

    driver = GraphDatabase.driver(args.uri, auth=(args.user, args.password))
    try:
        with driver.session(database=args.database) as session:
            # Ensure a GUID index exists for faster merges
            session.execute_write(
                lambda tx: tx.run(
                    "CREATE CONSTRAINT IF NOT EXISTS FOR (n:Imported) REQUIRE n.GUID IS UNIQUE"
                )
            )
    except Exception:
        # Neo4j 5 requires explicit label; fall through without constraint
        pass

    with driver.session(database=args.database) as session:
        for node in nodes:
            if "GUID" not in node or not node["GUID"]:
                raise ValueError(f"Node missing GUID: {node}")
            session.execute_write(merge_node, node)

        for edge in edges:
            if "GUID" not in edge or not edge["GUID"]:
                raise ValueError(f"Edge missing GUID: {edge}")
            session.execute_write(merge_relationship, edge)

    print(f"Imported {len(nodes)} nodes and {len(edges)} edges into {args.database}")


if __name__ == "__main__":
    main()
