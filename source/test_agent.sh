#!/bin/bash
cd /workspace/source/services/agent-runtime

# Send commands to the agent
{
    echo "show me the project tree"
    sleep 1
    echo "quit"
} | timeout 10 cargo run --bin tree-agent-cli 2>&1 | grep -v "warning:" | grep -v "Compiling" | grep -v "Finished"
