#!/bin/bash
cd /workspace/source/services/agent-runtime

echo "=== TEST 1: Default (some hidden shown) ==="
{
    echo "show me the project tree"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 15 "Agent:" | head -20

echo ""
echo "=== TEST 2: Hide all hidden files ==="
{
    echo "show me the tree but hide hidden files"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 15 "Agent:" | head -20

echo ""
echo "=== TEST 3: Show everything including hidden ==="
{
    echo "show me everything including hidden files"
    sleep 0.5
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -A 15 "Agent:" | head -20
