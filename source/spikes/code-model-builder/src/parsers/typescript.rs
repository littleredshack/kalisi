use crate::model::schema::*;
use anyhow::Result;
use sha2::{Digest, Sha256};
use tree_sitter::{Node as TsNode, Parser};

pub struct TypeScriptParser {
    parser: Parser,
}

impl TypeScriptParser {
    pub fn new() -> Result<Self> {
        let mut parser = Parser::new();
        let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into();
        parser.set_language(&language)?;
        Ok(Self { parser })
    }

    pub fn parse_file(&mut self, path: &str, source: &str) -> Result<Node> {
        let tree = self
            .parser
            .parse(source, None)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse TypeScript file"))?;

        // Compute file hash for change detection
        let mut hasher = Sha256::new();
        hasher.update(source.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        let root = tree.root_node();

        let mut file_node = Node::new(NodeKind::File, path.to_string(), Language::TypeScript)
            .with_location(Location {
                path: path.to_string(),
                start_line: Some(1),
                start_col: Some(0),
                end_line: Some(source.lines().count()),
                end_col: None,
                byte_start: Some(0),
                byte_end: Some(source.len()),
            })
            .with_hash(hash);

        // Extract top-level items
        self.extract_items(&root, source, &mut file_node, path)?;

        Ok(file_node)
    }

    fn extract_items(
        &self,
        node: &TsNode,
        source: &str,
        parent: &mut Node,
        file_path: &str,
    ) -> Result<()> {
        let mut cursor = node.walk();

        for child in node.children(&mut cursor) {
            match child.kind() {
                "class_declaration" => {
                    if let Some(class_node) = self.parse_class(&child, source, file_path)? {
                        parent.add_child(class_node);
                    }
                }
                "interface_declaration" => {
                    if let Some(interface_node) = self.parse_interface(&child, source, file_path)? {
                        parent.add_child(interface_node);
                    }
                }
                "function_declaration" => {
                    if let Some(fn_node) = self.parse_function(&child, source, file_path, false)? {
                        parent.add_child(fn_node);
                    }
                }
                "method_definition" => {
                    if let Some(method_node) =
                        self.parse_function(&child, source, file_path, true)?
                    {
                        parent.add_child(method_node);
                    }
                }
                "import_statement" => {
                    if let Some(import_node) = self.parse_import(&child, source, file_path)? {
                        parent.add_child(import_node);
                    }
                }
                "export_statement" => {
                    if let Some(export_node) = self.parse_export(&child, source, file_path)? {
                        parent.add_child(export_node);
                    }
                }
                "lexical_declaration" | "variable_declaration" => {
                    if let Some(const_node) = self.parse_variable(&child, source, file_path)? {
                        parent.add_child(const_node);
                    }
                }
                "type_alias_declaration" => {
                    if let Some(type_node) = self.parse_type_alias(&child, source, file_path)? {
                        parent.add_child(type_node);
                    }
                }
                "enum_declaration" => {
                    if let Some(enum_node) = self.parse_enum(&child, source, file_path)? {
                        parent.add_child(enum_node);
                    }
                }
                _ => {
                    // Recursively check for nested items
                    self.extract_items(&child, source, parent, file_path)?;
                }
            }
        }

        Ok(())
    }

    fn parse_class(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "type_identifier")
            .or_else(|| self.find_child_text(node, source, "identifier"))
            .unwrap_or_else(|| "UnnamedClass".to_string());

        let mut metadata = Metadata::default();
        metadata.type_kind = Some("class".to_string());

        let mut class_node = Node::new(NodeKind::Class, name, Language::TypeScript)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        // Extract class members (fields and methods)
        if let Some(body) = self.find_child(node, "class_body") {
            let mut cursor = body.walk();
            for child in body.children(&mut cursor) {
                match child.kind() {
                    "method_definition" => {
                        if let Some(method_node) =
                            self.parse_function(&child, source, file_path, true)?
                        {
                            class_node.add_child(method_node);
                        }
                    }
                    "field_definition" | "public_field_definition" => {
                        if let Some(field_node) = self.parse_field(&child, source, file_path)? {
                            class_node.add_child(field_node);
                        }
                    }
                    _ => {}
                }
            }
        }

        Ok(Some(class_node))
    }

    fn parse_field(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "property_identifier")
            .or_else(|| self.find_child_text(node, source, "identifier"))
            .unwrap_or_else(|| "field".to_string());

        let visibility = if self.has_child(node, "accessibility_modifier") {
            let vis_text = self
                .find_child_text(node, source, "accessibility_modifier")
                .unwrap_or_else(|| "public".to_string());
            match vis_text.as_str() {
                "private" => Visibility::Private,
                "protected" => Visibility::Protected,
                _ => Visibility::Public,
            }
        } else {
            Visibility::Public
        };

        let mut metadata = Metadata::default();
        metadata.visibility = Some(visibility);

        let field_node = Node::new(NodeKind::Field, name, Language::TypeScript)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(field_node))
    }

    fn parse_interface(
        &self,
        node: &TsNode,
        source: &str,
        file_path: &str,
    ) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "type_identifier")
            .unwrap_or_else(|| "UnnamedInterface".to_string());

        let mut metadata = Metadata::default();
        metadata.type_kind = Some("interface".to_string());

        let interface_node = Node::new(NodeKind::Interface, name, Language::TypeScript)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(interface_node))
    }

    fn parse_function(
        &self,
        node: &TsNode,
        source: &str,
        file_path: &str,
        is_method: bool,
    ) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "property_identifier")
            .or_else(|| self.find_child_text(node, source, "identifier"))
            .unwrap_or_else(|| "unnamed".to_string());

        let is_async = self.has_child(node, "async");

        let mut metadata = Metadata::default();
        metadata.is_async = Some(is_async);

        // Extract parameters
        if let Some(params) = self.find_child(node, "formal_parameters") {
            let parameters = self.extract_parameters(&params, source)?;
            if !parameters.is_empty() {
                metadata.parameters = Some(parameters);
            }
        }

        let kind = if is_method {
            NodeKind::Method
        } else {
            NodeKind::Function
        };

        let fn_node = Node::new(kind, name, Language::TypeScript)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(fn_node))
    }

    fn parse_import(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let import_text = self.node_text(node, source);

        let import_node = Node::new(NodeKind::Import, import_text, Language::TypeScript)
            .with_location(self.node_location(node, file_path));

        Ok(Some(import_node))
    }

    fn parse_export(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let export_text = self.node_text(node, source);

        let export_node = Node::new(NodeKind::Export, export_text, Language::TypeScript)
            .with_location(self.node_location(node, file_path));

        Ok(Some(export_node))
    }

    fn parse_variable(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "identifier")
            .unwrap_or_else(|| "variable".to_string());

        let is_const = self.node_text(node, source).starts_with("const");

        let mut metadata = Metadata::default();
        metadata.is_const = Some(is_const);

        let const_node = Node::new(NodeKind::Constant, name, Language::TypeScript)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(const_node))
    }

    fn parse_type_alias(
        &self,
        node: &TsNode,
        source: &str,
        file_path: &str,
    ) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "type_identifier")
            .unwrap_or_else(|| "type".to_string());

        let type_node = Node::new(NodeKind::TypeAlias, name, Language::TypeScript)
            .with_location(self.node_location(node, file_path));

        Ok(Some(type_node))
    }

    fn parse_enum(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "identifier")
            .unwrap_or_else(|| "UnnamedEnum".to_string());

        let mut metadata = Metadata::default();
        metadata.type_kind = Some("enum".to_string());

        let enum_node = Node::new(NodeKind::Enum, name, Language::TypeScript)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(enum_node))
    }

    // Helper methods

    fn extract_parameters(&self, params_node: &TsNode, source: &str) -> Result<Vec<Parameter>> {
        let mut parameters = Vec::new();
        let mut cursor = params_node.walk();

        for child in params_node.children(&mut cursor) {
            if child.kind() == "required_parameter" || child.kind() == "optional_parameter" {
                let name = self
                    .find_child_text(&child, source, "identifier")
                    .unwrap_or_else(|| "param".to_string());

                let param_type = self.find_child_text(&child, source, "type_annotation");

                parameters.push(Parameter { name, param_type });
            }
        }

        Ok(parameters)
    }

    fn node_location(&self, node: &TsNode, file_path: &str) -> Location {
        let range = node.range();
        Location {
            path: file_path.to_string(),
            start_line: Some(range.start_point.row + 1),
            start_col: Some(range.start_point.column),
            end_line: Some(range.end_point.row + 1),
            end_col: Some(range.end_point.column),
            byte_start: Some(node.start_byte()),
            byte_end: Some(node.end_byte()),
        }
    }

    fn find_child<'a>(&self, node: &'a TsNode, kind: &str) -> Option<TsNode<'a>> {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.kind() == kind {
                return Some(child);
            }
        }
        None
    }

    fn find_child_text(&self, node: &TsNode, source: &str, kind: &str) -> Option<String> {
        self.find_child(node, kind)
            .map(|n| self.node_text(&n, source))
    }

    fn has_child(&self, node: &TsNode, kind: &str) -> bool {
        let mut cursor = node.walk();
        let children: Vec<_> = node.children(&mut cursor).collect();
        children.iter().any(|child| child.kind() == kind)
    }

    fn node_text(&self, node: &TsNode, source: &str) -> String {
        node.utf8_text(source.as_bytes()).unwrap_or("").to_string()
    }
}
