#!/bin/bash

# Simple test script to simulate the agent interaction

echo "🌲 Project Tree Agent - Interactive Test"
echo ""
echo "This simulates how the agent would respond to your commands."
echo "Type your commands below. Type 'quit' to exit."
echo ""
echo "============================================================"
echo ""

# Function to process commands
process_command() {
    local query="$1"
    local query_lower=$(echo "$query" | tr '[:upper:]' '[:lower:]')

    # Help command
    if [[ "$query_lower" == *"help"* ]] || [[ "$query_lower" == *"what can you"* ]]; then
        cat <<EOF
🌲 Agent: 🌲 Project Tree Agent - I help you visualize your project structure!

I can only do ONE thing: show you directory trees. But I'm flexible in HOW I do it:

**What you can ask me:**
• "Show me the project tree"
• "Give me a shallow tree" (2 levels)
• "Show me a deep tree" (10 levels)
• "Show tree at depth 5"
• "Show me the tree without node_modules"
• "Exclude tests and docs"
• "Show everything including hidden files"
• "Show me just the src folder"

**What I understand:**
- Depth: shallow, deep, full, "depth 5", etc.
- Exclusions: exclude, skip, ignore, without
- Paths: specific folders like src/, services/
- Hidden files: hidden, dotfiles, all files

**What I CANNOT do:**
- Modify files
- Execute code
- Access anything outside project directories
- Anything not related to showing directory trees

Ask me anything about showing your project structure!
EOF
        return
    fi

    # Parse depth
    depth=3
    if [[ "$query_lower" == *"shallow"* ]] || [[ "$query_lower" == *"top level"* ]]; then
        depth=2
    elif [[ "$query_lower" == *"deep"* ]] || [[ "$query_lower" == *"full"* ]]; then
        depth=10
    elif [[ "$query_lower" == *"depth"* ]]; then
        # Extract number
        depth=$(echo "$query" | grep -oP '\d+' | head -1)
        [[ -z "$depth" ]] && depth=3
    fi

    # Parse exclusions
    excludes="-name target -prune -o -name node_modules -prune -o -name .git -prune -o -name .angular -prune -o -name dist -prune -o"

    if [[ "$query_lower" == *"include everything"* ]] || [[ "$query_lower" == *"show everything"* ]]; then
        excludes=""
    fi

    # Parse path
    path="/workspace/source"
    if [[ "$query_lower" == *"services"* ]]; then
        path="/workspace/source/services"
    elif [[ "$query_lower" == *"frontend"* ]]; then
        path="/workspace/source/frontend"
    elif [[ "$query_lower" == *"src"* ]]; then
        path="/workspace/source/src"
    fi

    # Build exclusion list for message
    excl_msg="target, node_modules, .git, .angular, dist"
    [[ -z "$excludes" ]] && excl_msg="none"

    echo "🌲 Agent: Here's your project tree (depth: $depth, excluded: $excl_msg)"
    echo ""

    # Generate tree
    if [[ -z "$excludes" ]]; then
        find "$path" -maxdepth "$depth" -type d 2>/dev/null | sort | awk -F/ '{
            depth = NF - 1
            if (NF == 1) { print $0; next }
            indent = ""
            for (i = 0; i < depth; i++) indent = indent "│   "
            print indent "├── " $NF
        }'
    else
        find "$path" -maxdepth "$depth" $excludes -type d -print 2>/dev/null | sort | awk -F/ '{
            depth = NF - 1
            if (NF == 1) { print $0; next }
            indent = ""
            for (i = 0; i < depth; i++) indent = indent "│   "
            print indent "├── " $NF
        }'
    fi
}

# Main loop
while true; do
    echo ""
    echo "============================================================"
    echo ""
    read -p "You: " input

    [[ -z "$input" ]] && continue

    if [[ "$input" == "quit" ]] || [[ "$input" == "exit" ]]; then
        echo ""
        echo "👋 Goodbye!"
        break
    fi

    echo ""
    process_command "$input"
done
