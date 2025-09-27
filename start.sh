#!/bin/bash
# Kalisi System - Single Universal Start Script
# Automatically installs missing dependencies and ensures latest compiled versions

set -e

# Cleanup function for development mode
cleanup() {
    if [ -f "frontend-watch.pid" ]; then
        echo -e "\n${YELLOW}Stopping frontend file watcher...${NC}"
        kill $(cat frontend-watch.pid) 2>/dev/null || true
        rm -f frontend-watch.pid
    fi
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Kalisi System Startup${NC}"
echo "===================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check version
check_version() {
    local cmd=$1
    local min_version=$2
    local current_version=$3
    
    if [ -n "$current_version" ]; then
        echo -e "${GREEN}  $cmd: $current_version${NC}"
    else
        echo -e "${YELLOW}  $cmd: installed (version unknown)${NC}"
    fi
}

# Check and install dependencies
echo -e "\n${BLUE}Checking system dependencies...${NC}"

# Check for sudo capability
if [ "$EUID" -ne 0 ]; then
    if ! command_exists sudo; then
        echo -e "${RED}❌ This script requires sudo privileges for dependency installation${NC}"
        echo "Please run: sudo $0"
        exit 1
    fi
fi

# Check OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    echo -e "${RED}❌ Cannot determine OS version${NC}"
    exit 1
fi

echo -e "${GREEN}OS: $OS $VER${NC}"

# Check and install/update Rust
echo -e "\n${BLUE}Checking Rust installation...${NC}"

# Always source cargo env first if it exists
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
elif [ -f "/root/.cargo/env" ]; then
    source "/root/.cargo/env"
fi

# Now check if rustc is available
if ! command_exists rustc; then
    echo -e "${YELLOW}⚠️  Rust not found. Installing latest version...${NC}"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo -e "${GREEN}✅ Rust installed${NC}"
else
    RUST_VERSION=$(rustc --version | cut -d' ' -f2)
    echo -e "${GREEN}  Current Rust version: $RUST_VERSION${NC}"
    
    # Update Rust to latest stable
    echo -e "${BLUE}  Updating Rust to latest stable...${NC}"
    rustup update stable 2>&1 | grep -E "(unchanged|updated)" || true
    
    # Get new version after update
    NEW_RUST_VERSION=$(rustc --version | cut -d' ' -f2)
    if [ "$RUST_VERSION" != "$NEW_RUST_VERSION" ]; then
        echo -e "${GREEN}  ✅ Rust updated from $RUST_VERSION to $NEW_RUST_VERSION${NC}"
    else
        echo -e "${GREEN}  ✅ Rust is already at latest version: $NEW_RUST_VERSION${NC}"
    fi
fi

# Check and install/update Node.js
echo -e "\n${BLUE}Checking Node.js installation...${NC}"
if ! command_exists node; then
    echo -e "${YELLOW}⚠️  Node.js not found. Installing latest LTS version...${NC}"
    if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        # Install latest LTS (v20.x)
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo -e "${RED}❌ Automatic Node.js installation not supported for $OS${NC}"
        echo "Please install Node.js manually: https://nodejs.org/"
        exit 1
    fi
    echo -e "${GREEN}✅ Node.js installed (latest LTS)${NC}"
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}  Current Node.js version: $NODE_VERSION${NC}"
    
    # Check for Node.js updates
    if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        # Get the latest LTS version available
        LATEST_LTS=$(curl -s https://nodejs.org/dist/index.json | grep -E '"lts":"[^false]' | head -1 | grep -oP '"version":"v\K[^"]+' || echo "")
        
        if [ -n "$LATEST_LTS" ]; then
            CURRENT_VERSION=${NODE_VERSION#v}  # Remove 'v' prefix
            
            # Simple version comparison (major version only for simplicity)
            CURRENT_MAJOR=$(echo $CURRENT_VERSION | cut -d. -f1)
            LATEST_MAJOR=$(echo $LATEST_LTS | cut -d. -f1)
            
            if [ "$CURRENT_MAJOR" -lt "$LATEST_MAJOR" ]; then
                echo -e "${YELLOW}  Node.js LTS v$LATEST_LTS is available (current: $NODE_VERSION)${NC}"
                read -p "  Update Node.js to latest LTS? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
                    sudo apt-get install -y nodejs
                    NEW_NODE_VERSION=$(node --version)
                    echo -e "${GREEN}  ✅ Node.js updated to $NEW_NODE_VERSION${NC}"
                fi
            else
                echo -e "${GREEN}  ✅ Node.js is at latest LTS major version${NC}"
            fi
        fi
    fi
fi

# Check and install/update Redis
echo -e "\n${BLUE}Checking Redis installation...${NC}"
if ! command_exists redis-cli; then
    echo -e "${YELLOW}⚠️  Redis not found. Installing latest version...${NC}"
    if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        sudo apt-get update
        sudo apt-get install -y redis-server
        sudo systemctl enable redis-server
        echo -e "${GREEN}✅ Redis installed (latest from repository)${NC}"
    else
        echo -e "${RED}❌ Automatic Redis installation not supported for $OS${NC}"
        echo "Please install Redis manually: https://redis.io/download"
        exit 1
    fi
else
    REDIS_VERSION=$(redis-cli --version | cut -d' ' -f2 | cut -d'=' -f2)
    echo -e "${GREEN}  Current Redis version: $REDIS_VERSION${NC}"
    
    # Check for Redis updates (for apt-based systems)
    if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        if command_exists apt-get; then
            echo -e "${BLUE}  Checking for Redis updates...${NC}"
            
            # Use apt-cache policy to check without updating package lists
            CURRENT_REDIS=$(apt-cache policy redis-server | grep "Installed:" | awk '{print $2}')
            CANDIDATE_REDIS=$(apt-cache policy redis-server | grep "Candidate:" | awk '{print $2}')
            
            if [ "$CURRENT_REDIS" != "$CANDIDATE_REDIS" ] && [ "$CANDIDATE_REDIS" != "(none)" ]; then
                echo -e "${YELLOW}  Redis update available: $CURRENT_REDIS → $CANDIDATE_REDIS${NC}"
                read -p "  Update Redis to latest version? (y/N): " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    # Only update package lists when actually upgrading
                    echo -e "${BLUE}  Updating package lists and upgrading Redis...${NC}"
                    if timeout 60 sudo apt-get update && sudo apt-get upgrade -y redis-server; then
                        echo -e "${GREEN}  ✅ Redis updated to latest version${NC}"
                    else
                        echo -e "${RED}  ❌ Redis update failed or timed out${NC}"
                    fi
                fi
            else
                echo -e "${GREEN}  ✅ Redis is already at latest available version${NC}"
            fi
        fi
    fi
fi

# Check and install/update Neo4j
echo -e "\n${BLUE}Checking Neo4j installation...${NC}"
if ! command_exists neo4j; then
    echo -e "${YELLOW}⚠️  Neo4j not found. Installing latest version...${NC}"
    read -p "Do you want to install Neo4j Community Edition? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
            # Use the new GPG key method (apt-key is deprecated)
            wget -O - https://debian.neo4j.com/neotechnology.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/neo4j.gpg
            echo 'deb [signed-by=/usr/share/keyrings/neo4j.gpg] https://debian.neo4j.com stable latest' | sudo tee /etc/apt/sources.list.d/neo4j.list
            sudo apt-get update
            
            # Install latest Neo4j 5.x Community Edition
            sudo apt-get install -y neo4j
            sudo systemctl enable neo4j
            echo -e "${GREEN}✅ Neo4j installed (latest version)${NC}"
            echo -e "${YELLOW}⚠️  Remember to set Neo4j password with: sudo neo4j-admin dbms set-initial-password <password>${NC}"
        else
            echo -e "${YELLOW}⚠️  Automatic Neo4j installation not supported for $OS${NC}"
            echo "Please install Neo4j manually: https://neo4j.com/download/"
        fi
    else
        echo -e "${YELLOW}⚠️  Neo4j installation skipped (optional)${NC}"
    fi
else
    NEO4J_VERSION=$(neo4j version 2>/dev/null | head -1)
    echo -e "${GREEN}  Current Neo4j version: $NEO4J_VERSION${NC}"
    
    # Check if update is available (for apt-based systems)
    if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        if command_exists apt-get; then
            echo -e "${BLUE}  Checking for Neo4j updates...${NC}"
            
            # Use apt-cache policy to check without updating package lists
            CURRENT_NEO4J=$(apt-cache policy neo4j 2>/dev/null | grep "Installed:" | awk '{print $2}')
            CANDIDATE_NEO4J=$(apt-cache policy neo4j 2>/dev/null | grep "Candidate:" | awk '{print $2}')
            
            if [ -n "$CURRENT_NEO4J" ] && [ "$CURRENT_NEO4J" != "(none)" ]; then
                if [ "$CURRENT_NEO4J" != "$CANDIDATE_NEO4J" ] && [ "$CANDIDATE_NEO4J" != "(none)" ]; then
                    echo -e "${YELLOW}  Neo4j update available: $CURRENT_NEO4J → $CANDIDATE_NEO4J${NC}"
                    read -p "  Update Neo4j to latest version? (y/N): " -n 1 -r
                    echo
                    if [[ $REPLY =~ ^[Yy]$ ]]; then
                        # Only update package lists when actually upgrading
                        echo -e "${BLUE}  Updating package lists and upgrading Neo4j...${NC}"
                        if timeout 60 sudo apt-get update && sudo apt-get upgrade -y neo4j; then
                            echo -e "${GREEN}  ✅ Neo4j updated to latest version${NC}"
                        else
                            echo -e "${RED}  ❌ Neo4j update failed or timed out${NC}"
                        fi
                    fi
                else
                    echo -e "${GREEN}  ✅ Neo4j is already at latest available version${NC}"
                fi
            else
                echo -e "${GREEN}  ✅ Neo4j not installed via package manager (manual installation)${NC}"
            fi
        fi
    fi
fi

# Check and install build essentials
echo -e "\n${BLUE}Checking build tools...${NC}"
MISSING_TOOLS=()

if ! command_exists gcc; then
    MISSING_TOOLS+=("build-essential")
fi

if ! command_exists pkg-config; then
    MISSING_TOOLS+=("pkg-config")
fi

# Check for SSL development headers
if ! pkg-config --exists openssl 2>/dev/null; then
    MISSING_TOOLS+=("libssl-dev")
fi

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Installing missing build tools: ${MISSING_TOOLS[*]}${NC}"
    if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
        sudo apt-get update
        sudo apt-get install -y "${MISSING_TOOLS[@]}"
        echo -e "${GREEN}✅ Build tools installed${NC}"
    else
        echo -e "${RED}❌ Please install manually: ${MISSING_TOOLS[*]}${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ All build tools present${NC}"
fi

# Load environment
echo -e "\n${BLUE}Loading configuration...${NC}"
if [ -f .env ]; then
    source .env
    echo -e "${GREEN}✅ Configuration loaded from .env${NC}"
else
    if [ -f .env.example ]; then
        echo -e "${YELLOW}⚠️  .env file not found! Creating from .env.example...${NC}"
        cp .env.example .env
        echo -e "${YELLOW}⚠️  Please edit .env with your configuration:${NC}"
        echo "  - Generate JWT_SECRET: openssl rand -base64 64"
        echo "  - Generate ENCRYPTION_KEY: openssl rand -hex 32"
        echo "  - Set NEO4J_PASSWORD to match your Neo4j installation"
        echo "  - Update BASE_URL with your domain/IP"
        echo "  - Add your email to APPROVED_EMAILS"
        echo ""
        echo -e "${RED}After editing .env, run this script again.${NC}"
        exit 1
    else
        echo -e "${RED}❌ Neither .env nor .env.example found!${NC}"
        exit 1
    fi
fi

# Configuration loaded from .env

# Check for compiled binaries and rebuild if needed
echo -e "${BLUE}Checking build status...${NC}"

# Check Rust binary
RUST_BIN="$RUST_BINARY_PATH"
RUST_SRC_CHANGED=false

if [ ! -f "$RUST_BIN" ]; then
    echo -e "${YELLOW}⚠️  No release binary found${NC}"
    RUST_SRC_CHANGED=true
else
    # Check if source files are newer than binary (check all services)
    NEWEST_SRC=$(find services/ -name "*.rs" -newer "$RUST_BIN" -print -quit 2>/dev/null || true)
    if [ -n "$NEWEST_SRC" ]; then
        echo -e "${YELLOW}⚠️  Source files changed since last build: $NEWEST_SRC${NC}"
        RUST_SRC_CHANGED=true
    fi
    
    # Also check Cargo.toml files for dependency changes
    if find . -name "Cargo.toml" -newer "$RUST_BIN" -print -quit 2>/dev/null | grep -q .; then
        echo -e "${YELLOW}⚠️  Cargo.toml changed since last build${NC}"
        RUST_SRC_CHANGED=true
    fi
fi

if [ "$RUST_SRC_CHANGED" = true ]; then
    echo -e "${BLUE}Building API Gateway (release mode)...${NC}"
    
    # Fix ownership BEFORE building if running as root
    if [ "$EUID" -eq 0 ]; then
        ACTUAL_USER=${SUDO_USER:-devuser}
        ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)
        echo -e "${BLUE}Pre-build: Fixing ownership for user: $ACTUAL_USER (home: $ACTUAL_HOME)${NC}"
        chown -R "$ACTUAL_USER:$ACTUAL_USER" target/ 2>/dev/null || true
        # Run cargo as the actual user with proper environment to avoid dependency rebuilds
        # Ensure cargo is in PATH and environment is properly set
        sudo -u "$ACTUAL_USER" bash -c "
            export HOME='$ACTUAL_HOME'
            export CARGO_HOME='$ACTUAL_HOME/.cargo'
            if [ -f '$ACTUAL_HOME/.cargo/env' ]; then
                source '$ACTUAL_HOME/.cargo/env'
            fi
            cargo build --release --package kalisi-gateway
            cargo build --release --package agent-runtime --bin agent-runtime-service
        "
        # Fix ownership again after build
        chown -R "$ACTUAL_USER:$ACTUAL_USER" target/ 2>/dev/null || true
    else
        # Build normally if not running as root
        cargo build --release --package kalisi-gateway
        cargo build --release --package agent-runtime --bin agent-runtime-service
    fi
    
    echo -e "${GREEN}✅ API Gateway built${NC}"
else
    echo -e "${GREEN}✅ API Gateway binary is up to date${NC}"
fi

# Check frontend build
# Angular build output is at frontend/dist/index.html
FRONTEND_BUILD_DIR="frontend/dist"
FRONTEND_BUILD_INDEX="$FRONTEND_BUILD_DIR/index.html"
FRONTEND_SRC_CHANGED=false

if [ ! -f "$FRONTEND_BUILD_INDEX" ]; then
    echo -e "${YELLOW}⚠️  No frontend build found at $FRONTEND_BUILD_INDEX${NC}"
    # Check if there's a frontend directory to build from
    if [ ! -d "frontend" ]; then
        echo -e "${GREEN}✅ No frontend directory found, skipping frontend build${NC}"
        FRONTEND_SRC_CHANGED=false
    else
        FRONTEND_SRC_CHANGED=true
    fi
else
    # Check if source files are newer than build
    if [ -d "frontend/src" ]; then
        NEWEST_SRC=$(find frontend/src -name "*.ts" -o -name "*.html" -o -name "*.css" -o -name "*.scss" -o -name "*.js" | while read f; do
            if [ "$f" -nt "$FRONTEND_BUILD_INDEX" ]; then
                echo "$f"
                break
            fi
        done)
        if [ -n "$NEWEST_SRC" ]; then
            echo -e "${YELLOW}⚠️  Frontend source files changed since last build${NC}"
            FRONTEND_SRC_CHANGED=true
        fi
    else
        echo -e "${GREEN}✅ Frontend build exists, no source directory to check${NC}"
    fi
fi

if [ "$DEV_MODE" = "true" ]; then
    echo -e "${BLUE}Development mode enabled - enabling file watching${NC}"
    cd frontend
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # Build initially
    npm run build
    
    # Start file watcher in background for auto-rebuild
    echo -e "${BLUE}Starting frontend file watcher for auto-rebuild...${NC}"
    nohup npm run watch > frontend-watch.log 2>&1 &
    WATCH_PID=$!
    echo $WATCH_PID > frontend-watch.pid
    
    echo -e "${GREEN}✅ Frontend watcher started (PID: $WATCH_PID)${NC}"
    echo -e "${YELLOW}Frontend changes will auto-rebuild and be served on your existing ports!${NC}"
    
    # Fix ownership if running as root
    if [ "$EUID" -eq 0 ]; then
        ACTUAL_USER=${SUDO_USER:-devuser}
        echo -e "${BLUE}Fixing ownership for user: $ACTUAL_USER${NC}"
        chown -R "$ACTUAL_USER:$ACTUAL_USER" dist/
    fi
    
    cd ..
elif [ "$FRONTEND_SRC_CHANGED" = true ]; then
    echo -e "${BLUE}Building WASM assets for FR-003...${NC}"
    if [ -f "./scripts/build-wasm.sh" ]; then
        ./scripts/build-wasm.sh
    else
        echo -e "${YELLOW}⚠️  WASM build script not found, skipping...${NC}"
    fi
    
    echo -e "${BLUE}Building frontend for production...${NC}"
    cd frontend
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    # Use timeout to prevent ESBuild deadlock and process isolation
    echo -e "${YELLOW}Building with timeout and resource limits...${NC}"
    CI=true NODE_OPTIONS="--max-old-space-size=4096" timeout 180 npm run build || {
        echo -e "${RED}Build timed out or failed, trying with cache clear...${NC}"
        rm -rf node_modules/.angular
        CI=true NODE_OPTIONS="--max-old-space-size=4096" timeout 180 npm run build
    }
    
    # Fix ownership if running as root
    if [ "$EUID" -eq 0 ]; then
        # Get the actual user who invoked sudo
        ACTUAL_USER=${SUDO_USER:-devuser}
        echo -e "${BLUE}Fixing ownership for user: $ACTUAL_USER${NC}"
        chown -R "$ACTUAL_USER:$ACTUAL_USER" dist/
    fi
    
    cd ..
    echo -e "${GREEN}✅ Frontend built${NC}"
else
    echo -e "${GREEN}✅ Frontend build is up to date${NC}"
fi

# Start Redis if not running
echo -e "\n${BLUE}Starting services...${NC}"
echo -n "Redis: "
if redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}Already running${NC}"
else
    echo -n "Starting... "
    # Clean stale PID file if exists
    if [ -f "/var/run/redis/redis-server.pid" ]; then
        REDIS_PID=$(cat /var/run/redis/redis-server.pid 2>/dev/null)
        if [ -n "$REDIS_PID" ] && ! ps -p "$REDIS_PID" > /dev/null 2>&1; then
            sudo rm -f /var/run/redis/redis-server.pid 2>/dev/null || true
        fi
    fi

    # Try different methods to start Redis
    REDIS_STARTED=false

    # Method 1: Use systemctl if available
    if command_exists systemctl && [ -f "/lib/systemd/system/redis-server.service" ]; then
        if sudo systemctl start redis-server > /dev/null 2>&1; then
            REDIS_STARTED=true
        fi
    fi

    # Method 2: Direct redis-server command
    if [ "$REDIS_STARTED" = false ]; then
        if redis-server --daemonize yes > /dev/null 2>&1; then
            REDIS_STARTED=true
        fi
    fi

    # Method 3: Use service command if available
    if [ "$REDIS_STARTED" = false ] && command_exists service; then
        if sudo service redis-server start > /dev/null 2>&1; then
            REDIS_STARTED=true
        fi
    fi

    # Wait and check if Redis is running
    sleep 2
    if redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}Started${NC}"
    else
        echo -e "${RED}Failed${NC}"
        echo -e "${YELLOW}  Trying manual start with default config...${NC}"
        redis-server --daemonize yes --bind 127.0.0.1 --port 6379 > /dev/null 2>&1
        sleep 2
        if redis-cli ping > /dev/null 2>&1; then
            echo -e "${GREEN}  ✅ Redis started manually${NC}"
        else
            echo -e "${RED}  ❌ Could not start Redis. Please start it manually:${NC}"
            echo -e "${YELLOW}     redis-server --daemonize yes${NC}"
            exit 1
        fi
    fi
fi

# Start Neo4j if available
echo -n "Neo4j: "
if curl -s http://localhost:${NEO4J_HTTP_PORT} > /dev/null 2>&1; then
    echo -e "${GREEN}Already running${NC}"
else
    if command_exists neo4j; then
        echo -n "Starting... "
        NEO4J_STARTED=false

        # Fix Neo4j permissions if needed
        if [ -d "/var/lib/neo4j" ]; then
            # Check current ownership
            NEO4J_OWNER=$(stat -c %U /var/lib/neo4j 2>/dev/null)
            if [ "$NEO4J_OWNER" = "neo4j" ]; then
                # Proper ownership, try to start with service
                if [ -d "/var/log/neo4j" ]; then
                    sudo chown -R neo4j:neo4j /var/log/neo4j 2>/dev/null || true
                    sudo chmod -R 755 /var/log/neo4j 2>/dev/null || true
                fi

                # Try to start Neo4j (prefer direct command in containers)
                if [ -f /.dockerenv ] || [ -n "$DOCKER_CONTAINER" ]; then
                    # In container - use direct command
                    if sudo -u neo4j neo4j start > /dev/null 2>&1; then
                        NEO4J_STARTED=true
                    fi
                elif command_exists systemctl && [ -f "/lib/systemd/system/neo4j.service" ]; then
                    # On host with systemd
                    if sudo systemctl start neo4j > /dev/null 2>&1; then
                        NEO4J_STARTED=true
                    fi
                else
                    # Fallback - use su to run as neo4j user
                    if sudo -u neo4j neo4j start > /dev/null 2>&1; then
                        NEO4J_STARTED=true
                    fi
                fi
            else
                echo -e "${YELLOW}Permission issue detected${NC}"
            fi
        fi

        # Wait and check if Neo4j is accessible
        if [ "$NEO4J_STARTED" = true ]; then
            sleep 5
            if curl -s http://localhost:${NEO4J_HTTP_PORT} > /dev/null 2>&1; then
                echo -e "${GREEN}Started${NC}"
            else
                echo -e "${YELLOW}Started but not accessible (may need password setup)${NC}"
            fi
        else
            echo -e "${YELLOW}Not started - Neo4j is optional${NC}"
            echo -e "${YELLOW}  To use Neo4j, fix permissions: sudo chown -R neo4j:neo4j /var/lib/neo4j${NC}"
        fi
    else
        echo -e "${YELLOW}Not installed (optional)${NC}"
    fi
fi

# Check SSL certificates
if [ "$ENABLE_HTTPS" = "true" ]; then
    echo -e "\n${BLUE}Checking SSL certificates...${NC}"
    if [ ! -f "certs/fullchain.pem" ] || [ ! -f "certs/privkey.pem" ]; then
        echo -e "${YELLOW}⚠️  SSL certificates not found. Generating self-signed certificates...${NC}"
        mkdir -p certs
        openssl req -x509 -newkey rsa:4096 -keyout certs/privkey.pem -out certs/fullchain.pem \
            -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
        echo -e "${GREEN}✅ Self-signed certificates generated${NC}"
        echo -e "${YELLOW}⚠️  For production, replace with proper SSL certificates${NC}"
    else
        echo -e "${GREEN}✅ SSL certificates found${NC}"
    fi
fi

# Handle HTTPS permissions if enabled
if [ "$ENABLE_HTTPS" = "true" ] && [ "$HTTPS_PORT" -lt "1024" ]; then
    if [ "$EUID" -ne 0 ] && [ -z "$DOCKER_CONTAINER" ]; then
        echo -e "${YELLOW}⚠️  Port $HTTPS_PORT requires elevated permissions.${NC}"
        echo "Options:"
        echo "1. Run with sudo: sudo ./start.sh"
        echo "2. Use port forwarding: sudo iptables -t nat -A PREROUTING -p tcp --dport $HTTPS_PORT -j REDIRECT --to-port ${HTTPS_REDIRECT_PORT}"
        echo "3. Use setcap to allow binding to privileged ports:"
        echo "   sudo setcap 'cap_net_bind_service=+ep' $RUST_BIN"
        echo ""
        echo "Attempting option 3 (setcap)..."
        
        if command_exists setcap; then
            sudo setcap 'cap_net_bind_service=+ep' "$RUST_BIN" || {
                echo -e "${RED}❌ Failed to set capability. Please run with sudo instead.${NC}"
                exit 1
            }
            echo -e "${GREEN}✅ Capability set. Starting without sudo...${NC}"
        else
            echo -e "${RED}❌ setcap not available. Please run with sudo.${NC}"
            exit 1
        fi
    fi
fi

# Kill any existing EDT Gateway process
echo -e "\n${BLUE}Checking for existing EDT Gateway process...${NC}"
EXISTING_PID=$(ps aux | grep -E "[e]dt-gateway|[t]arget/release/edt-gateway" | awk '{print $2}' | head -1)
if [ -n "$EXISTING_PID" ]; then
    echo -e "${YELLOW}Stopping existing EDT Gateway (PID: $EXISTING_PID)...${NC}"
    kill -TERM $EXISTING_PID 2>/dev/null || true
    sleep 2
    # Force kill if still running
    if ps -p $EXISTING_PID > /dev/null 2>&1; then
        kill -9 $EXISTING_PID 2>/dev/null || true
        sleep 1
    fi
    echo -e "${GREEN}✅ Previous EDT Gateway stopped${NC}"
fi

# Also kill any processes on the ports
if command_exists lsof && lsof -i :$PORT > /dev/null 2>&1; then
    echo -e "${YELLOW}Clearing port $PORT...${NC}"
    kill $(lsof -t -i:$PORT) 2>/dev/null || true
    sleep 1
fi

# Kill any existing process on HTTPS port if enabled
if [ "$ENABLE_HTTPS" = "true" ] && command_exists lsof && lsof -i :$HTTPS_PORT > /dev/null 2>&1; then
    echo -e "${YELLOW}Clearing port $HTTPS_PORT...${NC}"
    kill $(lsof -t -i:$HTTPS_PORT) 2>/dev/null || true
    sleep 1
fi

# Start API Gateway with release binary
echo -e "\n${BLUE}Starting API Gateway...${NC}"

# Export all environment variables from .env
export BIND_ADDRESS
export PORT
export ENVIRONMENT
export REDIS_URL
export NEO4J_URI
export JWT_SECRET
export ENCRYPTION_KEY
export APPROVED_EMAILS
export MFA_REQUIRED
export TOTP_ONLY_MODE
export ENABLE_HTTPS
export HTTPS_PORT
export HTTPS_REDIRECT_PORT
export NEO4J_HTTP_PORT
export REDIS_PORT
export NEO4J_USERNAME
export NEO4J_PASSWORD
export NEO4J_DATABASE

if [ "$ENABLE_HTTPS" = "true" ]; then
    echo -e "${GREEN}Starting servers:${NC}"
    echo -e "${GREEN}  HTTP:  http://${BIND_ADDRESS}:${PORT}${NC}"
    echo -e "${GREEN}  HTTPS: https://${BIND_ADDRESS}:${HTTPS_PORT}${NC}"
else
    echo -e "${GREEN}Starting on http://${BIND_ADDRESS}:${PORT} (${ENVIRONMENT} mode)${NC}"
fi
echo -e "${YELLOW}Press Ctrl+C to stop${NC}\n"

# Kill any existing Agent Runtime processes
echo -e "\n${BLUE}Checking for existing Agent Runtime processes...${NC}"
EXISTING_AGENT_PIDS=$(ps aux | grep -E "[a]gent-runtime-service|[t]arget/release/agent-runtime-service" | awk '{print $2}')
if [ -n "$EXISTING_AGENT_PIDS" ]; then
    echo -e "${YELLOW}Stopping existing Agent Runtime processes...${NC}"
    for pid in $EXISTING_AGENT_PIDS; do
        echo -e "${YELLOW}  Stopping Agent Runtime (PID: $pid)...${NC}"
        kill -TERM $pid 2>/dev/null || true
    done
    sleep 3
    
    # Force kill any remaining agent processes
    REMAINING_AGENT_PIDS=$(ps aux | grep -E "[a]gent-runtime-service|[t]arget/release/agent-runtime-service" | awk '{print $2}')
    if [ -n "$REMAINING_AGENT_PIDS" ]; then
        echo -e "${YELLOW}Force stopping remaining Agent Runtime processes...${NC}"
        for pid in $REMAINING_AGENT_PIDS; do
            kill -9 $pid 2>/dev/null || true
        done
    fi
    echo -e "${GREEN}✅ All previous Agent Runtime processes stopped${NC}"
fi

# Start Agent Runtime Service in background
AGENT_RUNTIME_BIN="$AGENT_RUNTIME_BIN"
if [ -f "$AGENT_RUNTIME_BIN" ]; then
    echo -e "${BLUE}Starting Agent Runtime Service...${NC}"
    "$AGENT_RUNTIME_BIN" &
    AGENT_PID=$!
    echo -e "${GREEN}✅ Agent Runtime Service started (PID: $AGENT_PID)${NC}"
    
    # Wait a moment for agent service to initialize
    sleep 2
else
    echo -e "${YELLOW}⚠️  Agent Runtime Service binary not found at $AGENT_RUNTIME_BIN${NC}"
fi

# Setup cleanup for agent service
cleanup_agents() {
    if [ -n "$AGENT_PID" ] && ps -p $AGENT_PID > /dev/null 2>&1; then
        echo -e "\n${YELLOW}Stopping Agent Runtime Service...${NC}"
        kill $AGENT_PID 2>/dev/null || true
        sleep 1
    fi
}
trap cleanup_agents EXIT INT TERM

# Run the API Gateway (foreground)
"$RUST_BIN" || {
    EXIT_CODE=$?

    # Exit code 130 means terminated by Ctrl-C (SIGINT) - this is normal, not an error
    if [ $EXIT_CODE -eq 130 ]; then
        echo -e "\n${GREEN}✅ Kalisi System stopped by user${NC}"
        cleanup_agents
        exit 0
    fi

    echo -e "${RED}❌ API Gateway failed to start (exit code: $EXIT_CODE)${NC}"

    # Check common failure reasons
    if ! redis-cli ping > /dev/null 2>&1; then
        echo -e "${RED}  - Redis is not running. Try: redis-server --daemonize yes${NC}"
    fi

    if [ ! -f "$RUST_BIN" ]; then
        echo -e "${RED}  - API Gateway binary not found at: $RUST_BIN${NC}"
    fi

    if [ "$ENABLE_HTTPS" = "true" ] && [ ! -f "certs/fullchain.pem" ]; then
        echo -e "${RED}  - SSL certificates not found in certs/ directory${NC}"
    fi

    # Clean up agent service before exiting
    cleanup_agents
    exit $EXIT_CODE
}