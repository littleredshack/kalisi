use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
struct CodebaseGraph {
    nodes: GraphNode,
    edges: Vec<GraphEdge>,
}

#[derive(Debug, Serialize)]
struct GraphNode {
    #[serde(rename = "GUID")]
    guid: String,
    #[serde(rename = "type")]
    node_type: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<GraphNode>>,
}

#[derive(Debug, Serialize)]
struct GraphEdge {
    #[serde(rename = "GUID")]
    guid: String,
    source: String,
    target: String,
    #[serde(rename = "type")]
    edge_type: String,
    name: String,
}

struct Analyzer {
    guid_cache: HashMap<String, String>,
    edges: Vec<GraphEdge>,
    dependency_nodes: HashMap<String, String>, // dependency name -> guid
    workspace_deps: HashMap<String, String>,   // workspace dependencies from root Cargo.toml
}

impl Analyzer {
    fn new() -> Self {
        Self {
            guid_cache: HashMap::new(),
            edges: Vec::new(),
            dependency_nodes: HashMap::new(),
            workspace_deps: HashMap::new(),
        }
    }

    fn load_workspace_dependencies(&mut self, root_path: &Path) {
        let cargo_toml_path = root_path.join("Cargo.toml");
        if let Ok(content) = fs::read_to_string(&cargo_toml_path) {
            // Find [workspace.dependencies] section
            if let Some(start) = content.find("[workspace.dependencies]") {
                let deps_section = &content[start..];
                let deps_section = deps_section.split("\n[").next().unwrap_or(deps_section);

                // Parse each dependency line
                for line in deps_section.lines() {
                    let line = line.trim();
                    if line.starts_with('#') || line.is_empty() || line.starts_with('[') {
                        continue;
                    }

                    // Parse lines like: tokio = { version = "1.44", features = ["full"] }
                    // or: serde = "1.0"
                    if let Some(eq_pos) = line.find('=') {
                        let dep_name = line[..eq_pos].trim();
                        if !dep_name.is_empty() {
                            self.workspace_deps
                                .insert(dep_name.to_string(), dep_name.to_string());
                            // Register as a dependency node with consistent key (only if not already present)
                            if !self.dependency_nodes.contains_key(dep_name) {
                                let dep_guid =
                                    self.get_or_create_guid(&format!("dependency::{}", dep_name));
                                self.dependency_nodes.insert(dep_name.to_string(), dep_guid);
                            }
                        }
                    }
                }

                println!(
                    "📚 Found {} workspace dependencies",
                    self.workspace_deps.len()
                );
            }
        }
    }

    fn get_or_create_guid(&mut self, key: &str) -> String {
        if let Some(guid) = self.guid_cache.get(key) {
            return guid.clone();
        }
        let guid = Uuid::new_v4().to_string();
        self.guid_cache.insert(key.to_string(), guid.clone());
        guid
    }

    fn analyze_directory(&mut self, path: &Path, name: &str, node_type: &str) -> GraphNode {
        let guid = self.get_or_create_guid(&path.to_string_lossy());
        let mut children = Vec::new();

        // Walk directory
        for entry in WalkDir::new(path)
            .min_depth(1)
            .max_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let entry_path = entry.path();
            let entry_name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or_default();

            // Skip non-source directories
            if matches!(
                entry_name,
                "node_modules"
                    | "target"
                    | "dist"
                    | ".git"
                    | "coverage"
                    | "__pycache__"
                    | ".next"
                    | ".idea"
                    | ".vscode"
            ) {
                continue;
            }

            if entry_path.is_dir() {
                // Recursively analyze subdirectory
                let child_type = match entry_name {
                    "services" => "service_group",
                    "src" => "source",
                    "tests" | "test" => "test_suite",
                    "docs" => "documentation",
                    "frontend" | "client" => "frontend",
                    "backend" | "server" => "backend",
                    "crates" | "packages" => "package_group",
                    _ => "folder",
                };

                let child_node = self.analyze_directory(entry_path, entry_name, child_type);
                children.push(child_node);
            } else if entry_path.is_file() {
                // Analyze file
                if let Some(child_node) = self.analyze_file(entry_path) {
                    children.push(child_node);
                }
            }
        }

        // Sort children for consistency
        children.sort_by(|a, b| a.name.cmp(&b.name));

        GraphNode {
            guid,
            node_type: node_type.to_string(),
            name: name.to_string(),
            description: get_node_description(name, node_type),
            path: Some(path.to_string_lossy().to_string()),
            children: if children.is_empty() {
                None
            } else {
                Some(children)
            },
        }
    }

    fn analyze_file(&mut self, path: &Path) -> Option<GraphNode> {
        let extension = path.extension()?.to_str()?;
        let file_name = path.file_name()?.to_str()?.to_string();
        let guid = self.get_or_create_guid(&path.to_string_lossy());

        match extension {
            "rs" => Some(self.analyze_rust_file(path, guid, file_name)),
            "ts" | "tsx" => Some(self.analyze_typescript_file(path, guid, file_name)),
            "js" | "jsx" => Some(self.analyze_javascript_file(path, guid, file_name)),
            "html" => Some(self.create_simple_node(guid, "template", file_name, "HTML template")),
            "scss" | "css" => {
                Some(self.create_simple_node(guid, "stylesheet", file_name, "Stylesheet"))
            }
            "json" if file_name == "package.json" => {
                self.analyze_package_json(path, guid, file_name)
            }
            "toml" if file_name == "Cargo.toml" => self.analyze_cargo_toml(path, guid, file_name),
            _ => None,
        }
    }

    fn analyze_rust_file(&mut self, path: &Path, guid: String, name: String) -> GraphNode {
        let mut children = Vec::new();

        if let Ok(content) = fs::read_to_string(path) {
            // Extract functions
            if let Ok(func_regex) = Regex::new(r"(?m)^\s*(pub\s+)?(async\s+)?fn\s+(\w+)") {
                for cap in func_regex.captures_iter(&content) {
                    let func_name = cap.get(3).map_or("", |m| m.as_str());
                    let func_guid =
                        self.get_or_create_guid(&format!("{}::{}", path.display(), func_name));

                    children.push(GraphNode {
                        guid: func_guid.clone(),
                        node_type: "function".to_string(),
                        name: func_name.to_string(),
                        description: Some("Rust function".to_string()),
                        path: None,
                        children: None,
                    });
                }
            }

            // Extract structs
            if let Ok(struct_regex) = Regex::new(r"(?m)^\s*(pub\s+)?struct\s+(\w+)") {
                for cap in struct_regex.captures_iter(&content) {
                    let struct_name = cap.get(2).map_or("", |m| m.as_str());
                    let struct_guid =
                        self.get_or_create_guid(&format!("{}::{}", path.display(), struct_name));

                    children.push(GraphNode {
                        guid: struct_guid,
                        node_type: "struct".to_string(),
                        name: struct_name.to_string(),
                        description: Some("Rust struct".to_string()),
                        path: None,
                        children: None,
                    });
                }
            }

            // Extract imports and link to known dependencies
            if let Ok(use_regex) = Regex::new(r"use\s+([\w:]+)") {
                for cap in use_regex.captures_iter(&content) {
                    let import = cap.get(1).map_or("", |m| m.as_str());

                    // Try to find the base crate name from the import
                    let crate_name = import.split("::").next().unwrap_or(import);

                    // Skip relative imports
                    if crate_name == "crate" || crate_name == "super" || crate_name == "self" {
                        continue;
                    }

                    // Check if this is a known dependency
                    let target_guid = if let Some(dep_guid) = self.dependency_nodes.get(crate_name)
                    {
                        dep_guid.clone()
                    } else if crate_name == "std" {
                        // Ensure std is registered
                        let guid = self.get_or_create_guid("crate::std");
                        self.dependency_nodes
                            .insert("std".to_string(), guid.clone());
                        guid
                    } else if crate_name == "edt_core" || crate_name == "agent_runtime" {
                        // Internal crates - use underscores
                        let normalized = crate_name.replace('_', "-");
                        if let Some(dep_guid) = self.dependency_nodes.get(&normalized) {
                            dep_guid.clone()
                        } else {
                            // Register it
                            let guid = self.get_or_create_guid(&format!("crate::{}", crate_name));
                            self.dependency_nodes
                                .insert(crate_name.to_string(), guid.clone());
                            guid
                        }
                    } else {
                        // Skip unknown imports to avoid invalid edges
                        continue;
                    };

                    self.edges.push(GraphEdge {
                        guid: Uuid::new_v4().to_string(),
                        source: guid.clone(),
                        target: target_guid,
                        edge_type: "imports".to_string(),
                        name: format!("imports {}", import),
                    });
                }
            }
        }

        GraphNode {
            guid,
            node_type: "file".to_string(),
            name,
            description: Some("Rust source file".to_string()),
            path: Some(path.to_string_lossy().to_string()),
            children: if children.is_empty() {
                None
            } else {
                Some(children)
            },
        }
    }

    fn analyze_typescript_file(&mut self, path: &Path, guid: String, name: String) -> GraphNode {
        let mut children = Vec::new();

        if let Ok(content) = fs::read_to_string(path) {
            // Check for Angular component
            if content.contains("@Component") {
                if let Ok(comp_regex) = Regex::new(r"export\s+class\s+(\w+)") {
                    for cap in comp_regex.captures_iter(&content) {
                        let comp_name = cap.get(1).map_or("", |m| m.as_str());
                        let comp_guid =
                            self.get_or_create_guid(&format!("{}::{}", path.display(), comp_name));

                        children.push(GraphNode {
                            guid: comp_guid,
                            node_type: "component".to_string(),
                            name: comp_name.to_string(),
                            description: Some("Angular component".to_string()),
                            path: None,
                            children: None,
                        });
                    }
                }
            }

            // Extract functions
            if let Ok(func_regex) = Regex::new(r"(?m)^\s*(export\s+)?(async\s+)?function\s+(\w+)") {
                for cap in func_regex.captures_iter(&content) {
                    let func_name = cap.get(3).map_or("", |m| m.as_str());
                    let func_guid =
                        self.get_or_create_guid(&format!("{}::{}", path.display(), func_name));

                    children.push(GraphNode {
                        guid: func_guid,
                        node_type: "function".to_string(),
                        name: func_name.to_string(),
                        description: Some("TypeScript function".to_string()),
                        path: None,
                        children: None,
                    });
                }
            }

            // Extract imports
            if let Ok(import_regex) = Regex::new(r#"import\s+.*\s+from\s+['"]([^'"]+)['"]"#) {
                for cap in import_regex.captures_iter(&content) {
                    let module = cap.get(1).map_or("", |m| m.as_str());

                    // Only create edges for external modules (not relative paths)
                    if !module.starts_with('.') && !module.starts_with('/') {
                        // Register as dependency node if not already registered
                        let target_guid =
                            if let Some(existing_guid) = self.dependency_nodes.get(module) {
                                existing_guid.clone()
                            } else {
                                let new_guid =
                                    self.get_or_create_guid(&format!("dependency::{}", module));
                                self.dependency_nodes
                                    .insert(module.to_string(), new_guid.clone());
                                new_guid
                            };

                        self.edges.push(GraphEdge {
                            guid: Uuid::new_v4().to_string(),
                            source: guid.clone(),
                            target: target_guid,
                            edge_type: "imports".to_string(),
                            name: format!("imports from {}", module),
                        });
                    }
                }
            }
        }

        GraphNode {
            guid,
            node_type: "file".to_string(),
            name,
            description: Some("TypeScript source file".to_string()),
            path: Some(path.to_string_lossy().to_string()),
            children: if children.is_empty() {
                None
            } else {
                Some(children)
            },
        }
    }

    fn analyze_javascript_file(&mut self, path: &Path, guid: String, name: String) -> GraphNode {
        // Similar to TypeScript but without types
        self.analyze_typescript_file(path, guid, name)
    }

    fn analyze_package_json(
        &mut self,
        path: &Path,
        guid: String,
        name: String,
    ) -> Option<GraphNode> {
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let package_name = json["name"].as_str().unwrap_or("unknown");

                // Extract dependencies and CREATE NODES for them
                if let Some(deps) = json["dependencies"].as_object() {
                    for (dep_name, _) in deps {
                        // Get or create consistent GUID for dependency
                        let target_guid =
                            if let Some(existing_guid) = self.dependency_nodes.get(dep_name) {
                                existing_guid.clone()
                            } else {
                                let new_guid =
                                    self.get_or_create_guid(&format!("dependency::{}", dep_name));
                                self.dependency_nodes
                                    .insert(dep_name.clone(), new_guid.clone());
                                new_guid
                            };

                        self.edges.push(GraphEdge {
                            guid: Uuid::new_v4().to_string(),
                            source: guid.clone(),
                            target: target_guid,
                            edge_type: "depends_on".to_string(),
                            name: format!("{} depends on {}", package_name, dep_name),
                        });
                    }
                }

                // Also extract devDependencies
                if let Some(dev_deps) = json["devDependencies"].as_object() {
                    for (dep_name, _) in dev_deps {
                        // Get or create consistent GUID for dependency
                        let target_guid =
                            if let Some(existing_guid) = self.dependency_nodes.get(dep_name) {
                                existing_guid.clone()
                            } else {
                                let new_guid =
                                    self.get_or_create_guid(&format!("dependency::{}", dep_name));
                                self.dependency_nodes
                                    .insert(dep_name.clone(), new_guid.clone());
                                new_guid
                            };

                        self.edges.push(GraphEdge {
                            guid: Uuid::new_v4().to_string(),
                            source: guid.clone(),
                            target: target_guid,
                            edge_type: "depends_on".to_string(),
                            name: format!("{} depends on {} (dev)", package_name, dep_name),
                        });
                    }
                }

                return Some(GraphNode {
                    guid,
                    node_type: "manifest".to_string(),
                    name,
                    description: Some(format!("NPM package: {}", package_name)),
                    path: Some(path.to_string_lossy().to_string()),
                    children: None,
                });
            }
        }
        None
    }

    fn analyze_cargo_toml(&mut self, path: &Path, guid: String, name: String) -> Option<GraphNode> {
        if let Ok(content) = fs::read_to_string(path) {
            // Extract package name
            let package_name = if let Ok(re) = Regex::new(r#"name\s*=\s*"([^"]+)""#) {
                re.captures(&content)
                    .and_then(|cap| cap.get(1))
                    .map_or("unknown", |m| m.as_str())
            } else {
                "unknown"
            };

            // Extract and register dependencies
            if content.contains("[dependencies]") {
                let deps_section = content.split("[dependencies]").nth(1).unwrap_or("");
                let deps_section = deps_section.split("\n[").next().unwrap_or(deps_section);

                for line in deps_section.lines() {
                    let line = line.trim();
                    if line.starts_with('#') || line.is_empty() {
                        continue;
                    }

                    // Parse dependency lines
                    if let Some(eq_pos) = line.find('=') {
                        let dep_name = line[..eq_pos].trim();
                        let dep_value = line[eq_pos + 1..].trim();

                        // Skip non-dependency keys
                        if dep_name == "version" || dep_name == "features" || dep_name == "path" {
                            continue;
                        }

                        // Check if it's a workspace dependency
                        let _is_workspace = dep_value.contains("workspace = true");

                        if !dep_name.is_empty() {
                            // Get or create consistent GUID for dependency
                            let dep_guid =
                                if let Some(existing_guid) = self.dependency_nodes.get(dep_name) {
                                    existing_guid.clone()
                                } else {
                                    let new_guid = self
                                        .get_or_create_guid(&format!("dependency::{}", dep_name));
                                    self.dependency_nodes
                                        .insert(dep_name.to_string(), new_guid.clone());
                                    new_guid
                                };

                            self.edges.push(GraphEdge {
                                guid: Uuid::new_v4().to_string(),
                                source: guid.clone(),
                                target: dep_guid,
                                edge_type: "depends_on".to_string(),
                                name: format!("{} depends on {}", package_name, dep_name),
                            });
                        }
                    }
                }
            }

            return Some(GraphNode {
                guid,
                node_type: "manifest".to_string(),
                name,
                description: Some(format!("Cargo package: {}", package_name)),
                path: Some(path.to_string_lossy().to_string()),
                children: None,
            });
        }
        None
    }

    fn create_simple_node(
        &self,
        guid: String,
        node_type: &str,
        name: String,
        desc: &str,
    ) -> GraphNode {
        GraphNode {
            guid,
            node_type: node_type.to_string(),
            name,
            description: Some(desc.to_string()),
            path: None,
            children: None,
        }
    }

    fn create_dependency_nodes(&self) -> Vec<GraphNode> {
        let mut dep_nodes = Vec::new();

        // Create nodes for all registered dependencies
        for (dep_name, dep_guid) in &self.dependency_nodes {
            dep_nodes.push(GraphNode {
                guid: dep_guid.clone(),
                node_type: "dependency".to_string(),
                name: dep_name.clone(),
                description: Some(format!("External crate: {}", dep_name)),
                path: None,
                children: None,
            });
        }

        dep_nodes
    }

    fn validate_and_filter_edges(
        &mut self,
        all_node_guids: &std::collections::HashSet<String>,
    ) -> Vec<GraphEdge> {
        // Only keep edges where both source and target exist
        let mut valid_edges = Vec::new();
        let mut invalid_count = 0;
        let mut missing_targets = std::collections::HashMap::new();

        for edge in self.edges.drain(..) {
            if all_node_guids.contains(&edge.source) && all_node_guids.contains(&edge.target) {
                valid_edges.push(edge);
            } else {
                invalid_count += 1;
                if !all_node_guids.contains(&edge.target) {
                    *missing_targets.entry(edge.name.clone()).or_insert(0) += 1;
                }
            }
        }

        if invalid_count > 0 {
            println!(
                "🔍 Filtered out {} invalid edges (nodes don't exist)",
                invalid_count
            );
            println!(
                "📊 Dependency nodes in map: {}",
                self.dependency_nodes.len()
            );
            println!("📊 Total nodes in graph: {}", all_node_guids.len());

            // Debug: Check if dependency nodes are in the graph
            let mut dep_nodes_missing = 0;
            for (dep_name, dep_guid) in &self.dependency_nodes {
                if !all_node_guids.contains(dep_guid) {
                    dep_nodes_missing += 1;
                    if dep_nodes_missing <= 5 {
                        println!(
                            "   ❌ Dependency '{}' GUID {} not in graph",
                            dep_name, dep_guid
                        );
                    }
                }
            }
            if dep_nodes_missing > 0 {
                println!(
                    "🚨 {} dependency nodes not added to graph!",
                    dep_nodes_missing
                );
            }

            if !missing_targets.is_empty() {
                println!("📋 Missing edge targets (first 10):");
                for (i, (name, count)) in missing_targets.iter().take(10).enumerate() {
                    println!("   {}: {} ({}x)", i + 1, name, count);
                }
            }
        }

        valid_edges
    }
}

fn get_node_description(name: &str, node_type: &str) -> Option<String> {
    match (name, node_type) {
        ("Kalisi", "root") => {
            Some("EDT2 Enterprise Digital Twin - Complete Codebase Analysis".to_string())
        }
        ("services", _) => Some("Rust microservices backend".to_string()),
        ("frontend", _) => Some("Angular 20 frontend application".to_string()),
        ("api-gateway", _) => Some("Main HTTP/HTTPS server, auth, routing".to_string()),
        ("agent-runtime", _) => Some("Intelligent agent execution environment".to_string()),
        ("neo4j-ui", _) => Some("Graph database UI service".to_string()),
        ("kalisi-core", _) => Some("Shared core libraries".to_string()),
        _ => None,
    }
}

fn main() {
    let root_path = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "/home/devuser/edt2".to_string());
    let output_path = std::env::args().nth(2).unwrap_or_else(|| {
        "/home/devuser/edt2/codebase-analyzer/codebase-analysis.json".to_string()
    });

    println!("🔍 Analyzing codebase at: {}", root_path);

    let mut analyzer = Analyzer::new();

    // Load workspace dependencies first
    analyzer.load_workspace_dependencies(Path::new(&root_path));

    // Analyze from root
    let mut root_node = analyzer.analyze_directory(Path::new(&root_path), "Kalisi", "root");

    // Add dependency nodes as a separate folder
    let dep_nodes = analyzer.create_dependency_nodes();
    if !dep_nodes.is_empty() {
        let dependencies_folder = GraphNode {
            guid: analyzer.get_or_create_guid("dependencies_folder"),
            node_type: "folder".to_string(),
            name: "_dependencies".to_string(),
            description: Some("External dependencies".to_string()),
            path: None,
            children: Some(dep_nodes),
        };

        // Add dependencies folder to root's children
        if let Some(ref mut children) = root_node.children {
            children.push(dependencies_folder);
        } else {
            root_node.children = Some(vec![dependencies_folder]);
        }

        println!(
            "📦 Added {} dependency nodes",
            analyzer.dependency_nodes.len()
        );
    }

    // Collect all node GUIDs for validation
    let mut all_guids = std::collections::HashSet::new();
    fn collect_all_guids(node: &GraphNode, guids: &mut std::collections::HashSet<String>) {
        guids.insert(node.guid.clone());
        if let Some(children) = &node.children {
            for child in children {
                collect_all_guids(child, guids);
            }
        }
    }
    collect_all_guids(&root_node, &mut all_guids);

    // Validate and filter edges to ensure 100% validity
    let valid_edges = analyzer.validate_and_filter_edges(&all_guids);

    let graph = CodebaseGraph {
        nodes: root_node,
        edges: valid_edges,
    };

    // Save to file
    match serde_json::to_string_pretty(&graph) {
        Ok(json) => {
            if let Err(e) = fs::write(&output_path, json) {
                eprintln!("❌ Failed to write output: {}", e);
            } else {
                println!("✅ Analysis complete! Output saved to: {}", output_path);
                println!("📊 Total edges: {}", graph.edges.len());
            }
        }
        Err(e) => eprintln!("❌ Failed to serialize graph: {}", e),
    }
}
