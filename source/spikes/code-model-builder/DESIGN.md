# Code Model Design - High Quality Schema

## Core Principles

1. **Hierarchical Nesting** - Nodes contain children, creating a tree
2. **GUID Everywhere** - Every node and edge has a unique identifier
3. **Language Agnostic** - Same schema works for Rust, TypeScript, Python
4. **Complete Hierarchy** - Repo → Package → Module → File → Type → Function → Statement → Line
5. **Flat Edges** - Relationships (CALLS, IMPORTS) are separate from hierarchy
6. **Incremental Updates** - Nodes can be replaced without rebuilding entire tree
7. **Rich Metadata** - Every node carries semantic information

---

## Node Schema

```json
{
  "guid": "uuid-v4",
  "kind": "Workspace|Repository|Package|Module|File|Type|Function|Method|Field|Statement|Line",
  "name": "human-readable-name",
  "language": "rust|typescript|python|multi|unknown",
  "location": {
    "path": "relative/path/from/repo/root",
    "start_line": 1,
    "start_col": 0,
    "end_line": 10,
    "end_col": 5,
    "byte_start": 0,
    "byte_end": 250
  },
  "metadata": {
    "visibility": "public|private|protected|internal|crate",
    "is_async": false,
    "is_unsafe": false,
    "is_mutable": false,
    "is_static": false,
    "is_const": false,
    "decorators": ["Component", "Injectable"],
    "traits": ["Display", "Clone"],
    "implements": ["Iterator"],
    "generics": ["T", "U"],
    "return_type": "Result<String>",
    "parameters": [{"name": "x", "type": "i32"}],
    "layer": "ui|domain|infra|test|build",
    "scope": "app|feature|shared",
    "complexity": 5,
    "lines_of_code": 42,
    "comment_lines": 8
  },
  "children": [
    {
      "guid": "nested-node-uuid",
      "kind": "Function",
      "name": "process",
      "children": [...]
    }
  ],
  "hash": "sha256-of-content-for-change-detection"
}
```

---

## Edge Schema

```json
{
  "guid": "uuid-v4",
  "edge_type": "CONTAINS|CALLS|IMPORTS|EXPORTS|IMPLEMENTS|EXTENDS|USES|READS|WRITES|TESTS",
  "from_guid": "source-node-guid",
  "to_guid": "target-node-guid",
  "metadata": {
    "location": {
      "file": "src/main.rs",
      "line": 42,
      "col": 10
    },
    "count": 3,
    "is_async": false,
    "is_conditional": false,
    "call_type": "direct|indirect|async_await|trait_method"
  }
}
```

---

## Node Kinds Hierarchy

```
Workspace (entire codebase)
├── Repository (git repo or logical grouping)
│   ├── Package (Cargo.toml, package.json, pyproject.toml)
│   │   ├── Module (Rust mod, ES module, Python package)
│   │   │   ├── File (source file)
│   │   │   │   ├── Type (struct, class, enum, trait, interface)
│   │   │   │   │   ├── Field (struct field, class property)
│   │   │   │   │   ├── Method (impl method, class method)
│   │   │   │   │   │   ├── Parameter
│   │   │   │   │   │   ├── Statement
│   │   │   │   │   │   │   ├── Line
│   │   │   │   ├── Function (free function, top-level fn)
│   │   │   │   │   ├── Parameter
│   │   │   │   │   ├── Statement
│   │   │   │   │   │   ├── Line
│   │   │   │   ├── Import
│   │   │   │   ├── Export
│   │   │   │   ├── Constant
│   │   │   │   ├── Static
│   │   │   │   ├── TypeAlias
│   │   │   │   ├── Macro
```

---

## Edge Types

### Structural (replaces nesting for some relationships)
- `CONTAINS` - Parent contains child (mostly implicit in nesting)
- `BELONGS_TO` - Member belongs to type

### Code Flow
- `CALLS` - Function/method calls another
- `RETURNS` - Function returns value to caller
- `AWAITS` - Async call awaits result

### Dependencies
- `IMPORTS` - Module imports from another
- `EXPORTS` - Module exports symbol
- `USES` - General usage/reference
- `DEPENDS_ON` - Package-level dependency

### Type System
- `IMPLEMENTS` - Type implements interface/trait
- `EXTENDS` - Type extends base class
- `SATISFIES` - Type satisfies constraint
- `HAS_TYPE` - Variable has type

### Data Flow
- `READS` - Reads variable/field
- `WRITES` - Writes variable/field
- `MUTATES` - Mutates data

### Testing
- `TESTS` - Test case tests target
- `COVERS` - Code coverage relationship

### Angular Specific
- `INJECTS` - DI injection
- `ROUTES_TO` - Router routes to component
- `BINDS` - Template binding to component

### Rust Specific
- `EXPANDS_TO` - Macro expansion
- `BORROWS` - Borrow checker relationship

---

## Language-Specific Mappings

### Rust
```
Package → Cargo crate (Cargo.toml)
Module → mod declarations (mod.rs, lib.rs, main.rs)
Type → struct, enum, union, trait
Function → fn (free functions)
Method → fn in impl block
Field → struct field
```

### TypeScript/Angular
```
Package → npm package (package.json)
Module → ES module (.ts file) + NgModule
Type → class, interface, type alias, Component, Service
Function → top-level function
Method → class method
Field → class property
```

### Python
```
Package → package (pyproject.toml, __init__.py)
Module → .py file
Type → class, dataclass, Protocol
Function → def (module-level)
Method → def (class-level)
Field → class attribute
```

---

## Example: Small Rust File

```rust
// src/lib.rs
pub struct User {
    pub name: String,
    age: u32,
}

impl User {
    pub fn new(name: String) -> Self {
        let age = 0;
        Self { name, age }
    }
}

pub fn create_user(name: &str) -> User {
    User::new(name.to_string())
}
```

### Generated Nodes (nested JSON)

```json
{
  "guid": "workspace-001",
  "kind": "Workspace",
  "name": "kalisi",
  "language": "multi",
  "children": [
    {
      "guid": "repo-001",
      "kind": "Repository",
      "name": "kalisi",
      "children": [
        {
          "guid": "pkg-001",
          "kind": "Package",
          "name": "my-crate",
          "language": "rust",
          "metadata": {"manifest": "Cargo.toml"},
          "children": [
            {
              "guid": "file-001",
              "kind": "File",
              "name": "lib.rs",
              "language": "rust",
              "location": {"path": "src/lib.rs"},
              "hash": "abc123...",
              "children": [
                {
                  "guid": "type-001",
                  "kind": "Type",
                  "name": "User",
                  "language": "rust",
                  "location": {"start_line": 1, "end_line": 4},
                  "metadata": {
                    "type_kind": "struct",
                    "visibility": "public",
                    "fields_count": 2
                  },
                  "children": [
                    {
                      "guid": "field-001",
                      "kind": "Field",
                      "name": "name",
                      "metadata": {
                        "visibility": "public",
                        "field_type": "String"
                      }
                    },
                    {
                      "guid": "field-002",
                      "kind": "Field",
                      "name": "age",
                      "metadata": {
                        "visibility": "private",
                        "field_type": "u32"
                      }
                    },
                    {
                      "guid": "method-001",
                      "kind": "Method",
                      "name": "new",
                      "location": {"start_line": 7, "end_line": 10},
                      "metadata": {
                        "visibility": "public",
                        "return_type": "Self",
                        "parameters": [{"name": "name", "type": "String"}]
                      },
                      "children": [
                        {
                          "guid": "stmt-001",
                          "kind": "Statement",
                          "name": "let age = 0",
                          "location": {"start_line": 8}
                        },
                        {
                          "guid": "stmt-002",
                          "kind": "Statement",
                          "name": "Self { name, age }",
                          "location": {"start_line": 9}
                        }
                      ]
                    }
                  ]
                },
                {
                  "guid": "fn-001",
                  "kind": "Function",
                  "name": "create_user",
                  "location": {"start_line": 13, "end_line": 15},
                  "metadata": {
                    "visibility": "public",
                    "return_type": "User",
                    "parameters": [{"name": "name", "type": "&str"}]
                  },
                  "children": [
                    {
                      "guid": "stmt-003",
                      "kind": "Statement",
                      "name": "User::new(name.to_string())",
                      "location": {"start_line": 14}
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Generated Edges (flat JSON)

```json
[
  {
    "guid": "edge-001",
    "edge_type": "CALLS",
    "from_guid": "fn-001",
    "to_guid": "method-001",
    "metadata": {
      "location": {"file": "src/lib.rs", "line": 14},
      "call_type": "direct"
    }
  },
  {
    "guid": "edge-002",
    "edge_type": "CALLS",
    "from_guid": "fn-001",
    "to_guid": "string-to_string-std",
    "metadata": {
      "location": {"file": "src/lib.rs", "line": 14},
      "call_type": "method"
    }
  }
]
```

---

## Change Detection & Incremental Updates

### File Hash Strategy
1. Compute SHA-256 of file content
2. Store in node metadata
3. On file change, compare hash
4. If different:
   - Re-parse file
   - Replace file node and all children
   - Rebuild edges originating from that file
   - Keep all other nodes unchanged

### Update Algorithm
```
on_file_change(path):
  1. Find file node by path
  2. Compute new hash
  3. If hash unchanged → skip
  4. Parse file with Tree-sitter
  5. Build new node subtree
  6. Replace old node in parent
  7. Delete old edges where from_guid in old subtree
  8. Generate new edges from new subtree
  9. Save updated model
```

---

## Model Persistence

### Two Files
- `nodes.json` - Nested hierarchy (entire tree in one file)
- `edges.json` - Flat array of all edges

### Why Separate?
- Nodes form natural tree (easy to traverse)
- Edges are cross-cutting (don't fit in tree)
- Edges reference nodes by GUID
- Easy to query: "show all CALLS edges from function X"

### Alternative: Single File
```json
{
  "version": "1.0.0",
  "workspace": {...nested nodes...},
  "edges": [...]
}
```

---

## Quality Metrics

A high-quality model has:
- ✅ **100% GUID coverage** - Every node and edge has unique ID
- ✅ **Location precision** - Line/column for all code elements
- ✅ **Complete hierarchy** - No orphaned nodes
- ✅ **Accurate edges** - All function calls captured
- ✅ **Rich metadata** - Visibility, types, complexity
- ✅ **Language parity** - Same depth for Rust/TS/Python
- ✅ **Incremental ready** - Hashes for change detection
- ✅ **Queryable** - Can answer "show all X" questions

---

## Next Steps

1. ✅ **Design complete** - This document
2. ⏭️ **Implement schema** - Rust structs
3. ⏭️ **Build Rust parser** - Tree-sitter extraction
4. ⏭️ **Generate sample output** - Run on real code
5. ⏭️ **Validate quality** - Check metrics above
6. ⏭️ **Add file watching** - Incremental updates
7. ⏭️ **Add TypeScript** - Multi-language
8. ⏭️ **Query interface** - Agents consume model
