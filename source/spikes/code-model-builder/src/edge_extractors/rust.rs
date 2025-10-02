use super::EdgeExtractor;
use crate::model::schema::*;
use crate::symbol_table::SymbolTable;
use anyhow::Result;
use tree_sitter::{Node as TsNode, Parser};

pub struct RustEdgeExtractor {
    parser: Parser,
}

impl RustEdgeExtractor {
    pub fn new() -> Result<Self> {
        let mut parser = Parser::new();
        let language = tree_sitter_rust::LANGUAGE.into();
        parser.set_language(&language)?;
        Ok(Self { parser })
    }

    /// Find the containing function/method node that contains this position
    fn find_containing_function(&self, node: &Node, byte_offset: usize) -> Option<String> {
        // Check if this node is a function/method and contains the offset
        if matches!(node.kind, NodeKind::Function | NodeKind::Method) {
            if let Some(loc) = &node.location {
                if let (Some(start), Some(end)) = (loc.byte_start, loc.byte_end) {
                    if byte_offset >= start && byte_offset <= end {
                        return Some(node.guid.clone());
                    }
                }
            }
        }

        // Recursively search children
        for child in &node.children {
            if let Some(guid) = self.find_containing_function(child, byte_offset) {
                return Some(guid);
            }
        }

        None
    }

    /// Check if a node is inside a conditional block (if, match, etc.)
    fn is_inside_conditional(&self, node: &TsNode) -> bool {
        let mut current = node.parent();
        while let Some(parent) = current {
            match parent.kind() {
                "if_expression" | "match_expression" | "while_expression" | "for_expression" => {
                    return true;
                }
                _ => {}
            }
            current = parent.parent();
        }
        false
    }

    /// Extract function name from call expression
    fn extract_callee_name(&self, node: &TsNode, source: &str) -> Option<String> {
        // For call_expression, find the identifier or field_expression
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            match child.kind() {
                "identifier" => {
                    return Some(self.node_text(&child, source));
                }
                "field_expression" => {
                    // For method calls like foo.bar(), get "bar"
                    let mut field_cursor = child.walk();
                    for field_child in child.children(&mut field_cursor) {
                        if field_child.kind() == "field_identifier" {
                            return Some(self.node_text(&field_child, source));
                        }
                    }
                }
                "scoped_identifier" => {
                    // For fully qualified calls like module::function()
                    return Some(self.node_text(&child, source));
                }
                _ => {}
            }
        }
        None
    }

    fn node_text(&self, node: &TsNode, source: &str) -> String {
        node.utf8_text(source.as_bytes())
            .unwrap_or("")
            .to_string()
    }
}

impl EdgeExtractor for RustEdgeExtractor {
    fn extract_edges(
        &mut self,
        source: &str,
        file_node: &Node,
        symbol_table: &SymbolTable,
    ) -> Result<Vec<Edge>> {
        let mut edges = Vec::new();

        let tree = self
            .parser
            .parse(source, None)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse Rust file"))?;

        let root = tree.root_node();
        let file_path = &file_node.location.as_ref()
            .map(|l| l.path.clone())
            .unwrap_or_default();

        // Walk the tree looking for different edge types
        self.walk_for_calls(&root, source, file_node, file_path, symbol_table, &mut edges)?;
        self.walk_for_imports(&root, source, file_node, file_path, symbol_table, &mut edges)?;
        self.walk_for_trait_impls(&root, source, file_node, file_path, symbol_table, &mut edges)?;
        self.walk_for_awaits(&root, source, file_node, file_path, symbol_table, &mut edges)?;

        Ok(edges)
    }
}

impl RustEdgeExtractor {
    fn walk_for_calls(
        &self,
        node: &TsNode,
        source: &str,
        file_node: &Node,
        file_path: &str,
        symbol_table: &SymbolTable,
        edges: &mut Vec<Edge>,
    ) -> Result<()> {
        // Check if this is a call expression
        if node.kind() == "call_expression" {
            // Extract the callee name
            if let Some(callee_name) = self.extract_callee_name(node, source) {
                // Resolve callee to GUID
                if let Some(callee_guid) = symbol_table.resolve_with_context(&callee_name, file_path) {
                    // Find the containing function (caller)
                    let call_site_offset = node.start_byte();
                    if let Some(caller_guid) = self.find_containing_function(file_node, call_site_offset) {
                        // Check if call is inside conditional
                        let is_conditional = self.is_inside_conditional(node);

                        // Create CALLS edge
                        let edge = Edge::new(
                            EdgeType::Calls,
                            caller_guid,
                            callee_guid,
                        ).with_metadata(EdgeMetadata {
                            location: Some(EdgeLocation {
                                file: file_path.to_string(),
                                line: node.start_position().row + 1,
                                col: Some(node.start_position().column),
                            }),
                            is_async: None,
                            is_conditional: Some(is_conditional),
                            count: None,
                            call_type: Some(CallType::Direct),
                        });

                        edges.push(edge);
                    }
                }
            }
        }

        // Recursively walk children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_for_calls(&child, source, file_node, file_path, symbol_table, edges)?;
        }

        Ok(())
    }

    fn walk_for_imports(
        &self,
        node: &TsNode,
        source: &str,
        file_node: &Node,
        file_path: &str,
        symbol_table: &SymbolTable,
        edges: &mut Vec<Edge>,
    ) -> Result<()> {
        // Check if this is a use_declaration
        if node.kind() == "use_declaration" {
            // Extract the imported module/item name
            let use_text = self.node_text(node, source);

            // Parse the use statement to extract what's being imported
            // Examples: "use foo::bar", "use std::collections::HashMap"
            let imported_name = self.extract_import_name(&use_text);

            if let Some(name) = imported_name {
                // Try to resolve the imported symbol
                if let Some(imported_guid) = symbol_table.resolve(&name) {
                    // The importer is the file itself
                    let edge = Edge::new(
                        EdgeType::Imports,
                        file_node.guid.clone(),
                        imported_guid,
                    ).with_metadata(EdgeMetadata {
                        location: Some(EdgeLocation {
                            file: file_path.to_string(),
                            line: node.start_position().row + 1,
                            col: Some(node.start_position().column),
                        }),
                        ..Default::default()
                    });

                    edges.push(edge);
                }
            }
        }

        // Recursively walk children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_for_imports(&child, source, file_node, file_path, symbol_table, edges)?;
        }

        Ok(())
    }

    fn extract_import_name(&self, use_text: &str) -> Option<String> {
        // Extract the last identifier from use statements
        // "use foo::bar::Baz" -> "Baz"
        // "use std::collections::HashMap" -> "HashMap"
        use_text
            .trim_start_matches("use ")
            .trim_end_matches(';')
            .split("::")
            .last()
            .map(|s| s.trim().to_string())
    }

    fn walk_for_trait_impls(
        &self,
        node: &TsNode,
        source: &str,
        file_node: &Node,
        file_path: &str,
        symbol_table: &SymbolTable,
        edges: &mut Vec<Edge>,
    ) -> Result<()> {
        // Check if this is an impl_item with a trait
        if node.kind() == "impl_item" {
            // Look for trait_identifier (impl Trait for Type)
            let mut cursor = node.walk();
            let mut trait_name: Option<String> = None;
            let mut type_name: Option<String> = None;

            for child in node.children(&mut cursor) {
                match child.kind() {
                    "type_identifier" => {
                        // First type_identifier after "for" is the implementing type
                        if type_name.is_none() {
                            type_name = Some(self.node_text(&child, source));
                        } else if trait_name.is_none() {
                            // If we already have a type, this must be the trait
                            trait_name = Some(self.node_text(&child, source));
                        }
                    }
                    _ => {}
                }
            }

            // If we found both trait and type, create IMPLEMENTS edge
            if let (Some(trait_name), Some(type_name)) = (trait_name, type_name) {
                if let (Some(type_guid), Some(trait_guid)) = (
                    symbol_table.resolve_with_context(&type_name, file_path),
                    symbol_table.resolve(&trait_name),
                ) {
                    let edge = Edge::new(
                        EdgeType::Implements,
                        type_guid,
                        trait_guid,
                    ).with_metadata(EdgeMetadata {
                        location: Some(EdgeLocation {
                            file: file_path.to_string(),
                            line: node.start_position().row + 1,
                            col: Some(node.start_position().column),
                        }),
                        ..Default::default()
                    });

                    edges.push(edge);
                }
            }
        }

        // Recursively walk children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_for_trait_impls(&child, source, file_node, file_path, symbol_table, edges)?;
        }

        Ok(())
    }

    fn walk_for_awaits(
        &self,
        node: &TsNode,
        source: &str,
        file_node: &Node,
        file_path: &str,
        symbol_table: &SymbolTable,
        edges: &mut Vec<Edge>,
    ) -> Result<()> {
        // Check if this is an await_expression
        if node.kind() == "await_expression" {
            // Find the call expression being awaited
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "call_expression" {
                    // Extract the callee name
                    if let Some(callee_name) = self.extract_callee_name(&child, source) {
                        // Resolve callee to GUID
                        if let Some(callee_guid) = symbol_table.resolve_with_context(&callee_name, file_path) {
                            // Find the containing function (caller)
                            let await_site_offset = node.start_byte();
                            if let Some(caller_guid) = self.find_containing_function(file_node, await_site_offset) {
                                // Check if await is inside conditional
                                let is_conditional = self.is_inside_conditional(node);

                                // Create AWAITS edge
                                let edge = Edge::new(
                                    EdgeType::Awaits,
                                    caller_guid,
                                    callee_guid,
                                ).with_metadata(EdgeMetadata {
                                    location: Some(EdgeLocation {
                                        file: file_path.to_string(),
                                        line: node.start_position().row + 1,
                                        col: Some(node.start_position().column),
                                    }),
                                    is_async: Some(true),
                                    is_conditional: Some(is_conditional),
                                    call_type: Some(CallType::AsyncAwait),
                                    count: None,
                                });

                                edges.push(edge);
                            }
                        }
                    }
                }
            }
        }

        // Recursively walk children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_for_awaits(&child, source, file_node, file_path, symbol_table, edges)?;
        }

        Ok(())
    }
}
