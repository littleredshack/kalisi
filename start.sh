#!/usr/bin/env bash
set -euo pipefail

# This wrapper keeps behaviour consistent regardless of the working directory.
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

TARGET="$ROOT_DIR/source/start.sh"
if [ ! -x "$TARGET" ]; then
  echo "start.sh: expected executable at $TARGET" >&2
  exit 127
fi

cd "$ROOT_DIR/source"
exec "$TARGET" "$@"
