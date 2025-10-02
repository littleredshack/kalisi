# Edge Extraction Architecture

## Problem
We need to extract cross-file relationships (CALLS, IMPORTS, etc.) without creating spaghetti code or duplicates.

## Solution: Two-Pass Architecture

### Pass 1: Build Node Hierarchy + Symbol Table
- Parse all files and build the nested node tree (already done)
- **Simultaneously build a Symbol Table**: Map from symbol name → GUID
- Every function, class, method gets indexed by its fully-qualified name
- Example: `api_gateway::handlers::auth::login` → `guid-12345`

### Pass 2: Extract Edges Using Symbol Table
- Walk the AST again looking for call sites, imports, references
- Resolve names using the Symbol Table
- Create edges with GUIDs (no string matching, no duplication)
- Edge structure: `{guid, edge_type, from_guid, to_guid, metadata}`

## Architecture

```
src/
  model/
    schema.rs          ✅ (Node, Edge types)

  parsers/
    rust.rs            ✅ (Parse Rust → Nodes)
    typescript.rs      ✅ (Parse TypeScript → Nodes)

  symbol_table/        🆕
    mod.rs             - Core SymbolTable trait
    builder.rs         - Build symbol table from nodes
    resolver.rs        - Resolve names to GUIDs

  edge_extractors/     🆕
    mod.rs             - EdgeExtractor trait
    rust.rs            - Extract edges from Rust AST
    typescript.rs      - Extract edges from TypeScript AST
```

## Symbol Table Structure

```rust
pub struct SymbolTable {
    // Exact name → GUID (for local scope)
    symbols: HashMap<String, String>,

    // Partial name → Vec<GUID> (for resolution)
    partial_matches: HashMap<String, Vec<String>>,

    // GUID → SymbolInfo (for metadata)
    info: HashMap<String, SymbolInfo>,
}

pub struct SymbolInfo {
    pub guid: String,
    pub name: String,
    pub kind: NodeKind,
    pub file_path: String,
    pub fully_qualified_name: String,
}
```

## Edge Extraction Per Language

### Rust Edge Extractor
```rust
pub trait EdgeExtractor {
    fn extract_edges(
        &mut self,
        source: &str,
        file_node: &Node,
        symbol_table: &SymbolTable,
    ) -> Result<Vec<Edge>>;
}

impl EdgeExtractor for RustEdgeExtractor {
    fn extract_edges(...) -> Result<Vec<Edge>> {
        // Walk AST looking for:
        // - call_expression → CALLS edge
        // - use_declaration → IMPORTS edge
        // - impl_item → IMPLEMENTS edge
        // - await_expression → AWAITS edge

        // For each call site:
        // 1. Extract callee name from AST
        // 2. Resolve to GUID using symbol_table
        // 3. Create Edge { from: caller_guid, to: callee_guid }
    }
}
```

### TypeScript Edge Extractor
```rust
impl EdgeExtractor for TypeScriptEdgeExtractor {
    fn extract_edges(...) -> Result<Vec<Edge>> {
        // Walk AST looking for:
        // - call_expression → CALLS edge
        // - import_statement → IMPORTS edge
        // - class extends → EXTENDS edge
        // - implements clause → IMPLEMENTS edge
    }
}
```

## Key Benefits

✅ **No Duplication**: GUIDs are unique, one edge per relationship
✅ **Cross-File Resolution**: Symbol table spans entire codebase
✅ **Language Agnostic**: Each language has its own clean extractor
✅ **Testable**: Can test symbol table and extractors independently
✅ **Maintainable**: Clear separation of concerns

## Example Flow

```rust
// Pass 1: Build nodes + symbol table
let mut model = CodeModel::new("workspace");
let mut symbol_table = SymbolTable::new();

for file in rust_files {
    let file_node = rust_parser.parse_file(file)?;
    symbol_table.index_node(&file_node)?;  // 🆕 Build symbol table
    model.add_child(file_node);
}

// Pass 2: Extract edges
let mut rust_edge_extractor = RustEdgeExtractor::new();

for file in rust_files {
    let edges = rust_edge_extractor.extract_edges(
        &source,
        &file_node,
        &symbol_table,  // Use symbol table to resolve names
    )?;
    model.edges.extend(edges);
}
```

## Edge Examples

```json
{
  "guid": "edge-uuid-1",
  "edge_type": "CALLS",
  "from_guid": "func-login-guid",
  "to_guid": "func-verify-password-guid",
  "metadata": {
    "location": {
      "file": "handlers/auth.rs",
      "line": 45
    },
    "is_async": true
  }
}
```

## Next Steps
1. Create `symbol_table` module
2. Create `edge_extractors` module with trait
3. Implement Rust edge extractor
4. Implement TypeScript edge extractor
5. Update `build_model.rs` to run two-pass extraction
