use std::{
    env,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use clap::{Parser, ValueEnum};
use code_model_builder::{
    flatten_code_model, CodeModel, EdgeExtractor, FlattenedModel, Language, Node, NodeKind,
    RustEdgeExtractor, RustParser, SymbolTable, TypeScriptEdgeExtractor, TypeScriptParser,
};
use neo4rs::{query, BoltNull, BoltType, ConfigBuilder, Graph};
use tracing::{info, warn};
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[command(
    author,
    version,
    about = "Build a hierarchical code model and export it in multiple formats"
)]
struct Cli {
    /// Repository root to analyse
    #[arg(long, value_name = "PATH", default_value = ".")]
    repo_root: PathBuf,

    /// Output directory for generated files
    #[arg(long, value_name = "PATH")]
    out_dir: Option<PathBuf>,

    /// Output mode (tree JSON, flat JSONL, or Neo4j direct ingest)
    #[arg(long, value_enum, default_value_t = OutputMode::Tree)]
    output: OutputMode,

    /// Neo4j URI (defaults to NEO4J_URI env var or bolt://localhost:7687)
    #[arg(long)]
    neo4j_uri: Option<String>,

    /// Neo4j username (defaults to NEO4J_USERNAME env var or neo4j)
    #[arg(long)]
    neo4j_user: Option<String>,

    /// Neo4j password (defaults to NEO4J_PASSWORD env var; required for --output neo4j)
    #[arg(long)]
    neo4j_password: Option<String>,

    /// Neo4j database name (defaults to NEO4J_DATABASE env var or neo4j)
    #[arg(long)]
    neo4j_database: Option<String>,

    /// Delete all :CodeElement nodes before importing
    #[arg(long)]
    neo4j_clear: bool,

    /// Delete a prior import batch (matched by import_batch) before importing
    #[arg(long, value_name = "BATCH_ID")]
    neo4j_delete_batch: Option<String>,

    /// Override the generated import batch identifier
    #[arg(long, value_name = "BATCH_ID")]
    neo4j_batch: Option<String>,

    /// Optional APOC graphml backup filename written to Neo4j's import directory
    #[arg(long, value_name = "FILENAME")]
    neo4j_backup: Option<String>,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, ValueEnum)]
enum OutputMode {
    Tree,
    Flat,
    Neo4j,
}

struct Neo4jOptions {
    uri: String,
    user: String,
    password: String,
    database: String,
    clear_existing: bool,
    delete_batch: Option<String>,
    batch_id: String,
    backup_graphml: Option<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let cli = Cli::parse();
    let repo_root = cli.repo_root.canonicalize().context("resolve repo root")?;
    let out_dir = cli
        .out_dir
        .as_ref()
        .map(|p| {
            if p.is_relative() {
                repo_root.join(p)
            } else {
                p.clone()
            }
        })
        .unwrap_or_else(|| {
            repo_root
                .join("spikes")
                .join("code-model-builder")
                .join("output")
        });

    info!("Analysing repository at {}", repo_root.display());
    fs::create_dir_all(&out_dir).context("create output directory")?;

    let mut model = build_model(&repo_root)?;
    info!("Aggregating call counts");
    aggregate_call_counts(&mut model.edges);

    write_tree(&model, &out_dir)?;

    match cli.output {
        OutputMode::Tree => {}
        OutputMode::Flat | OutputMode::Neo4j => {
            let flattened = flatten_code_model(&model);
            write_flat(&flattened, &out_dir)?;

            if cli.output == OutputMode::Neo4j {
                let options = resolve_neo4j_options(&cli)?;
                import_to_neo4j(&flattened, &options).await?;
                info!(
                    "Neo4j import complete. Batch id: {} (store this to delete later)",
                    options.batch_id
                );
            }
        }
    }

    Ok(())
}

fn build_model(repo_root: &Path) -> Result<CodeModel> {
    let workspace_name = repo_root
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("workspace")
        .to_string();

    let mut model = CodeModel::new(workspace_name);
    let mut repo_node = Node::new(NodeKind::Repository, "source".into(), Language::Multi);

    let mut rust_parser = RustParser::new()?;
    let mut ts_parser = TypeScriptParser::new()?;

    let mut rust_file_count = 0usize;
    let mut ts_file_count = 0usize;

    for entry in WalkDir::new(repo_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ext = e.path().extension().and_then(|s| s.to_str());
            matches!(ext, Some("rs") | Some("ts"))
        })
    {
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

        if should_skip(path) {
            continue;
        }

        info!("Parsing {}", path.display());
        let source = match fs::read_to_string(path) {
            Ok(content) => content,
            Err(err) => {
                warn!("Failed to read {}: {err}", path.display());
                continue;
            }
        };

        let relative_path = path
            .strip_prefix(repo_root)
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
            Ok(file_node) => repo_node.add_child(file_node),
            Err(err) => warn!("Parse error in {}: {err}", relative_path),
        }
    }

    info!("Parsed {rust_file_count} Rust files");
    info!("Parsed {ts_file_count} TypeScript files");

    model.workspace.add_child(repo_node);

    info!("Building symbol table");
    let mut symbol_table = SymbolTable::new();
    symbol_table.index_node(&model.workspace, "");
    info!("Indexed {} symbols", symbol_table.len());

    info!("Extracting edges");
    let mut rust_edge_extractor = RustEdgeExtractor::new()?;
    let mut ts_edge_extractor = TypeScriptEdgeExtractor::new()?;

    let mut edges_added = 0usize;

    for entry in WalkDir::new(repo_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let ext = e.path().extension().and_then(|s| s.to_str());
            matches!(ext, Some("rs") | Some("ts"))
        })
    {
        let path = entry.path();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");

        if should_skip(path) {
            continue;
        }

        let source = match fs::read_to_string(path) {
            Ok(content) => content,
            Err(err) => {
                warn!("Failed to read {}: {err}", path.display());
                continue;
            }
        };

        let relative_path = path
            .strip_prefix(repo_root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        if let Some(file_node) = find_file_node(&model.workspace, &relative_path) {
            let edges = match ext {
                "rs" => rust_edge_extractor.extract_edges(&source, file_node, &symbol_table)?,
                "ts" => ts_edge_extractor.extract_edges(&source, file_node, &symbol_table)?,
                _ => continue,
            };

            edges_added += edges.len();
            model.edges.extend(edges);
        }
    }

    info!("Extracted {edges_added} edges");

    Ok(model)
}

fn should_skip(path: &Path) -> bool {
    let path_str = path.to_string_lossy();
    path_str.contains("/target/")
        || path_str.contains("/node_modules/")
        || path_str.contains("/dist/")
        || path_str.contains("/.git/")
}

fn find_file_node<'a>(node: &'a Node, target_path: &str) -> Option<&'a Node> {
    if node.kind == NodeKind::File {
        if let Some(loc) = &node.location {
            if loc.path == target_path {
                return Some(node);
            }
        }
    }

    for child in &node.children {
        if let Some(result) = find_file_node(child, target_path) {
            return Some(result);
        }
    }

    None
}

fn aggregate_call_counts(edges: &mut Vec<code_model_builder::Edge>) {
    use std::collections::HashMap;

    let mut call_counts: HashMap<(String, String, code_model_builder::EdgeType), usize> =
        HashMap::new();

    for edge in edges.iter() {
        let key = (edge.from_guid.clone(), edge.to_guid.clone(), edge.edge_type);
        *call_counts.entry(key).or_insert(0) += 1;
    }

    for edge in edges.iter_mut() {
        let key = (edge.from_guid.clone(), edge.to_guid.clone(), edge.edge_type);
        let count = call_counts.get(&key).copied();

        match edge.metadata.as_mut() {
            Some(metadata) => metadata.count = count,
            None => {
                let mut metadata = code_model_builder::EdgeMetadata::default();
                metadata.count = count;
                edge.metadata = Some(metadata);
            }
        }
    }

    let mut seen: HashMap<(String, String, code_model_builder::EdgeType), bool> = HashMap::new();
    edges.retain(|edge| {
        let key = (edge.from_guid.clone(), edge.to_guid.clone(), edge.edge_type);
        if seen.contains_key(&key) {
            false
        } else {
            seen.insert(key, true);

            if let Some(metadata) = &edge.metadata {
                if metadata.count == Some(0) {
                    return false;
                }
            }

            true
        }
    });
}

fn write_tree(model: &CodeModel, out_dir: &Path) -> Result<()> {
    let output_path = out_dir.join("model.json");
    let json = serde_json::to_string_pretty(model).context("serialize model")?;
    fs::write(&output_path, json).context("write tree json")?;
    info!("Tree model written to {}", output_path.display());
    Ok(())
}

fn write_flat(flattened: &FlattenedModel, out_dir: &Path) -> Result<()> {
    let nodes_path = out_dir.join("nodes.jsonl");
    let edges_path = out_dir.join("edges.jsonl");

    write_jsonl(&nodes_path, &flattened.nodes)?;
    write_jsonl(&edges_path, &flattened.edges)?;

    info!("Nodes written to {}", nodes_path.display());
    info!("Edges written to {}", edges_path.display());

    Ok(())
}

fn write_jsonl<T: serde::Serialize>(path: &Path, items: &[T]) -> Result<()> {
    let mut file = File::create(path).with_context(|| format!("create {}", path.display()))?;

    for item in items {
        serde_json::to_writer(&mut file, item)?;
        file.write_all(b"\n")?;
    }

    file.flush()?;
    Ok(())
}

fn resolve_neo4j_options(cli: &Cli) -> Result<Neo4jOptions> {
    let uri = cli
        .neo4j_uri
        .clone()
        .or_else(|| env::var("NEO4J_URI").ok())
        .unwrap_or_else(|| "bolt://localhost:7687".to_string());

    let user = cli
        .neo4j_user
        .clone()
        .or_else(|| env::var("NEO4J_USERNAME").ok())
        .unwrap_or_else(|| "neo4j".to_string());

    let password = cli
        .neo4j_password
        .clone()
        .or_else(|| env::var("NEO4J_PASSWORD").ok())
        .ok_or_else(|| {
            anyhow!("Neo4j password not provided. Use --neo4j-password or set NEO4J_PASSWORD")
        })?;

    let database = cli
        .neo4j_database
        .clone()
        .or_else(|| env::var("NEO4J_DATABASE").ok())
        .unwrap_or_else(|| "neo4j".to_string());

    let batch_id = cli
        .neo4j_batch
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    Ok(Neo4jOptions {
        uri,
        user,
        password,
        database,
        clear_existing: cli.neo4j_clear,
        delete_batch: cli.neo4j_delete_batch.clone(),
        batch_id,
        backup_graphml: cli.neo4j_backup.clone(),
    })
}

async fn import_to_neo4j(flattened: &FlattenedModel, options: &Neo4jOptions) -> Result<()> {
    info!(
        "Connecting to Neo4j at {} (db: {})",
        options.uri, options.database
    );

    let config = ConfigBuilder::default()
        .uri(&options.uri)
        .user(&options.user)
        .password(&options.password)
        .db(options.database.clone())
        .build()?;
    let graph = Graph::connect(config).await?;

    if let Some(backup_file) = &options.backup_graphml {
        info!("Attempting APOC backup to {}", backup_file);
        let backup_query =
            query("CALL apoc.export.graphml.all($file, {useTypes:true, storeNodeIds:false})")
                .param("file", backup_file.clone());

        if let Err(err) = graph.run(backup_query).await {
            warn!("Backup export failed (continuing with import): {}", err);
        } else {
            info!(
                "Backup requested; check Neo4j import directory for {}",
                backup_file
            );
        }
    }

    if let Some(batch) = &options.delete_batch {
        info!("Deleting prior batch {}", batch);
        graph
            .run(
                query("MATCH (n:CodeElement {import_batch: $batch}) DETACH DELETE n")
                    .param("batch", batch.clone()),
            )
            .await?;
        graph
            .run(
                query("MATCH ()-[r]->() WHERE r.import_batch = $batch DELETE r")
                    .param("batch", batch.clone()),
            )
            .await?;
    }

    if options.clear_existing {
        info!("Clearing existing :CodeElement graph");
        graph
            .run(query("MATCH (n:CodeElement) DETACH DELETE n"))
            .await?;
    }

    graph
        .run(query(
            "CREATE CONSTRAINT code_element_guid IF NOT EXISTS \
             FOR (n:CodeElement) REQUIRE n.guid IS UNIQUE",
        ))
        .await?;

    let mut tx = graph.start_txn().await?;

    for (idx, node) in flattened.nodes.iter().enumerate() {
        let location_json = node
            .location
            .as_ref()
            .map(|loc| serde_json::to_string(loc))
            .transpose()
            .context("serialize node location")?;
        let metadata_json = node
            .metadata
            .as_ref()
            .map(|meta| serde_json::to_string(meta))
            .transpose()
            .context("serialize node metadata")?;

        let query = query(
            "MERGE (n:CodeElement {guid: $guid}) \
             SET n.kind = $kind,
                 n.name = $name,
                 n.language = $language,
                 n.labels = $labels,
                 n.location_json = $location_json,
                 n.metadata_json = $metadata_json,
                 n.hash = $hash,
                 n.parent_guid = $parent_guid,
                 n.import_batch = $batch",
        )
        .param("guid", node.guid.clone())
        .param("kind", node.kind.as_str())
        .param("name", node.name.clone())
        .param("language", node.language.as_str())
        .param("labels", node.labels.clone())
        .param("location_json", optional_param(location_json))
        .param("metadata_json", optional_param(metadata_json))
        .param("hash", optional_param(node.hash.clone()))
        .param("parent_guid", optional_param(node.parent_guid.clone()))
        .param("batch", options.batch_id.clone());

        tx.run(query).await?;

        if idx % 1000 == 0 && idx > 0 {
            info!("  inserted {} nodes...", idx);
        }
    }

    for node in flattened
        .nodes
        .iter()
        .filter_map(|node| node.parent_guid.as_ref().map(|parent| (parent, &node.guid)))
    {
        tx.run(
            query(
                "MATCH (parent:CodeElement {guid: $parent}) \
                 MATCH (child:CodeElement {guid: $child}) \
                 MERGE (parent)-[rel:HAS_CHILD {import_batch: $batch}]->(child)",
            )
            .param("parent", node.0.clone())
            .param("child", node.1.clone())
            .param("batch", options.batch_id.clone()),
        )
        .await?;
    }

    for (idx, edge) in flattened.edges.iter().enumerate() {
        let metadata_json = edge
            .metadata
            .as_ref()
            .map(|meta| serde_json::to_string(meta))
            .transpose()
            .context("serialize edge metadata")?;

        let cypher = format!(
            "MATCH (src:CodeElement {{guid: $src}}) \
             MATCH (dst:CodeElement {{guid: $dst}}) \
             MERGE (src)-[r:{} {{guid: $guid}}]->(dst) \
             SET r.tags = $tags,
                 r.metadata_json = $metadata_json,
                 r.import_batch = $batch",
            edge.edge_type.as_str()
        );

        tx.run(
            query(&cypher)
                .param("src", edge.from_guid.clone())
                .param("dst", edge.to_guid.clone())
                .param("guid", edge.guid.clone())
                .param("tags", edge.tags.clone())
                .param("metadata_json", optional_param(metadata_json))
                .param("batch", options.batch_id.clone()),
        )
        .await?;

        if idx % 1000 == 0 && idx > 0 {
            info!("  inserted {} edges...", idx);
        }
    }

    tx.commit().await?;

    info!(
        "Inserted {} nodes and {} edges into Neo4j",
        flattened.nodes.len(),
        flattened.edges.len()
    );

    Ok(())
}

fn optional_param<T: Into<BoltType>>(value: Option<T>) -> BoltType {
    value
        .map(Into::into)
        .unwrap_or_else(|| BoltType::Null(BoltNull::default()))
}
