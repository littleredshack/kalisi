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

# Pull and run Kalisi directly
echo "📦 Pulling and starting Kalisi..."

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

# Run Kalisi container directly
CONTAINER_NAME="kalisi-$(date +%s)"
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
  -v "${CONTAINER_NAME}-workspace:/workspace" \
  -v "${CONTAINER_NAME}-neo4j:/data/neo4j" \
  -v "${CONTAINER_NAME}-redis:/data/redis" \
  -v "${CONTAINER_NAME}-home:/home/kalisi" \
  --restart unless-stopped \
  littleredshack/kalisi:latest

echo ""
echo "✅ Kalisi is running!"
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
echo "  Stop:          docker stop $CONTAINER_NAME"
echo "  Remove:        docker rm -f $CONTAINER_NAME"
echo "  Logs:          docker logs -f $CONTAINER_NAME"
echo ""
echo "Documentation: https://github.com/littleredshack/kalisi"