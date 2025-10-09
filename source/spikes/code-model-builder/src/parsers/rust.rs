use crate::model::schema::*;
use anyhow::Result;
use sha2::{Digest, Sha256};
use tree_sitter::{Node as TsNode, Parser};

pub struct RustParser {
    parser: Parser,
}

impl RustParser {
    pub fn new() -> Result<Self> {
        let mut parser = Parser::new();
        let language = tree_sitter_rust::LANGUAGE.into();
        parser.set_language(&language)?;
        Ok(Self { parser })
    }

    pub fn parse_file(&mut self, path: &str, source: &str) -> Result<Node> {
        let tree = self
            .parser
            .parse(source, None)
            .ok_or_else(|| anyhow::anyhow!("Failed to parse Rust file"))?;

        // Compute file hash for change detection
        let mut hasher = Sha256::new();
        hasher.update(source.as_bytes());
        let hash = format!("{:x}", hasher.finalize());

        let root = tree.root_node();

        let mut file_node = Node::new(NodeKind::File, path.to_string(), Language::Rust)
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
                "struct_item" => {
                    if let Some(struct_node) = self.parse_struct(&child, source, file_path)? {
                        parent.add_child(struct_node);
                    }
                }
                "enum_item" => {
                    if let Some(enum_node) = self.parse_enum(&child, source, file_path)? {
                        parent.add_child(enum_node);
                    }
                }
                "trait_item" => {
                    if let Some(trait_node) = self.parse_trait(&child, source, file_path)? {
                        parent.add_child(trait_node);
                    }
                }
                "function_item" => {
                    if let Some(fn_node) = self.parse_function(&child, source, file_path, false)? {
                        parent.add_child(fn_node);
                    }
                }
                "impl_item" => {
                    if let Some(impl_node) = self.parse_impl(&child, source, file_path)? {
                        parent.add_child(impl_node);
                    }
                }
                "use_declaration" => {
                    if let Some(import_node) = self.parse_use(&child, source, file_path)? {
                        parent.add_child(import_node);
                    }
                }
                "const_item" | "static_item" => {
                    if let Some(const_node) = self.parse_const(&child, source, file_path)? {
                        parent.add_child(const_node);
                    }
                }
                "type_item" => {
                    if let Some(type_node) = self.parse_type_alias(&child, source, file_path)? {
                        parent.add_child(type_node);
                    }
                }
                "macro_definition" | "macro_rules" => {
                    if let Some(macro_node) = self.parse_macro(&child, source, file_path)? {
                        parent.add_child(macro_node);
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

    fn parse_struct(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "type_identifier")
            .unwrap_or_else(|| "UnnamedStruct".to_string());

        let visibility = self.extract_visibility(node, source);
        let location = self.node_location(node, file_path);

        let mut metadata = Metadata::default();
        metadata.visibility = Some(visibility);
        metadata.type_kind = Some("struct".to_string());

        let mut struct_node = Node::new(NodeKind::Struct, name, Language::Rust)
            .with_location(location)
            .with_metadata(metadata);

        // Extract fields
        if let Some(field_list) = self.find_child(node, "field_declaration_list") {
            let mut cursor = field_list.walk();
            for field in field_list.children(&mut cursor) {
                if field.kind() == "field_declaration" {
                    if let Some(field_node) = self.parse_field(&field, source, file_path)? {
                        struct_node.add_child(field_node);
                    }
                }
            }
        }

        Ok(Some(struct_node))
    }

    fn parse_field(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "field_identifier")
            .unwrap_or_else(|| "field".to_string());

        let field_type = self
            .find_child_text(node, source, "type_identifier")
            .or_else(|| self.find_child_text(node, source, "primitive_type"))
            .unwrap_or_else(|| "unknown".to_string());

        let visibility = self.extract_visibility(node, source);

        let mut metadata = Metadata::default();
        metadata.visibility = Some(visibility);
        metadata.field_type = Some(field_type);

        let field_node = Node::new(NodeKind::Field, name, Language::Rust)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(field_node))
    }

    fn parse_enum(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "type_identifier")
            .unwrap_or_else(|| "UnnamedEnum".to_string());

        let visibility = self.extract_visibility(node, source);

        let mut metadata = Metadata::default();
        metadata.visibility = Some(visibility);
        metadata.type_kind = Some("enum".to_string());

        let enum_node = Node::new(NodeKind::Enum, name, Language::Rust)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(enum_node))
    }

    fn parse_trait(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "type_identifier")
            .unwrap_or_else(|| "UnnamedTrait".to_string());

        let visibility = self.extract_visibility(node, source);

        let mut metadata = Metadata::default();
        metadata.visibility = Some(visibility);

        let trait_node = Node::new(NodeKind::Trait, name, Language::Rust)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(trait_node))
    }

    fn parse_function(
        &self,
        node: &TsNode,
        source: &str,
        file_path: &str,
        is_method: bool,
    ) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "identifier")
            .unwrap_or_else(|| "unnamed".to_string());

        let visibility = self.extract_visibility(node, source);
        let is_async = self.has_child(node, "async");
        let is_unsafe = self.has_child(node, "unsafe");

        let mut metadata = Metadata::default();
        metadata.visibility = Some(visibility);
        metadata.is_async = Some(is_async);
        metadata.is_unsafe = Some(is_unsafe);

        // Extract parameters
        if let Some(params) = self.find_child(node, "parameters") {
            let parameters = self.extract_parameters(&params, source)?;
            if !parameters.is_empty() {
                metadata.parameters = Some(parameters);
            }
        }

        // Extract return type
        if let Some(ret_type) = self.find_child_text(node, source, "type_identifier") {
            metadata.return_type = Some(ret_type);
        }

        let kind = if is_method {
            NodeKind::Method
        } else {
            NodeKind::Function
        };

        let fn_node = Node::new(kind, name, Language::Rust)
            .with_location(self.node_location(node, file_path))
            .with_metadata(metadata);

        Ok(Some(fn_node))
    }

    fn parse_impl(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let type_name = self
            .find_child_text(node, source, "type_identifier")
            .unwrap_or_else(|| "impl".to_string());

        let name = format!("impl {}", type_name);

        let mut impl_node = Node::new(NodeKind::Impl, name, Language::Rust)
            .with_location(self.node_location(node, file_path));

        // Extract methods
        if let Some(body) = self.find_child(node, "declaration_list") {
            let mut cursor = body.walk();
            for child in body.children(&mut cursor) {
                if child.kind() == "function_item" {
                    if let Some(method_node) =
                        self.parse_function(&child, source, file_path, true)?
                    {
                        impl_node.add_child(method_node);
                    }
                }
            }
        }

        Ok(Some(impl_node))
    }

    fn parse_use(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let use_text = self.node_text(node, source);

        let import_node = Node::new(NodeKind::Import, use_text, Language::Rust)
            .with_location(self.node_location(node, file_path));

        Ok(Some(import_node))
    }

    fn parse_const(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "identifier")
            .unwrap_or_else(|| "const".to_string());

        let is_static = node.kind() == "static_item";

        let mut metadata = Metadata::default();
        metadata.is_static = Some(is_static);
        metadata.is_const = Some(!is_static);

        let kind = if is_static {
            NodeKind::Static
        } else {
            NodeKind::Constant
        };

        let const_node = Node::new(kind, name, Language::Rust)
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

        let type_node = Node::new(NodeKind::TypeAlias, name, Language::Rust)
            .with_location(self.node_location(node, file_path));

        Ok(Some(type_node))
    }

    fn parse_macro(&self, node: &TsNode, source: &str, file_path: &str) -> Result<Option<Node>> {
        let name = self
            .find_child_text(node, source, "identifier")
            .unwrap_or_else(|| "macro".to_string());

        let macro_node = Node::new(NodeKind::Macro, name, Language::Rust)
            .with_location(self.node_location(node, file_path));

        Ok(Some(macro_node))
    }

    // Helper methods

    fn extract_parameters(&self, params_node: &TsNode, source: &str) -> Result<Vec<Parameter>> {
        let mut parameters = Vec::new();
        let mut cursor = params_node.walk();

        for child in params_node.children(&mut cursor) {
            if child.kind() == "parameter" {
                let name = self
                    .find_child_text(&child, source, "identifier")
                    .unwrap_or_else(|| "param".to_string());

                let param_type = self
                    .find_child_text(&child, source, "type_identifier")
                    .or_else(|| self.find_child_text(&child, source, "primitive_type"));

                parameters.push(Parameter { name, param_type });
            }
        }

        Ok(parameters)
    }

    fn extract_visibility(&self, node: &TsNode, source: &str) -> Visibility {
        if self.has_child(node, "visibility_modifier") {
            if let Some(vis_node) = self.find_child(node, "visibility_modifier") {
                let vis_text = self.node_text(&vis_node, source);
                match vis_text.as_str() {
                    "pub" => Visibility::Public,
                    "pub(crate)" => Visibility::Crate,
                    _ => Visibility::Private,
                }
            } else {
                Visibility::Public
            }
        } else {
            Visibility::Private
        }
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
