# Project Tree Agent

A bounded, conversational agent that generates visual representations of project directory structures.

## What It Does

**Bounded Task**: Can ONLY visualize directory and file trees. Nothing else.

**Flexible Interface**: Understands natural language commands for:
- Depth control (shallow, deep, custom depth)
- File inclusion/exclusion
- Hidden file handling
- Path filtering
- Custom exclusions

## Quick Start

```bash
cd /workspace/source/agents/project-tree-agent
cargo run --bin tree-agent-cli
```

## Example Commands

```
show me the project tree
give me a shallow tree with files
show me the tree without node_modules
hide all hidden files
show everything including hidden files at depth 5
```

## Features

### Natural Language Understanding
- Parses intent from conversational queries
- Supports multiple phrasings for same action
- Provides helpful error messages

### Visual Output
- Directories: `├── foldername`
- Files: `├── 📄 filename`
- Clear indentation with tree structure

### Guardrails
- Cannot modify files
- Cannot execute code
- Cannot access outside `/workspace/source`
- Only shows directory/file structures

### Learning & Improvement
- Logs unanswered questions to `unanswered_questions.jsonl`
- Tracks out-of-scope requests
- Helps identify areas for improvement

## Default Behavior

- **Depth**: 3 levels
- **Files**: Directories only (unless requested)
- **Exclusions**: `target`, `node_modules`, `.git`, `.angular`, `dist`

## Architecture

This agent serves as a **template** for building bounded, conversational agents:

1. **Single Responsibility**: One clear, bounded task
2. **Natural Language**: Flexible input parsing
3. **Clear Boundaries**: Explicit scope limitations
4. **Logging**: Tracks what it can't handle
5. **User-Friendly**: Helpful messages and documentation

## Files

- `src/lib.rs` - Core agent logic
- `src/bin/tree_agent_cli.rs` - CLI interface
- `unanswered_questions.jsonl` - Log of out-of-scope queries
- `Cargo.toml` - Dependencies and build config
