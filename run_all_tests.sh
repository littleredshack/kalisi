#!/bin/bash

# Kalisi Test Harness - Single Entry Point
# This script uses the proper test harness architecture for comprehensive testing

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment configuration
if [ -f .env ]; then
    set -a  # Automatically export all variables
    source .env
    set +a  # Stop auto-export
    echo -e "${GREEN}✅ Configuration loaded and exported from .env${NC}"
else
    echo -e "${RED}❌ .env file not found!${NC}"
    exit 1
fi

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is required for the test harness${NC}"
    exit 1
fi

# Check if PyYAML is available
if ! python3 -c "import yaml" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Installing required Python dependencies...${NC}"
    pip3 install PyYAML || {
        echo -e "${RED}❌ Failed to install PyYAML. Please install manually: pip3 install PyYAML${NC}"
        exit 1
    }
fi

# Check if Node.js and required dependencies are available for frontend tests
echo -e "${BLUE}Checking frontend test dependencies...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required for frontend tests${NC}"
    exit 1
fi

if ! command -v google-chrome-stable &> /dev/null; then
    echo -e "${YELLOW}⚠️  Google Chrome not found for frontend testing${NC}"
    echo -e "${YELLOW}⚠️  Skipping frontend integration tests${NC}"
    SKIP_FRONTEND_TESTS=true
else
    echo -e "${GREEN}✅ Google Chrome available for frontend tests${NC}"
    SKIP_FRONTEND_TESTS=false
fi

# Ensure services can start for testing
if ! redis-cli ping > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Starting Redis for tests...${NC}"
    redis-server --daemonize yes
    sleep 2
fi

# Run the unified Python test harness (includes all tests)
echo -e "${BLUE}🚀 Starting Kalisi Test Harness...${NC}"
# Export all environment variables for the Python process
set -a  # Auto-export all variables
source .env
set +a  # Stop auto-export
python3 tests/test_runner.py

exit $?