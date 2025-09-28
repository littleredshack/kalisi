#!/usr/bin/env bash
set -euo pipefail

COMPOSE_CMD="docker compose"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed." >&2
  exit 1
fi

if ! $COMPOSE_CMD version >/dev/null 2>&1; then
  echo "docker compose CLI not found." >&2
  exit 1
fi

echo "🛑 Stopping Kalisi container..."
$COMPOSE_CMD down

echo "✅ Kalisi stopped. Volumes left intact."
