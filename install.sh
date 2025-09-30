#!/bin/bash
set -e

echo "🚀 Kalisi Installer"
echo "=================="

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

# Pull latest image (force to ensure we get registry version)
echo "📦 Pulling Kalisi image..."
docker pull --quiet littleredshack/kalisi:latest

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

# Run Kalisi container
CONTAINER_NAME="kalisi"
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
  littleredshack/kalisi:latest

echo ""
echo "⏳ Waiting for services to start (this may take 2-3 minutes)..."

# Wait for services to be ready
MAX_WAIT=180  # 3 minutes
WAIT_TIME=0
HTTPS_READY=false

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
  if curl -k -s --connect-timeout 5 https://localhost:8443 >/dev/null 2>&1; then
    HTTPS_READY=true
    break
  fi
  echo -n "."
  sleep 5
  WAIT_TIME=$((WAIT_TIME + 5))
done

echo ""

if [ "$HTTPS_READY" = true ]; then
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
else
  echo "⚠️  Kalisi started but services may still be initializing."
  echo "   Check logs with: docker logs -f kalisi"
fi
echo ""
echo "Access methods:"
echo "  🌐 Web App:    https://localhost:8443"
if [[ -n "$AUTHORIZED_KEYS" ]]; then
echo "  🔧 SSH:        ssh -p 2222 kalisi@localhost"
fi
echo "  🗄️  Neo4j:      http://localhost:7474 (neo4j/kalisi-neo4j)"
echo "  💻 Terminal:   http://localhost:7681"
echo ""
echo "Manage:"
echo "  Stop:          docker stop kalisi"
echo "  Start:         docker start kalisi"
echo "  Remove:        docker rm -f kalisi"
echo "  Logs:          docker logs -f kalisi"
echo ""
echo "Documentation: https://github.com/littleredshack/kalisi"