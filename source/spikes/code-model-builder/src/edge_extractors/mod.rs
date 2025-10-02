pub mod rust;
pub mod typescript;

use crate::model::schema::*;
use crate::symbol_table::SymbolTable;
use anyhow::Result;

/// Trait for extracting edges from source code
pub trait EdgeExtractor {
    /// Extract edges from a file's AST
    /// Returns a vector of edges with actual UUIDs for from_guid and to_guid
    fn extract_edges(
        &mut self,
        source: &str,
        file_node: &Node,
        symbol_table: &SymbolTable,
    ) -> Result<Vec<Edge>>;
}

pub use rust::RustEdgeExtractor;
pub use typescript::TypeScriptEdgeExtractor;
