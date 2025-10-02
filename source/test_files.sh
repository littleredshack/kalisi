#!/bin/bash
cd /workspace/source/services/agent-runtime

echo "=== TEST 1: Default (directories only) ==="
{
    echo "show me the services folder"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 20 "Agent:" | head -25

echo ""
echo "=== TEST 2: With files ==="
{
    echo "show me the services folder with files"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 30 "Agent:" | head -35

echo ""
echo "=== TEST 3: Shallow with files ==="
{
    echo "give me a shallow tree with files"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 20 "Agent:" | head -25
