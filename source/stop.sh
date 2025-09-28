#!/bin/bash
# Kalisi System - Stop All Services
# Gracefully stops all Kalisi services

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🛑 Kalisi System Shutdown${NC}"
echo "===================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Load environment if exists
if [ -f .env ]; then
    source .env
fi

# Stop the API Gateway
echo -e "\n${BLUE}Stopping services...${NC}"
echo -n "API Gateway: "

# Find and kill the kalisi-gateway process
if pgrep -f "kalisi-gateway\|api-gateway" > /dev/null 2>&1; then
    pkill -f "kalisi-gateway|api-gateway"
    echo -e "${GREEN}Stopped${NC}"
else
    echo -e "${YELLOW}Not running${NC}"
fi

# Stop Agent Runtime Services
echo -n "Agent Runtime: "
if pgrep -f "agent-runtime-service" > /dev/null 2>&1; then
    pkill -f "agent-runtime-service"
    echo -e "${GREEN}Stopped${NC}"
else
    echo -e "${YELLOW}Not running${NC}"
fi

# Stop any running Rust development servers
if pgrep -f "cargo run" > /dev/null 2>&1; then
    echo -n "Cargo processes: "
    pkill -f "cargo run"
    echo -e "${GREEN}Stopped${NC}"
fi

# Stop Angular development server if running
echo -n "Angular dev server: "
if pgrep -f "ng serve" > /dev/null 2>&1; then
    pkill -f "ng serve"
    echo -e "${GREEN}Stopped${NC}"
else
    echo -e "${YELLOW}Not running${NC}"
fi

# Stop Redis
echo -n "Redis: "
if redis-cli ping > /dev/null 2>&1; then
    if command_exists systemctl; then
        sudo systemctl stop redis-server > /dev/null 2>&1
        echo -e "${GREEN}Stopped${NC}"
    else
        redis-cli shutdown > /dev/null 2>&1
        echo -e "${GREEN}Stopped${NC}"
    fi
else
    echo -e "${YELLOW}Already stopped${NC}"
fi

# Stop Neo4j
echo -n "Neo4j: "
if curl -s http://localhost:${NEO4J_HTTP_PORT:-7474} > /dev/null 2>&1; then
    if command_exists systemctl; then
        sudo systemctl stop neo4j > /dev/null 2>&1
        echo -e "${GREEN}Stopped${NC}"
    elif command_exists neo4j; then
        neo4j stop > /dev/null 2>&1
        echo -e "${GREEN}Stopped${NC}"
    fi
else
    echo -e "${YELLOW}Already stopped${NC}"
fi

# Check for any remaining EDT-related processes
echo -e "\n${BLUE}Comprehensive cleanup check...${NC}"

# Check all EDT-related processes
REMAINING_EDT=$(pgrep -f "edt|EDT|agent-runtime|api-gateway" | wc -l)
if [ "$REMAINING_EDT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Found $REMAINING_EDT EDT-related processes still running${NC}"
    echo "Processes:"
    ps aux | grep -E "(edt|EDT|agent-runtime|api-gateway)" | grep -v grep
else
    echo -e "${GREEN}✅ All EDT services stopped${NC}"
fi

# Check Redis pub/sub subscriptions
echo -n "Redis pub/sub: "
if redis-cli ping > /dev/null 2>&1; then
    PUBSUB_CHANNELS=$(redis-cli pubsub channels | wc -l)
    if [ "$PUBSUB_CHANNELS" -gt 0 ]; then
        echo -e "${YELLOW}$PUBSUB_CHANNELS active channels${NC}"
        redis-cli pubsub channels
    else
        echo -e "${GREEN}No active subscriptions${NC}"
    fi
else
    echo -e "${YELLOW}Redis not accessible${NC}"
fi

# Check for WebSocket connections
echo -n "WebSocket connections: "
WS_CONNECTIONS=$(lsof -i :3000,8443 2>/dev/null | grep -c "ESTABLISHED" || echo "0")
if [ "$WS_CONNECTIONS" -gt 0 ]; then
    echo -e "${YELLOW}$WS_CONNECTIONS active connections${NC}"
else
    echo -e "${GREEN}No active connections${NC}"
fi

# Show port status
echo -e "\n${BLUE}Port status:${NC}"
if command_exists lsof; then
    # Check main application port
    if lsof -i:${PORT:-3000} > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Port ${PORT:-3000} is still in use${NC}"
        lsof -i:${PORT:-3000}
    else
        echo -e "${GREEN}✅ Port ${PORT:-3000} is free${NC}"
    fi
    
    # Check HTTPS port if enabled
    if [ "$ENABLE_HTTPS" = "true" ]; then
        if lsof -i:${HTTPS_PORT:-443} > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  Port ${HTTPS_PORT:-443} is still in use${NC}"
        else
            echo -e "${GREEN}✅ Port ${HTTPS_PORT:-443} is free${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Install 'lsof' to check port status${NC}"
fi

echo -e "\n${GREEN}EDT system shutdown complete${NC}"
echo -e "${BLUE}To restart, run: ./start.sh${NC}"