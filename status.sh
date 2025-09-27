#!/bin/bash
# Kalisi System - Service Status Check
# Shows the status of all Kalisi services

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}📊 Kalisi System Status${NC}"
echo "===================="

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Load environment if exists
if [ -f .env ]; then
    source .env
fi

echo -e "\n${BLUE}Service Status:${NC}"

# Check API Gateway
echo -n "API Gateway: "
if pgrep -f "kalisi-gateway\|api-gateway" > /dev/null 2>&1; then
    PID=$(pgrep -f "kalisi-gateway|api-gateway" | head -1)
    echo -e "${GREEN}✅ Running${NC} (PID: $PID)"
else
    echo -e "${RED}❌ Not running${NC}"
fi

# Check Redis
echo -n "Redis: "
if redis-cli ping > /dev/null 2>&1; then
    VERSION=$(redis-cli --version | awk '{print $2}' | cut -d'=' -f2)
    echo -e "${GREEN}✅ Running${NC} (v$VERSION)"
else
    echo -e "${RED}❌ Not running${NC}"
fi

# Check Neo4j
echo -n "Neo4j: "
if curl -s http://localhost:${NEO4J_HTTP_PORT:-7474} > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Running${NC} (http://localhost:${NEO4J_HTTP_PORT:-7474})"
else
    echo -e "${RED}❌ Not running${NC}"
fi

# Check Angular dev server
echo -n "Angular Dev Server: "
if pgrep -f "ng serve" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Running${NC}"
else
    echo -e "${YELLOW}⚪ Not running${NC} (production uses compiled build)"
fi

# Check ports
echo -e "\n${BLUE}Port Status:${NC}"
if command_exists lsof; then
    # Main application port
    echo -n "Port ${PORT:-3000}: "
    if lsof -i:${PORT:-3000} > /dev/null 2>&1; then
        PROCESS=$(lsof -i:${PORT:-3000} | tail -1 | awk '{print $1}')
        echo -e "${GREEN}In use${NC} by $PROCESS"
    else
        echo -e "${YELLOW}Free${NC}"
    fi
    
    # HTTPS port
    if [ "$ENABLE_HTTPS" = "true" ]; then
        echo -n "Port ${HTTPS_PORT:-443}: "
        if lsof -i:${HTTPS_PORT:-443} > /dev/null 2>&1; then
            PROCESS=$(lsof -i:${HTTPS_PORT:-443} | tail -1 | awk '{print $1}')
            echo -e "${GREEN}In use${NC} by $PROCESS"
        else
            echo -e "${YELLOW}Free${NC}"
        fi
    fi
    
    # Redis port
    echo -n "Port 6379 (Redis): "
    if lsof -i:6379 > /dev/null 2>&1; then
        echo -e "${GREEN}In use${NC}"
    else
        echo -e "${YELLOW}Free${NC}"
    fi
    
    # Neo4j ports
    echo -n "Port 7474 (Neo4j HTTP): "
    if lsof -i:7474 > /dev/null 2>&1; then
        echo -e "${GREEN}In use${NC}"
    else
        echo -e "${YELLOW}Free${NC}"
    fi
    
    echo -n "Port 7687 (Neo4j Bolt): "
    if lsof -i:7687 > /dev/null 2>&1; then
        echo -e "${GREEN}In use${NC}"
    else
        echo -e "${YELLOW}Free${NC}"
    fi
else
    echo -e "${YELLOW}Install 'lsof' for detailed port information${NC}"
fi

# Check health endpoint
echo -e "\n${BLUE}Health Check:${NC}"
if curl -s http://localhost:${PORT:-3000}/health > /dev/null 2>&1; then
    HEALTH=$(curl -s http://localhost:${PORT:-3000}/health)
    echo -e "${GREEN}✅ API is healthy${NC}"
    if command_exists jq; then
        echo "$HEALTH" | jq -r '. | "  Status: \(.status)\n  Uptime: \(.uptime)s"' 2>/dev/null || echo "  Response: $HEALTH"
    fi
else
    echo -e "${RED}❌ API is not responding${NC}"
fi

# Check for zombie processes
echo -e "\n${BLUE}Process Check:${NC}"
KALISI_PROCESSES=$(pgrep -f "kalisi\|KALISI" | wc -l)
if [ "$KALISI_PROCESSES" -gt 0 ]; then
    echo -e "Found ${GREEN}$KALISI_PROCESSES${NC} Kalisi-related processes"
else
    echo -e "${YELLOW}No Kalisi processes found${NC}"
fi

# Memory usage
if command_exists free; then
    echo -e "\n${BLUE}System Resources:${NC}"
    MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
    MEM_USED=$(free -m | awk 'NR==2{print $3}')
    MEM_PERCENT=$((MEM_USED * 100 / MEM_TOTAL))
    echo "Memory: ${MEM_USED}MB / ${MEM_TOTAL}MB (${MEM_PERCENT}%)"
fi

echo -e "\n${BLUE}Commands:${NC}"
echo "  Start all services: ${GREEN}./start.sh${NC}"
echo "  Stop all services:  ${GREEN}./stop.sh${NC}"
echo "  Check logs:         ${GREEN}tail -f server.log${NC}"