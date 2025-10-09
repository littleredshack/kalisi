use crate::model::schema::*;
use std::collections::HashMap;

/// Symbol information for name resolution
#[derive(Debug, Clone)]
pub struct SymbolInfo {
    pub guid: String,
    pub name: String,
    pub kind: NodeKind,
    pub file_path: String,
    pub fully_qualified_name: String,
}

/// Symbol table for resolving names to GUIDs across the entire codebase
pub struct SymbolTable {
    /// Fully qualified name → GUID
    exact_matches: HashMap<String, String>,

    /// Simple name → Vec<GUID> (for partial matching)
    simple_name_index: HashMap<String, Vec<String>>,

    /// GUID → SymbolInfo (for metadata lookup)
    symbols: HashMap<String, SymbolInfo>,
}

impl SymbolTable {
    pub fn new() -> Self {
        Self {
            exact_matches: HashMap::new(),
            simple_name_index: HashMap::new(),
            symbols: HashMap::new(),
        }
    }

    /// Index all symbols from a node tree
    pub fn index_node(&mut self, node: &Node, path_prefix: &str) {
        let current_path = if path_prefix.is_empty() {
            node.name.clone()
        } else {
            format!("{}::{}", path_prefix, node.name)
        };

        // Index this node if it's a callable/referenceable symbol
        if self.is_indexable(node) {
            let info = SymbolInfo {
                guid: node.guid.clone(),
                name: node.name.clone(),
                kind: node.kind,
                file_path: node
                    .location
                    .as_ref()
                    .map(|l| l.path.clone())
                    .unwrap_or_default(),
                fully_qualified_name: current_path.clone(),
            };

            // Add to exact matches
            self.exact_matches
                .insert(current_path.clone(), node.guid.clone());

            // Add to simple name index
            self.simple_name_index
                .entry(node.name.clone())
                .or_insert_with(Vec::new)
                .push(node.guid.clone());

            // Add to symbols
            self.symbols.insert(node.guid.clone(), info);
        }

        // Recursively index children
        for child in &node.children {
            self.index_node(child, &current_path);
        }
    }

    /// Check if a node should be indexed as a symbol
    fn is_indexable(&self, node: &Node) -> bool {
        matches!(
            node.kind,
            NodeKind::Function
                | NodeKind::Method
                | NodeKind::Struct
                | NodeKind::Enum
                | NodeKind::Class
                | NodeKind::Interface
                | NodeKind::Trait
                | NodeKind::Constant
                | NodeKind::Static
                | NodeKind::TypeAlias
        )
    }

    /// Resolve a name to a GUID (tries exact match first, then simple name)
    pub fn resolve(&self, name: &str) -> Option<String> {
        // Try exact match first
        if let Some(guid) = self.exact_matches.get(name) {
            return Some(guid.clone());
        }

        // Try simple name lookup (if only one match, return it)
        if let Some(candidates) = self.simple_name_index.get(name) {
            if candidates.len() == 1 {
                return Some(candidates[0].clone());
            }
        }

        None
    }

    /// Resolve a name with context (e.g., within a specific file/module)
    pub fn resolve_with_context(&self, name: &str, context_file: &str) -> Option<String> {
        // Try exact match first
        if let Some(guid) = self.exact_matches.get(name) {
            return Some(guid.clone());
        }

        // Try simple name lookup, preferring symbols in the same file
        if let Some(candidates) = self.simple_name_index.get(name) {
            // First pass: look for symbols in the same file
            for guid in candidates {
                if let Some(info) = self.symbols.get(guid) {
                    if info.file_path == context_file {
                        return Some(guid.clone());
                    }
                }
            }

            // Second pass: if only one candidate, use it
            if candidates.len() == 1 {
                return Some(candidates[0].clone());
            }
        }

        None
    }

    /// Get symbol info by GUID
    pub fn get_info(&self, guid: &str) -> Option<&SymbolInfo> {
        self.symbols.get(guid)
    }

    /// Get all candidates for a name
    pub fn get_candidates(&self, name: &str) -> Vec<String> {
        self.simple_name_index
            .get(name)
            .cloned()
            .unwrap_or_default()
    }

    /// Total number of indexed symbols
    pub fn len(&self) -> usize {
        self.symbols.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_and_resolve() {
        let mut table = SymbolTable::new();

        let node = Node::new(NodeKind::Function, "test_fn".into(), Language::Rust);
        let guid = node.guid.clone();

        table.index_node(&node, "module");

        assert_eq!(table.resolve("test_fn"), Some(guid.clone()));
        assert_eq!(table.resolve("module::test_fn"), Some(guid));
    }
}
