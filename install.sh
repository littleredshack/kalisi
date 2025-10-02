#!/bin/bash
set -e

LOGS_PID=""
CONTAINER_NAME="kalisi"

cleanup() {
  if [ -n "${LOGS_PID:-}" ]; then
    if kill -0 "$LOGS_PID" >/dev/null 2>&1; then
      kill "$LOGS_PID" >/dev/null 2>&1 || true
    fi
    wait "$LOGS_PID" 2>/dev/null || true
    LOGS_PID=""
  fi
}

trap cleanup EXIT

echo "🚀 Kalisi Installer"
echo "=================="

cat <<'INTRO'

This script will:
  1. Download the Kalisi container image (~4.7GB)
  2. Check for high/critical vulnerabilities with Docker Scout quickview (if available)
  3. Start the Kalisi container and stream its logs while services initialize
  4. Launch the Kalisi web app in your browser once everything is ready

INTRO

echo "ℹ️  The installer refreshes the bundled application code." \
     "Your Neo4j/Redis data and home directory persist across installs."

read -r -p "Continue? [Y/n] " RESPONSE < /dev/tty
if [[ "$RESPONSE" =~ ^[Nn]$ ]]; then
  echo "Installation cancelled."
  exit 0
fi

# Check Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker not found."
  echo "Please install Docker first: https://docs.docker.com/get-docker/"
  exit 1
fi

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker is not running."
  echo "Please start Docker and try again."
  exit 1
fi

echo "✅ Docker found and running"

# Pull Kalisi image
echo "📦 Pulling Kalisi image (~4.7GB download)..."

echo "This may take several minutes depending on your internet connection."
docker pull ghcr.io/littleredshack/kalisi:latest

if docker scout --help >/dev/null 2>&1; then
  echo "🔍 Checking for high/critical vulnerabilities (Docker Scout quickview)..."
  QUICKVIEW_LOG=$(mktemp)
  if docker scout quickview ghcr.io/littleredshack/kalisi:latest >"$QUICKVIEW_LOG" 2>&1; then
    SEVERITY_FIELD=$(awk -F'│' '/Target[[:space:]]+│/ {severity=$3; gsub(/^[[:space:]]+|[[:space:]]+$/, "", severity); print severity; exit}' "$QUICKVIEW_LOG")
    COMPACT_SEVERITY=${SEVERITY_FIELD//[[:space:]]/}
    if [[ $COMPACT_SEVERITY =~ ^([0-9]+)C([0-9]+)H([0-9]+)M([0-9]+)L$ ]]; then
      CRITICAL_COUNT=${BASH_REMATCH[1]}
      HIGH_COUNT=${BASH_REMATCH[2]}
      if (( CRITICAL_COUNT == 0 && HIGH_COUNT == 0 )); then
        echo "   No high or critical vulnerabilities reported."
      else
        echo "   ⚠️  ${CRITICAL_COUNT} critical, ${HIGH_COUNT} high vulnerabilities reported; details:"
        cat "$QUICKVIEW_LOG"
      fi
    else
      echo "   ℹ️  Unable to summarise scan output; see full report:"
      cat "$QUICKVIEW_LOG"
    fi
  else
    echo "   ⚠️  Docker Scout quickview failed; continuing without scan results."
    cat "$QUICKVIEW_LOG"
  fi
  rm -f "$QUICKVIEW_LOG"
else
  echo "ℹ️  Docker Scout not found; skipping security scan."
fi

echo ""
echo "🛠️  Docker commands you may need:"
echo "  Start:   docker start $CONTAINER_NAME"
echo "  Stop:    docker stop $CONTAINER_NAME"
echo "  Logs:    docker logs -f $CONTAINER_NAME"
echo "  Remove:  docker rm -f $CONTAINER_NAME"
echo ""

echo "🚀 Starting Kalisi..."

# Detect SSH key
AUTHORIZED_KEYS=""
for candidate in "$HOME/.ssh/id_ed25519.pub" "$HOME/.ssh/id_rsa.pub"; do
  if [[ -f "$candidate" ]]; then
    AUTHORIZED_KEYS="$(cat "$candidate")"
    echo "🔑 Using SSH key: $candidate"
    break
  fi
done

if [[ -z "$AUTHORIZED_KEYS" ]]; then
  echo "⚠️  No SSH key found. Container will start without SSH access."
  echo "   Generate one with: ssh-keygen -t ed25519"
fi

# Stop any existing kalisi containers to avoid port conflicts
echo "🧹 Cleaning up any existing kalisi containers..."
docker ps -a --filter "name=kalisi" --format "{{.Names}}" | xargs -r docker rm -f

# Refresh workspace volume so a new install pulls in the latest template
if docker volume inspect kalisi-workspace >/dev/null 2>&1; then
  echo "🔄 Refreshing workspace volume (kalisi-workspace) with latest template..."
  docker volume rm kalisi-workspace >/dev/null 2>&1 || true
fi

# Run Kalisi container
docker run -d \
  --name "$CONTAINER_NAME" \
  -p 127.0.0.1:8443:8443 \
  -p 127.0.0.1:2222:22 \
  -p 127.0.0.1:7474:7474 \
  -p 127.0.0.1:7687:7687 \
  -p 127.0.0.1:7681:7681 \
  --cap-add CAP_SETFCAP \
  --cap-add CAP_NET_BIND_SERVICE \
  -e KALISI_AUTO_START=true \
  -e "AUTHORIZED_KEYS=$AUTHORIZED_KEYS" \
  -e NEO4J_PASSWORD=kalisi-neo4j \
  -e JWT_SECRET=change-me \
  -e APPROVED_EMAILS=demo@example.com \
  -e DOCKER_CONTAINER=true \
  -v kalisi-workspace:/workspace \
  -v kalisi-neo4j:/data/neo4j \
  -v kalisi-redis:/data/redis \
  -v kalisi-home:/home/kalisi \
  --restart unless-stopped \
  ghcr.io/littleredshack/kalisi:latest

echo ""
echo "🔒 All container ports are bound to 127.0.0.1; services stay accessible only from this machine."
echo ""
echo "📟 Streaming Kalisi startup logs..."
echo "   (Logs will stream below while Kalisi starts; the installer will finish automatically.)"
docker logs -f "$CONTAINER_NAME" &
LOGS_PID=$!

echo ""
echo "⏳ Waiting for services to start (this may take 2-3 minutes)..."

# Wait for Docker health check to pass (no timeout; user can Ctrl-C)
SERVICES_READY=false

while true; do
  HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' kalisi 2>/dev/null || echo "starting")

  if [ "$HEALTH_STATUS" = "healthy" ]; then
    SERVICES_READY=true
    break
  elif [ "$HEALTH_STATUS" = "unhealthy" ]; then
    echo ""
    echo "❌ Services failed to start properly."
    echo "   Check logs with: docker logs kalisi"
    cleanup
    exit 1
  fi

  echo -n "."
  sleep 5
done

echo ""

# Stop streaming logs once startup checks complete
cleanup

echo ""

echo "✅ Kalisi is running and ready!"
echo "🌐 Opening Kalisi in your browser..."

# Open browser (works on macOS and Linux)
if command -v open >/dev/null 2>&1; then
  open https://localhost:8443
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open https://localhost:8443
else
  echo "   Please open https://localhost:8443 manually"
fi
echo ""
echo "Access methods (localhost only; no external exposure):"
echo "  🌐 Web App:    https://localhost:8443"
if [[ -n "$AUTHORIZED_KEYS" ]]; then
echo "  🔧 SSH:        ssh -p 2222 kalisi@localhost"
fi
echo "  🗄️  Neo4j:      http://localhost:7474 (neo4j/kalisi-neo4j)"
echo "  💻 Terminal:   http://localhost:7681"
echo ""
