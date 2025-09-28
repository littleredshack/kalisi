Place optional Neo4j dump files (neo4j.dump) here before running scripts/kalisi-start.sh. The launcher restores the dump on first run and then skips future restores.

You can also drop a normalized nodes/edges JSON here (for example the output
from `scripts/normalize_neo4j_json.py`). Import it manually with APOC using
the instructions in the top-level README.
