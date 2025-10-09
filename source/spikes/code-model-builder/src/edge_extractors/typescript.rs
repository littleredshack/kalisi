use super::EdgeExtractor;
use crate::model::schema::*;
use crate::symbol_table::SymbolTable;
use anyhow::Result;
use tree_sitter::{Node as TsNode, Parser};

pub struct TypeScriptEdgeExtractor {
    parser: Parser,
}

impl TypeScriptEdgeExtractor {
    pub fn new() -> Result<Self> {
        let mut parser = Parser::new();
        let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into();
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

    /// Check if a node is inside a conditional block (if, switch, etc.)
    fn is_inside_conditional(&self, node: &TsNode) -> bool {
        let mut current = node.parent();
        while let Some(parent) = current {
            match parent.kind() {
                "if_statement" | "switch_statement" | "while_statement" | "for_statement"
                | "ternary_expression" => {
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
        // For call_expression, find the identifier or member_expression
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            match child.kind() {
                "identifier" => {
                    return Some(self.node_text(&child, source));
                }
                "member_expression" => {
                    // For method calls like foo.bar(), get "bar"
                    let mut member_cursor = child.walk();
                    for member_child in child.children(&mut member_cursor) {
                        if member_child.kind() == "property_identifier" {
                            return Some(self.node_text(&member_child, source));
                        }
                    }
                }
                _ => {}
            }
        }
        None
    }

    fn node_text(&self, node: &TsNode, source: &str) -> String {
        node.utf8_text(source.as_bytes()).unwrap_or("").to_string()
    }
}

impl EdgeExtractor for TypeScriptEdgeExtractor {
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
            .ok_or_else(|| anyhow::anyhow!("Failed to parse TypeScript file"))?;

        let root = tree.root_node();
        let file_path = &file_node
            .location
            .as_ref()
            .map(|l| l.path.clone())
            .unwrap_or_default();

        // Walk the tree looking for different edge types
        self.walk_for_calls(
            &root,
            source,
            file_node,
            file_path,
            symbol_table,
            &mut edges,
        )?;
        self.walk_for_imports(
            &root,
            source,
            file_node,
            file_path,
            symbol_table,
            &mut edges,
        )?;
        self.walk_for_implements(
            &root,
            source,
            file_node,
            file_path,
            symbol_table,
            &mut edges,
        )?;
        self.walk_for_extends(
            &root,
            source,
            file_node,
            file_path,
            symbol_table,
            &mut edges,
        )?;
        self.walk_for_awaits(
            &root,
            source,
            file_node,
            file_path,
            symbol_table,
            &mut edges,
        )?;

        Ok(edges)
    }
}

impl TypeScriptEdgeExtractor {
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
                if let Some(callee_guid) =
                    symbol_table.resolve_with_context(&callee_name, file_path)
                {
                    // Find the containing function (caller)
                    let call_site_offset = node.start_byte();
                    if let Some(caller_guid) =
                        self.find_containing_function(file_node, call_site_offset)
                    {
                        // Check if call is inside conditional
                        let is_conditional = self.is_inside_conditional(node);

                        // Create CALLS edge
                        let edge = Edge::new(EdgeType::Calls, caller_guid, callee_guid)
                            .with_metadata(EdgeMetadata {
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
        // Check if this is an import_statement
        if node.kind() == "import_statement" {
            // Look for imported identifiers
            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                if child.kind() == "import_clause" {
                    // Extract imported names
                    let mut import_cursor = child.walk();
                    for import_child in child.children(&mut import_cursor) {
                        match import_child.kind() {
                            "identifier" => {
                                let imported_name = self.node_text(&import_child, source);
                                if let Some(imported_guid) = symbol_table.resolve(&imported_name) {
                                    let edge = Edge::new(
                                        EdgeType::Imports,
                                        file_node.guid.clone(),
                                        imported_guid,
                                    )
                                    .with_metadata(
                                        EdgeMetadata {
                                            location: Some(EdgeLocation {
                                                file: file_path.to_string(),
                                                line: node.start_position().row + 1,
                                                col: Some(node.start_position().column),
                                            }),
                                            ..Default::default()
                                        },
                                    );
                                    edges.push(edge);
                                }
                            }
                            "named_imports" => {
                                // Handle { Foo, Bar } style imports
                                let mut named_cursor = import_child.walk();
                                for named_child in import_child.children(&mut named_cursor) {
                                    if named_child.kind() == "import_specifier" {
                                        let imported_name = self.node_text(&named_child, source);
                                        if let Some(imported_guid) =
                                            symbol_table.resolve(&imported_name)
                                        {
                                            let edge = Edge::new(
                                                EdgeType::Imports,
                                                file_node.guid.clone(),
                                                imported_guid,
                                            )
                                            .with_metadata(EdgeMetadata {
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
                            }
                            _ => {}
                        }
                    }
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

    fn walk_for_implements(
        &self,
        node: &TsNode,
        source: &str,
        file_node: &Node,
        file_path: &str,
        symbol_table: &SymbolTable,
        edges: &mut Vec<Edge>,
    ) -> Result<()> {
        // Check if this is a class_declaration with implements clause
        if node.kind() == "class_declaration" {
            let mut class_name: Option<String> = None;
            let mut implements: Vec<String> = Vec::new();

            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                match child.kind() {
                    "type_identifier" | "identifier" => {
                        if class_name.is_none() {
                            class_name = Some(self.node_text(&child, source));
                        }
                    }
                    "class_heritage" => {
                        // Find implements clause
                        let mut heritage_cursor = child.walk();
                        for heritage_child in child.children(&mut heritage_cursor) {
                            if heritage_child.kind() == "implements_clause" {
                                let mut impl_cursor = heritage_child.walk();
                                for impl_child in heritage_child.children(&mut impl_cursor) {
                                    if impl_child.kind() == "type_identifier" {
                                        implements.push(self.node_text(&impl_child, source));
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }

            // Create IMPLEMENTS edges
            if let Some(class_name) = class_name {
                if let Some(class_guid) = symbol_table.resolve_with_context(&class_name, file_path)
                {
                    for interface_name in implements {
                        if let Some(interface_guid) = symbol_table.resolve(&interface_name) {
                            let edge =
                                Edge::new(EdgeType::Implements, class_guid.clone(), interface_guid)
                                    .with_metadata(EdgeMetadata {
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
            }
        }

        // Recursively walk children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_for_implements(&child, source, file_node, file_path, symbol_table, edges)?;
        }

        Ok(())
    }

    fn walk_for_extends(
        &self,
        node: &TsNode,
        source: &str,
        file_node: &Node,
        file_path: &str,
        symbol_table: &SymbolTable,
        edges: &mut Vec<Edge>,
    ) -> Result<()> {
        // Check if this is a class_declaration with extends clause
        if node.kind() == "class_declaration" {
            let mut class_name: Option<String> = None;
            let mut extends: Option<String> = None;

            let mut cursor = node.walk();
            for child in node.children(&mut cursor) {
                match child.kind() {
                    "type_identifier" | "identifier" => {
                        if class_name.is_none() {
                            class_name = Some(self.node_text(&child, source));
                        }
                    }
                    "class_heritage" => {
                        // Find extends clause
                        let mut heritage_cursor = child.walk();
                        for heritage_child in child.children(&mut heritage_cursor) {
                            if heritage_child.kind() == "extends_clause" {
                                let mut extends_cursor = heritage_child.walk();
                                for extends_child in heritage_child.children(&mut extends_cursor) {
                                    if extends_child.kind() == "type_identifier"
                                        || extends_child.kind() == "identifier"
                                    {
                                        extends = Some(self.node_text(&extends_child, source));
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }

            // Create EXTENDS edge
            if let (Some(class_name), Some(parent_name)) = (class_name, extends) {
                if let (Some(class_guid), Some(parent_guid)) = (
                    symbol_table.resolve_with_context(&class_name, file_path),
                    symbol_table.resolve(&parent_name),
                ) {
                    let edge = Edge::new(EdgeType::Extends, class_guid, parent_guid).with_metadata(
                        EdgeMetadata {
                            location: Some(EdgeLocation {
                                file: file_path.to_string(),
                                line: node.start_position().row + 1,
                                col: Some(node.start_position().column),
                            }),
                            ..Default::default()
                        },
                    );
                    edges.push(edge);
                }
            }
        }

        // Recursively walk children
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            self.walk_for_extends(&child, source, file_node, file_path, symbol_table, edges)?;
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
                        if let Some(callee_guid) =
                            symbol_table.resolve_with_context(&callee_name, file_path)
                        {
                            // Find the containing function (caller)
                            let await_site_offset = node.start_byte();
                            if let Some(caller_guid) =
                                self.find_containing_function(file_node, await_site_offset)
                            {
                                // Check if await is inside conditional
                                let is_conditional = self.is_inside_conditional(node);

                                // Create AWAITS edge
                                let edge = Edge::new(EdgeType::Awaits, caller_guid, callee_guid)
                                    .with_metadata(EdgeMetadata {
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
