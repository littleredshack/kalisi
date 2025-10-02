use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Top-level code model containing nested nodes and flat edges
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeModel {
    pub version: String,
    pub workspace: Node,
    pub edges: Vec<Edge>,
}

impl CodeModel {
    pub fn new(workspace_name: String) -> Self {
        Self {
            version: "1.0.0".into(),
            workspace: Node::new(NodeKind::Workspace, workspace_name, Language::Multi),
            edges: Vec::new(),
        }
    }
}

/// Hierarchical node in the code model tree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub guid: String,
    pub kind: NodeKind,
    pub name: String,
    pub language: Language,

    /// Neo4j labels for this node (e.g., ["CodeModel", "Rust", "Function"])
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub labels: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,

    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub children: Vec<Node>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub hash: Option<String>,
}

impl Node {
    pub fn new(kind: NodeKind, name: String, language: Language) -> Self {
        let mut node = Self {
            guid: Uuid::new_v4().to_string(),
            kind,
            name,
            language,
            labels: Vec::new(),
            location: None,
            metadata: None,
            children: Vec::new(),
            hash: None,
        };

        // Auto-generate labels based on kind and language
        node.labels = node.generate_labels();
        node
    }

    /// Generate Neo4j labels for this node
    fn generate_labels(&self) -> Vec<String> {
        let mut labels = vec!["CodeModel".to_string()];

        // Add language label
        labels.push(match self.language {
            Language::Rust => "Rust",
            Language::TypeScript => "TypeScript",
            Language::Python => "Python",
            Language::Multi => "Multi",
            Language::Unknown => "Unknown",
        }.to_string());

        // Add kind label
        labels.push(format!("{:?}", self.kind));

        labels
    }

    pub fn with_location(mut self, location: Location) -> Self {
        self.location = Some(location);
        self
    }

    pub fn with_metadata(mut self, metadata: Metadata) -> Self {
        self.metadata = Some(metadata);
        self
    }

    pub fn with_hash(mut self, hash: String) -> Self {
        self.hash = Some(hash);
        self
    }

    pub fn add_child(&mut self, child: Node) {
        self.children.push(child);
    }
}

/// Node types in the hierarchy
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeKind {
    Workspace,
    Repository,
    Package,
    Module,
    File,
    Type,
    Function,
    Method,
    Field,
    Parameter,
    Statement,
    Line,
    Import,
    Export,
    Constant,
    Static,
    TypeAlias,
    Macro,
    Trait,
    Impl,
    Enum,
    Struct,
    Interface,
    Class,
}

/// Programming language
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Language {
    #[serde(rename = "rust")]
    Rust,
    #[serde(rename = "typescript")]
    TypeScript,
    #[serde(rename = "python")]
    Python,
    #[serde(rename = "multi")]
    Multi,
    #[serde(rename = "unknown")]
    Unknown,
}

/// Source code location
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Location {
    pub path: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_line: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_col: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_line: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_col: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub byte_start: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub byte_end: Option<usize>,
}

/// Rich metadata for nodes
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Metadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub visibility: Option<Visibility>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_async: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_unsafe: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_mutable: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_static: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_const: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub decorators: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub traits: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub implements: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub generics: Option<Vec<String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_type: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<Vec<Parameter>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer: Option<Layer>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<Scope>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub complexity: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub lines_of_code: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment_lines: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub type_kind: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub field_type: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub param_type: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Visibility {
    #[serde(rename = "public")]
    Public,
    #[serde(rename = "private")]
    Private,
    #[serde(rename = "protected")]
    Protected,
    #[serde(rename = "internal")]
    Internal,
    #[serde(rename = "crate")]
    Crate,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Layer {
    #[serde(rename = "ui")]
    UI,
    #[serde(rename = "domain")]
    Domain,
    #[serde(rename = "infra")]
    Infra,
    #[serde(rename = "test")]
    Test,
    #[serde(rename = "build")]
    Build,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Scope {
    #[serde(rename = "app")]
    App,
    #[serde(rename = "feature")]
    Feature,
    #[serde(rename = "shared")]
    Shared,
}

/// Flat edge representing relationships between nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub guid: String,
    pub edge_type: EdgeType,
    pub from_guid: String,
    pub to_guid: String,

    /// Tags for this edge (e.g., ["CodeModel", "Rust"])
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub tags: Vec<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<EdgeMetadata>,
}

impl Edge {
    pub fn new(edge_type: EdgeType, from_guid: String, to_guid: String) -> Self {
        Self {
            guid: Uuid::new_v4().to_string(),
            edge_type,
            from_guid,
            to_guid,
            tags: vec!["CodeModel".to_string()],
            metadata: None,
        }
    }

    pub fn with_metadata(mut self, metadata: EdgeMetadata) -> Self {
        self.metadata = Some(metadata);
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum EdgeType {
    // Structural
    #[serde(rename = "CONTAINS")]
    Contains,
    #[serde(rename = "BELONGS_TO")]
    BelongsTo,

    // Code flow
    #[serde(rename = "CALLS")]
    Calls,
    #[serde(rename = "RETURNS")]
    Returns,
    #[serde(rename = "AWAITS")]
    Awaits,

    // Dependencies
    #[serde(rename = "IMPORTS")]
    Imports,
    #[serde(rename = "EXPORTS")]
    Exports,
    #[serde(rename = "USES")]
    Uses,
    #[serde(rename = "DEPENDS_ON")]
    DependsOn,

    // Type system
    #[serde(rename = "IMPLEMENTS")]
    Implements,
    #[serde(rename = "EXTENDS")]
    Extends,
    #[serde(rename = "SATISFIES")]
    Satisfies,
    #[serde(rename = "HAS_TYPE")]
    HasType,

    // Data flow
    #[serde(rename = "READS")]
    Reads,
    #[serde(rename = "WRITES")]
    Writes,
    #[serde(rename = "MUTATES")]
    Mutates,

    // Testing
    #[serde(rename = "TESTS")]
    Tests,
    #[serde(rename = "COVERS")]
    Covers,

    // Angular specific
    #[serde(rename = "INJECTS")]
    Injects,
    #[serde(rename = "ROUTES_TO")]
    RoutesTo,
    #[serde(rename = "BINDS")]
    Binds,

    // Rust specific
    #[serde(rename = "EXPANDS_TO")]
    ExpandsTo,
    #[serde(rename = "BORROWS")]
    Borrows,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EdgeMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<EdgeLocation>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<usize>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_async: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_conditional: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub call_type: Option<CallType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeLocation {
    pub file: String,
    pub line: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub col: Option<usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CallType {
    #[serde(rename = "direct")]
    Direct,
    #[serde(rename = "indirect")]
    Indirect,
    #[serde(rename = "async_await")]
    AsyncAwait,
    #[serde(rename = "trait_method")]
    TraitMethod,
    #[serde(rename = "macro")]
    Macro,
}
