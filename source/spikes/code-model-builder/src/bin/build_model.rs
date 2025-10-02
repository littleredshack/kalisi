use anyhow::Result;
use code_model_builder::{CodeModel, Language, Node, NodeKind, RustParser};
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

    // Initialize Rust parser
    let mut rust_parser = RustParser::new()?;

    // Walk all Rust files
    let mut rust_file_count = 0;
    for entry in WalkDir::new(&repo_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("rs"))
    {
        let path = entry.path();

        // Skip target, build artifacts
        if path.to_string_lossy().contains("/target/") {
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

        match rust_parser.parse_file(&relative_path, &source) {
            Ok(file_node) => {
                repo_node.add_child(file_node);
                rust_file_count += 1;
            }
            Err(e) => {
                eprintln!("    ❌ Parse error: {}", e);
            }
        }
    }

    model.workspace.add_child(repo_node);

    println!("\n✅ Parsed {} Rust files", rust_file_count);

    // Count nodes
    let node_count = count_nodes(&model.workspace);
    println!("📊 Total nodes: {}", node_count);

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
