#!/bin/bash
cd /workspace/source/services/agent-runtime

echo "=== TEST 1: Shallow tree ==="
{
    echo "give me a shallow tree"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 30 "Agent:"

echo ""
echo "=== TEST 2: Services folder only ==="
{
    echo "show me the services folder"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 30 "Agent:"

echo ""
echo "=== TEST 3: Deep tree ==="
{
    echo "show me a deep tree"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 50 "Agent:" | head -40
