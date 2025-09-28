#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--build] [--no-auto-start] [--keys-from <path>] [--authorized-keys <keys>]

  --build             Rebuild the container image before starting.
  --no-auto-start     Disable automatic Kalisi service startup inside the container.
  --keys-from         Read SSH public keys from the given file (default: ~/.ssh/id_ed25519.pub or id_rsa.pub).
  --authorized-keys   Inline SSH public keys to install (overrides file-based detection).
USAGE
}

BUILD=false
AUTO_START=true
AUTHORIZED_KEYS_VALUE=${AUTHORIZED_KEYS:-}
KEYS_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD=true
      shift
      ;;
    --no-auto-start)
      AUTO_START=false
      shift
      ;;
    --keys-from)
      if [[ ! -f "${2:-}" ]]; then
        echo "Expected a valid path for --keys-from" >&2
        exit 1
      fi
      KEYS_FILE="$2"
      AUTHORIZED_KEYS_VALUE="$(cat "$2")"
      shift 2
      ;;
    --authorized-keys)
      if [[ -z "${2:-}" ]]; then
        echo "Expected inline key material after --authorized-keys" >&2
        exit 1
      fi
      AUTHORIZED_KEYS_VALUE="$2"
      KEYS_FILE=""
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$AUTHORIZED_KEYS_VALUE" ]]; then
  for candidate in "$HOME/.ssh/id_ed25519.pub" "$HOME/.ssh/id_rsa.pub"; do
    if [[ -f "$candidate" ]]; then
      AUTHORIZED_KEYS_VALUE="$(cat "$candidate")"
      echo "[kalisi-start] Using SSH public key from $candidate"
      break
    fi
  done
elif [[ -n "$KEYS_FILE" ]]; then
  echo "[kalisi-start] Using SSH public key from $KEYS_FILE"
else
  echo "[kalisi-start] Using SSH public key provided via --authorized-keys"
fi

export AUTHORIZED_KEYS="$AUTHORIZED_KEYS_VALUE"
if [[ -z "$AUTHORIZED_KEYS_VALUE" ]]; then
  echo "[kalisi-start] No SSH public key provided; container will start without authorized keys"
fi
export KALISI_AUTO_START=$AUTO_START

COMPOSE_CMD=(docker compose)

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but not installed." >&2
  exit 1
fi

if $BUILD; then
  echo "[kalisi-start] Building image..."
  "${COMPOSE_CMD[@]}" build kalisi
fi

echo "[kalisi-start] Starting Kalisi container..."
"${COMPOSE_CMD[@]}" up -d kalisi

CONTAINER_ID=$("${COMPOSE_CMD[@]}" ps -q kalisi)

echo "\nKalisi container is running." 
echo "Next steps:"
echo "  SSH:   ssh -p 2222 kalisi@localhost"
echo "  Build: ssh -p 2222 kalisi@localhost 'cd /workspace && ./start.sh --build'"

if [[ -n "$CONTAINER_ID" ]]; then
  if PORT_LINES=$(docker port "$CONTAINER_ID" 2>/dev/null); then
    if [[ -n "$PORT_LINES" ]]; then
      echo "Published ports:"
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        proto=${line%% -> *}
        target=${line##* -> }
        host_ip=${target%:*}
        scope="public"
        if [[ "$host_ip" == "127.0.0.1" || "$host_ip" == "localhost" ]]; then
          scope="localhost-only"
        fi
        printf '  %s -> %s (%s)\n' "$target" "$proto" "$scope"
      done <<< "$PORT_LINES"
    else
      echo "  No ports are published."
    fi
  else
    echo "  Unable to determine published ports."
  fi
fi
