#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKSPACE_SOURCE="$ROOT_DIR/source"
TARGET_SCRIPT="$WORKSPACE_SOURCE/scripts/start-prebuilt.sh"

if [ ! -x "$TARGET_SCRIPT" ]; then
  echo "start-prebuilt.sh: expected executable at $TARGET_SCRIPT" >&2
  exit 127
fi

cd "$WORKSPACE_SOURCE"
exec "$TARGET_SCRIPT" "$@"
