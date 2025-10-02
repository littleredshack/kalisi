use redis::aio::MultiplexedConnection;
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::fs::OpenOptions;
use std::io::Write as IoWrite;
use tracing::{info, error, warn};
use anyhow::Result;
use chrono::Utc;

/// Project Tree Agent Response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectTreeResponse {
    pub tree: String,
    pub message: String,
    pub success: bool,
}

/// User intent parsed from natural language
#[derive(Debug, Clone)]
struct UserIntent {
    action: TreeAction,
    depth: Option<usize>,
    exclude: Vec<String>,
    path: Option<String>,
    show_all_hidden: bool,  // Show ALL hidden files including .git
    hide_all_hidden: bool,  // Hide ALL hidden files
    include_files: bool,    // Show files in addition to directories
}

#[derive(Debug, Clone, PartialEq)]
enum TreeAction {
    ShowTree,
    Help,
}

/// Unanswered question log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
struct UnansweredQuestion {
    timestamp: String,
    query: String,
    reason: String,
}

/// Project Tree Agent - Generates visual tree representations of project structure
/// Bounded task: Can ONLY generate and visualize project directory trees
/// Flexible: Understands natural language, learns user preferences
pub struct ProjectTreeAgent {
    _redis_connection: MultiplexedConnection,
    default_excludes: Vec<String>,
    conversation_history: Vec<String>,
    unanswered_questions_file: String,
}

impl ProjectTreeAgent {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis_connection = client.get_multiplexed_async_connection().await?;

        info!("🌲 Project Tree Agent created");

        Ok(ProjectTreeAgent {
            _redis_connection: redis_connection,
            default_excludes: vec![
                "target".to_string(),
                "node_modules".to_string(),
                ".git".to_string(),
                ".angular".to_string(),
                "dist".to_string(),
            ],
            conversation_history: Vec::new(),
            unanswered_questions_file: "/workspace/source/agents/project-tree-agent/unanswered_questions.jsonl".to_string(),
        })
    }

    pub async fn initialize(&mut self) -> Result<()> {
        info!("🌲 Project Tree Agent initialized and ready");
        info!("🌲 I can show you project directory trees with flexible options");
        Ok(())
    }

    /// Process user queries - natural language understanding for tree generation
    pub async fn process_query(&mut self, query: &str) -> Result<ProjectTreeResponse> {
        info!("🌲 User said: {}", query);

        // Store in conversation history
        self.conversation_history.push(query.to_string());

        // Check if this is clearly out of scope before parsing
        if self.is_out_of_scope(query) {
            let reason = "Query is outside agent's bounded task (can only show directory/file trees)";
            self.log_unanswered_question(query, reason).await;

            return Ok(ProjectTreeResponse {
                tree: String::new(),
                message: format!(
                    "I can only show you directory and file trees. I cannot: modify files, execute code, or do anything outside of visualizing project structure.\n\nTry asking me to 'show the project tree' or type 'help' to see what I can do."
                ),
                success: false,
            });
        }

        // Parse user intent
        let intent = self.parse_intent(query);

        match intent.action {
            TreeAction::ShowTree => {
                self.execute_tree_generation(intent).await
            }
            TreeAction::Help => {
                Ok(ProjectTreeResponse {
                    tree: String::new(),
                    message: self.get_help_message(),
                    success: true,
                })
            }
        }
    }

    /// Detect queries that are clearly outside the agent's scope
    fn is_out_of_scope(&self, query: &str) -> bool {
        let query_lower = query.to_lowercase();

        // Keywords that indicate out-of-scope requests
        let out_of_scope_keywords = [
            "create ",
            "delete ",
            "modify ",
            "edit ",
            "write ",
            "remove ",
            "rename ",
            "move ",
            "copy ",
            "run ",
            "execute",
            "compile",
            "build ",
            "install",
            "deploy",
            "commit",
            "push ",
            "search ",
            "find ",
            "grep",
            "read ",
            "open ",
            "analyze",
            "count",
        ];

        out_of_scope_keywords.iter().any(|keyword| query_lower.contains(keyword))
    }

    /// Log unanswered or out-of-scope questions for future improvement
    async fn log_unanswered_question(&self, query: &str, reason: &str) {
        let entry = UnansweredQuestion {
            timestamp: Utc::now().to_rfc3339(),
            query: query.to_string(),
            reason: reason.to_string(),
        };

        // Append to JSONL file
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.unanswered_questions_file)
        {
            if let Ok(json) = serde_json::to_string(&entry) {
                if let Err(e) = writeln!(file, "{}", json) {
                    warn!("Failed to log unanswered question: {}", e);
                } else {
                    info!("📝 Logged unanswered question: {}", query);
                }
            }
        }
    }

    /// Parse natural language to understand user intent
    fn parse_intent(&self, query: &str) -> UserIntent {
        let query_lower = query.to_lowercase();

        // Check for help requests
        if query_lower.contains("help") || query_lower.contains("what can you") || query_lower.contains("how do") {
            return UserIntent {
                action: TreeAction::Help,
                depth: None,
                exclude: vec![],
                path: None,
                show_all_hidden: false,
                hide_all_hidden: false,
                include_files: false,
            };
        }

        // Parse depth
        let depth = self.extract_depth(&query_lower);

        // Parse file inclusion
        let include_files = query_lower.contains("with files")
            || query_lower.contains("include files")
            || query_lower.contains("show files")
            || query_lower.contains("files and folders")
            || query_lower.contains("files and directories");

        // Parse hidden files preferences
        let show_all_hidden = query_lower.contains("show everything")
            || query_lower.contains("include hidden")
            || query_lower.contains("show hidden")
            || query_lower.contains("all files")
            || query_lower.contains("including hidden");

        let hide_all_hidden = query_lower.contains("hide hidden")
            || query_lower.contains("no hidden")
            || query_lower.contains("without hidden")
            || query_lower.contains("skip hidden")
            || query_lower.contains("hide dotfiles");

        // Parse exclusions
        let mut exclude = if hide_all_hidden {
            // Start with empty, we'll add all hidden dirs
            vec![]
        } else if show_all_hidden {
            // Don't exclude the normally excluded hidden dirs
            vec![]
        } else {
            // Default behavior - exclude common build/cache dirs
            self.default_excludes.clone()
        };

        // Add custom exclusions from query
        let custom_excludes = self.extract_exclusions(&query_lower);
        exclude.extend(custom_excludes);

        // Extract path if specified
        let path = self.extract_path(&query_lower);

        UserIntent {
            action: TreeAction::ShowTree,
            depth,
            exclude,
            path,
            show_all_hidden,
            hide_all_hidden,
            include_files,
        }
    }

    /// Extract depth from user query
    fn extract_depth(&self, query: &str) -> Option<usize> {
        if query.contains("shallow") || query.contains("top level") || query.contains("just the top") {
            Some(2)
        } else if query.contains("deep") || query.contains("full") || query.contains("complete") || query.contains("everything") {
            Some(10)
        } else if query.contains("depth") {
            // Try to extract number
            for word in query.split_whitespace() {
                if let Ok(num) = word.parse::<usize>() {
                    if num > 0 && num < 20 {
                        return Some(num);
                    }
                }
            }
            Some(3)
        } else {
            Some(3) // default
        }
    }

    /// Extract what to exclude from query
    fn extract_exclusions(&self, query: &str) -> Vec<String> {
        let mut excludes = Vec::new();

        if query.contains("exclude") || query.contains("skip") || query.contains("ignore") || query.contains("without") {
            // Look for common patterns
            if query.contains("build") || query.contains("target") {
                excludes.push("target".to_string());
            }
            if query.contains("dependencies") || query.contains("node_modules") {
                excludes.push("node_modules".to_string());
            }
            if query.contains("test") {
                excludes.push("tests".to_string());
                excludes.push("test".to_string());
            }
            if query.contains("doc") {
                excludes.push("docs".to_string());
                excludes.push("documentation".to_string());
            }
        }

        excludes
    }


    /// Extract path from query
    fn extract_path(&self, query: &str) -> Option<String> {
        // Look for path-like patterns
        if query.contains("src/") {
            Some("src".to_string())
        } else if query.contains("services/") {
            Some("services".to_string())
        } else if query.contains("frontend/") {
            Some("frontend".to_string())
        } else {
            None
        }
    }

    /// Execute the tree generation with parsed intent
    async fn execute_tree_generation(&self, intent: UserIntent) -> Result<ProjectTreeResponse> {
        let depth = intent.depth.unwrap_or(3);

        info!("🌲 Generating tree: depth={}, excludes={:?}, path={:?}, show_all_hidden={}, hide_all_hidden={}, include_files={}",
              depth, intent.exclude, intent.path, intent.show_all_hidden, intent.hide_all_hidden, intent.include_files);

        match self.generate_tree(depth, &intent.exclude, intent.path.as_deref(), intent.hide_all_hidden, intent.include_files).await {
            Ok(tree) => {
                let hidden_msg = if intent.show_all_hidden {
                    ", showing all hidden files"
                } else if intent.hide_all_hidden {
                    ", hiding all hidden files"
                } else {
                    ""
                };

                let files_msg = if intent.include_files {
                    ", including files"
                } else {
                    ", directories only"
                };

                let message = format!(
                    "Here's your project tree (depth: {}, excluded: {}{}{})",
                    depth,
                    if intent.exclude.is_empty() {
                        "none".to_string()
                    } else {
                        intent.exclude.join(", ")
                    },
                    hidden_msg,
                    files_msg
                );

                Ok(ProjectTreeResponse {
                    tree,
                    message,
                    success: true,
                })
            }
            Err(e) => {
                error!("Failed to generate tree: {}", e);
                Ok(ProjectTreeResponse {
                    tree: String::new(),
                    message: format!("I couldn't generate the tree: {}. Try asking me to show you the tree with different options.", e),
                    success: false,
                })
            }
        }
    }

    fn get_help_message(&self) -> String {
        r#"🌲 Project Tree Agent - I help you visualize your project structure!

I can only do ONE thing: show you directory trees (and files if you want). But I'm flexible in HOW I do it:

**What you can ask me:**
• "Show me the project tree" - Default view (depth 3, dirs only, hides build artifacts)
• "Show me the tree with files" - Include files (marked with 📄)
• "Give me a shallow tree" - Only 2 levels deep
• "Show me a deep tree with files" - Goes 10 levels deep with files
• "Show tree at depth 5" - Specify exact depth
• "Show me the tree without node_modules" - Exclude specific folders
• "Exclude tests and docs" - Skip multiple folders
• "Show everything including hidden files" - Include .git, .angular, etc.
• "Hide all hidden files" - Skip all dotfiles/dotfolders
• "Show me just the src folder" - Focus on specific path

**What I understand:**
- Files: "with files", "include files", "show files", "files and folders"
- Depth: shallow, deep, full, "depth N", etc.
- Exclusions: exclude, skip, ignore, without + folder names
- Paths: specific folders like src/, services/, frontend/
- Hidden files:
  * "show everything" / "include hidden" → Shows ALL including .git
  * "hide hidden" / "no hidden" → Hides ALL dotfiles/folders
  * Default → Shows some hidden (like .cargo) but excludes build artifacts

**What I CANNOT do:**
- Modify files or directories
- Execute code or commands
- Access anything outside /workspace/source
- Anything not related to showing directory trees/files

**Default behavior:**
- Directories only (no files unless you ask)
- Depth 3
- Excludes: target, node_modules, .git, .angular, dist

Ask me anything about showing your project structure!"#.to_string()
    }


    /// Generate the actual tree structure
    async fn generate_tree(&self, max_depth: usize, exclude_patterns: &[String], base_path: Option<&str>, hide_all_hidden: bool, include_files: bool) -> Result<String> {
        let work_dir = if let Some(path) = base_path {
            format!("/workspace/source/{}", path)
        } else {
            "/workspace/source".to_string()
        };

        // Build find command with exclusions
        let mut find_args = vec![
            ".".to_string(),
            "-maxdepth".to_string(),
            max_depth.to_string(),
        ];

        // If hiding all hidden files, add that filter first
        if hide_all_hidden {
            find_args.push("!".to_string());
            find_args.push("-name".to_string());
            find_args.push(".*".to_string());
        }

        // Type filter - directories or both
        if !include_files {
            find_args.push("-type".to_string());
            find_args.push("d".to_string());
        }

        // Add exclusions - use prune for better performance
        for pattern in exclude_patterns {
            find_args.push("-name".to_string());
            find_args.push(pattern.clone());
            find_args.push("-prune".to_string());
            find_args.push("-o".to_string());
        }

        // Add final print
        if !exclude_patterns.is_empty() {
            // If we're showing files, don't restrict to directories
            if !include_files {
                find_args.push("-type".to_string());
                find_args.push("d".to_string());
            }
        }
        find_args.push("-print".to_string());

        // Execute find command
        let output = Command::new("find")
            .args(&find_args)
            .current_dir(&work_dir)
            .output()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("Find command failed: {}", stderr);
        }

        let paths = String::from_utf8_lossy(&output.stdout);
        let mut lines: Vec<&str> = paths.lines().collect();
        lines.sort();

        // Build tree visualization
        let mut tree = String::new();
        tree.push_str(".\n");

        for line in lines {
            if line == "." {
                continue;
            }

            let path = line.strip_prefix("./").unwrap_or(line);
            let parts: Vec<&str> = path.split('/').collect();
            let depth = parts.len() - 1;

            let indent = "│   ".repeat(depth);
            let name = parts.last().unwrap_or(&"");

            // Check if it's a file or directory
            let full_path = format!("{}/{}", work_dir, path);
            let is_file = std::path::Path::new(&full_path).is_file();

            let prefix = if is_file { "├── 📄 " } else { "├── " };

            tree.push_str(&format!("{}{}{}\n", indent, prefix, name));
        }

        Ok(tree)
    }
}
