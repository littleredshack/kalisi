# Kalisi

Kalisi is an experimental LLM framework for automated codebase analysis, feature development, and testing. It uses LLMs to understand software architectures, and generate optimized code solutions.

> **Note**: This is alpha-quality software under active development. Proceed with caution.

## Quick Install

**One-line install** (requires Docker):

```bash
curl -fsSL https://raw.githubusercontent.com/littleredshack/kalisi/main/install.sh | bash
```

This will:
- ✅ Check Docker installation
- ✅ Pull the latest Kalisi image
- ✅ Set up and start the complete system
- ✅ Configure SSH access (if keys found)

**Access after install:**
- 🌐 **Web App**: https://localhost:8443
- 🔧 **SSH**: `ssh -p 2222 kalisi@localhost`
- 🗄️ **Neo4j**: http://localhost:7474 (neo4j/kalisi-neo4j)
- 💻 **Terminal**: http://localhost:7681

## Features
- **Codebase Analysis**: Automated analysis of software architectures
- **Smart Code Generation**: Context-aware code generation based on existing patterns
- **Automated Testing**: Generate and run appropriate tests for new code
- **Pattern Recognition**: Learn from existing code to maintain consistency
- **Live Development**: File watching with instant frontend rebuilds
- **Complete Environment**: Rust, Node.js, Neo4j, Redis all pre-configured

## Development Setup

### Prerequisites
- Docker and Docker Compose
- 8GB+ RAM recommended
- 10GB+ free disk space

### From Source

1. **Clone the repository**:
   ```bash
   git clone https://github.com/littleredshack/kalisi.git
   cd kalisi
   ```

2. **Set up environment**:
   ```bash
   cp source/.env.example source/.env
   # Edit source/.env with your configuration
   ```

3. **Start the container**:
   ```bash
   ./scripts/kalisi-start.sh
   ```

### Optional: apt caching for faster builds

If you rebuild the Docker image frequently, you can cache Debian packages locally:

1. Start the cache once:
   ```bash
   mkdir -p ~/apt-cache
   docker run -d --name apt-cacher-ng \
     -p 3142:3142 \
     -v ~/apt-cache:/var/cache/apt-cacher-ng \
     sameersbn/apt-cacher-ng
   ```

2. Build with the cache (Dockerfile auto-falls back if the proxy is offline):
   ```bash
   docker build \
     --build-arg APT_PROXY=http://host.docker.internal:3142 \
     -t ghcr.io/littleredshack/kalisi:latest \
     -f docker/Dockerfile .
   ```

3. Stop the cache when finished:
   ```bash
   docker rm -f apt-cacher-ng
   ```

The cache contents live in `~/apt-cache` so subsequent builds reuse existing `.deb` files.

### Container Management

```bash
# Start (with auto-start)
./scripts/kalisi-start.sh

# Start without auto-start
./scripts/kalisi-start.sh --no-auto-start

# Stop and preserve data
./scripts/kalisi-stop.sh

# Rebuild container
./scripts/kalisi-start.sh --build
```

## Architecture

Kalisi uses a unified container architecture that includes:

- **API Gateway** (Rust): Central request handling and routing
- **Frontend** (Angular): Modern web interface with live development
- **Neo4j**: Graph database with APOC plugin for codebase relationships
- **Redis**: Fast session and cache storage
- **ttyd**: Web-based terminal access
- **Development Tools**: Complete Rust/Node.js/Python environment

For detailed architecture information, see `source/Architecture_Summary.md` and `KALISI_CONTAINER_GUIDE.md`.

## Configuration

All configuration is managed through `source/.env`. Key settings:

- `NEO4J_PASSWORD`: Neo4j database password (default: kalisi-neo4j)
- `JWT_SECRET`: JWT signing secret
- `APPROVED_EMAILS`: Comma-separated list of approved user emails

See `source/.env.example` for all available options.

## What's Included

The Kalisi container provides a complete development environment:

✅ **Database Services**: Neo4j with APOC plugin, Redis
✅ **Development Tools**: Rust nightly, Node.js 20, Python 3, build tools
✅ **Web Services**: Gateway, frontend, Neo4j browser, web terminal
✅ **Network Access**: All services accessible from localhost
✅ **Live Development**: File watching with automatic frontend rebuilds
✅ **Data Persistence**: All data preserved across container restarts
✅ **Auto-initialization**: Neo4j automatically populated with sample data

## Container Management

```bash
# Stop and preserve data
./scripts/kalisi-stop.sh

# Rebuild container
./scripts/kalisi-start.sh --build

# Reset all data (removes volumes)
docker compose down --volumes
```

## Support

For issues and feature requests, please use the GitHub issue tracker.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
