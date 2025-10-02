use anyhow::Result;
use code_model_builder::{
    CodeModel, EdgeExtractor, Language, Node, NodeKind, RustEdgeExtractor, RustParser,
    SymbolTable, TypeScriptEdgeExtractor, TypeScriptParser,
};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let repo_root = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "/workspace/source".to_string());

    println!("🔨 Building code model for: {}", repo_root);

    // Create workspace node
    let workspace_name = Path::new(&repo_root)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("workspace")
        .to_string();

    let mut model = CodeModel::new(workspace_name);

    // Create a repository node
    let mut repo_node = Node::new(NodeKind::Repository, "source".into(), Language::Multi);

    // Initialize parsers
    let mut rust_parser = RustParser::new()?;
    let mut ts_parser = TypeScriptParser::new()?;

    // Walk all Rust and TypeScript files
    let mut rust_file_count = 0;
    let mut ts_file_count = 0;

    for entry in WalkDir::new(&repo_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ext = e.path().extension().and_then(|s| s.to_str());
            ext == Some("rs") || ext == Some("ts")
        })
    {
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

        // Skip target, build artifacts, node_modules, dist
        let path_str = path.to_string_lossy();
        if path_str.contains("/target/")
            || path_str.contains("/node_modules/")
            || path_str.contains("/dist/") {
            continue;
        }

        println!("  📄 Parsing: {}", path.display());

        let source = match fs::read_to_string(path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("    ⚠️  Failed to read: {}", e);
                continue;
            }
        };

        let relative_path = path
            .strip_prefix(&repo_root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let result = match ext {
            "rs" => {
                rust_file_count += 1;
                rust_parser.parse_file(&relative_path, &source)
            }
            "ts" => {
                ts_file_count += 1;
                ts_parser.parse_file(&relative_path, &source)
            }
            _ => continue,
        };

        match result {
            Ok(file_node) => {
                repo_node.add_child(file_node);
            }
            Err(e) => {
                eprintln!("    ❌ Parse error: {}", e);
            }
        }
    }

    model.workspace.add_child(repo_node);

    println!("\n✅ Parsed {} Rust files", rust_file_count);
    println!("✅ Parsed {} TypeScript files", ts_file_count);

    // Count nodes
    let node_count = count_nodes(&model.workspace);
    println!("📊 Total nodes: {}", node_count);

    // ========================================
    // PASS 2: Build Symbol Table
    // ========================================
    println!("\n🔍 Building symbol table...");
    let mut symbol_table = SymbolTable::new();
    symbol_table.index_node(&model.workspace, "");
    println!("✅ Indexed {} symbols", symbol_table.len());

    // ========================================
    // PASS 3: Extract Edges
    // ========================================
    println!("\n🔗 Extracting edges...");
    let mut rust_edge_extractor = RustEdgeExtractor::new()?;
    let mut ts_edge_extractor = TypeScriptEdgeExtractor::new()?;

    // Collect all files to process
    let mut files_to_process: Vec<(String, String, String)> = Vec::new();

    for entry in WalkDir::new(&repo_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ext = e.path().extension().and_then(|s| s.to_str());
            ext == Some("rs") || ext == Some("ts")
        })
    {
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

        // Skip target, build artifacts, node_modules, dist
        let path_str = path.to_string_lossy();
        if path_str.contains("/target/")
            || path_str.contains("/node_modules/")
            || path_str.contains("/dist/")
        {
            continue;
        }

        if let Ok(source) = fs::read_to_string(path) {
            let relative_path = path
                .strip_prefix(&repo_root)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();

            files_to_process.push((relative_path, source, ext.to_string()));
        }
    }

    // Extract edges for each file
    let mut edge_count = 0;
    for (relative_path, source, ext) in files_to_process {
        // Find the file node in the model
        if let Some(file_node) = find_file_node(&model.workspace, &relative_path) {
            let edges = match ext.as_str() {
                "rs" => rust_edge_extractor.extract_edges(&source, file_node, &symbol_table)?,
                "ts" => ts_edge_extractor.extract_edges(&source, file_node, &symbol_table)?,
                _ => continue,
            };

            edge_count += edges.len();
            model.edges.extend(edges);
        }
    }

    println!("✅ Extracted {} edges", edge_count);

    // ========================================
    // PASS 4: Aggregate Call Counts
    // ========================================
    println!("\n📊 Aggregating call counts...");
    aggregate_call_counts(&mut model.edges);
    println!("✅ Call counts aggregated");

    // Write output
    let output_path = "/workspace/source/spikes/code-model-builder/output/model.json";
    fs::create_dir_all("/workspace/source/spikes/code-model-builder/output")?;

    let json = serde_json::to_string_pretty(&model)?;
    fs::write(output_path, json)?;

    println!("\n💾 Model written to: {}", output_path);
    println!("📏 Size: {} bytes", fs::metadata(output_path)?.len());

    Ok(())
}

fn count_nodes(node: &Node) -> usize {
    1 + node.children.iter().map(count_nodes).sum::<usize>()
}

fn find_file_node<'a>(node: &'a Node, target_path: &str) -> Option<&'a Node> {
    // Check if this node is the file we're looking for
    if node.kind == NodeKind::File {
        if let Some(loc) = &node.location {
            if loc.path == target_path {
                return Some(node);
            }
        }
    }

    // Recursively search children
    for child in &node.children {
        if let Some(found) = find_file_node(child, target_path) {
            return Some(found);
        }
    }

    None
}

fn aggregate_call_counts(edges: &mut Vec<code_model_builder::Edge>) {
    use std::collections::HashMap;

    // Build a map: (from_guid, to_guid, edge_type) -> count
    let mut call_counts: HashMap<(String, String, code_model_builder::EdgeType), usize> =
        HashMap::new();

    // Count occurrences
    for edge in edges.iter() {
        let key = (
            edge.from_guid.clone(),
            edge.to_guid.clone(),
            edge.edge_type,
        );
        *call_counts.entry(key).or_insert(0) += 1;
    }

    // Update edges with counts
    for edge in edges.iter_mut() {
        let key = (
            edge.from_guid.clone(),
            edge.to_guid.clone(),
            edge.edge_type,
        );
        if let Some(count) = call_counts.get(&key) {
            if *count > 1 {
                if let Some(metadata) = &mut edge.metadata {
                    metadata.count = Some(*count);
                }
            }
        }
    }

    // Remove duplicate edges, keeping only one with the aggregated count
    let mut seen: HashMap<(String, String, code_model_builder::EdgeType), bool> = HashMap::new();
    edges.retain(|edge| {
        let key = (
            edge.from_guid.clone(),
            edge.to_guid.clone(),
            edge.edge_type,
        );
        if seen.contains_key(&key) {
            false // Remove duplicate
        } else {
            seen.insert(key, true);
            true // Keep first occurrence
        }
    });
}
