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

# Pull latest image
echo "📦 Pulling Kalisi image..."
docker pull littleredshack/kalisi:latest

# Create installation directory
INSTALL_DIR="$HOME/.kalisi"
echo "📁 Setting up in $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download docker-compose.yml and .env template
echo "⬇️  Downloading configuration..."
curl -fsSL https://raw.githubusercontent.com/littleredshack/kalisi/main/docker-compose.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/littleredshack/kalisi/main/source/.env.example -o .env

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

# Start Kalisi
echo "🚀 Starting Kalisi..."
export AUTHORIZED_KEYS="$AUTHORIZED_KEYS"
export KALISI_AUTO_START=true
docker compose up -d

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
echo "  Stop:          cd $INSTALL_DIR && docker compose down"
echo "  Restart:       cd $INSTALL_DIR && docker compose restart"
echo "  Logs:          cd $INSTALL_DIR && docker compose logs -f"
echo ""
echo "Documentation: https://github.com/littleredshack/kalisi"