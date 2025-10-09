use anyhow::Result;
use chrono::Utc;
use redis::aio::MultiplexedConnection;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write as IoWrite;
use std::process::Command;
use tracing::{error, info, warn};

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
    show_all_hidden: bool, // Show ALL hidden files including .git
    hide_all_hidden: bool, // Hide ALL hidden files
    include_files: bool,   // Show files in addition to directories
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

/// Claude API request structures
#[derive(Debug, Serialize)]
struct ClaudeRequest {
    model: String,
    max_tokens: i32,
    messages: Vec<ClaudeMessage>,
}

#[derive(Debug, Serialize)]
struct ClaudeMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
}

#[derive(Debug, Deserialize)]
struct ClaudeContent {
    text: String,
}

/// Parsed intent from Claude
#[derive(Debug, Deserialize)]
struct ParsedIntent {
    action: String,
    depth: Option<usize>,
    exclude: Option<Vec<String>>,
    path: Option<String>,
    show_all_hidden: Option<bool>,
    hide_all_hidden: Option<bool>,
    include_files: Option<bool>,
}

/// Project Tree Agent - Generates visual tree representations of project structure
/// Bounded task: Can ONLY generate and visualize project directory trees
/// Flexible: Understands natural language, learns user preferences
pub struct ProjectTreeAgent {
    _redis_connection: MultiplexedConnection,
    default_excludes: Vec<String>,
    conversation_history: Vec<String>,
    unanswered_questions_file: String,
    http_client: Client,
    claude_api_key: String,
    claude_api_url: String,
    claude_model: String,
}

impl ProjectTreeAgent {
    pub async fn new(redis_url: &str) -> Result<Self> {
        let client = redis::Client::open(redis_url)?;
        let redis_connection = client.get_multiplexed_async_connection().await?;

        // Load Claude API configuration from environment
        let claude_api_key = std::env::var("CLAUDE_API_KEY")
            .unwrap_or_else(|_| "sk-ant-api03-your_claude_api_key_here".to_string());
        let claude_api_url = std::env::var("CLAUDE_API_URL")
            .unwrap_or_else(|_| "https://api.anthropic.com/v1/messages".to_string());
        let claude_model = std::env::var("CLAUDE_MODEL")
            .unwrap_or_else(|_| "claude-3-5-sonnet-20241022".to_string());

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
            unanswered_questions_file:
                "/workspace/source/agents/project-tree-agent/unanswered_questions.jsonl".to_string(),
            http_client: Client::new(),
            claude_api_key,
            claude_api_url,
            claude_model,
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
            let reason =
                "Query is outside agent's bounded task (can only show directory/file trees)";
            self.log_unanswered_question(query, reason).await;

            return Ok(ProjectTreeResponse {
                tree: String::new(),
                message: format!(
                    "I can only show you directory and file trees. I cannot: modify files, execute code, or do anything outside of visualizing project structure.\n\nTry asking me to 'show the project tree' or type 'help' to see what I can do."
                ),
                success: false,
            });
        }

        // Parse user intent using Claude API
        let intent = self.parse_intent(query).await?;

        match intent.action {
            TreeAction::ShowTree => self.execute_tree_generation(intent).await,
            TreeAction::Help => Ok(ProjectTreeResponse {
                tree: String::new(),
                message: self.get_help_message(),
                success: true,
            }),
        }
    }

    /// Detect queries that are clearly outside the agent's scope
    fn is_out_of_scope(&self, query: &str) -> bool {
        let query_lower = query.to_lowercase();

        // Keywords that indicate out-of-scope requests
        let out_of_scope_keywords = [
            "create ", "delete ", "modify ", "edit ", "write ", "remove ", "rename ", "move ",
            "copy ", "run ", "execute", "compile", "build ", "install", "deploy", "commit",
            "push ", "search ", "find ", "grep", "read ", "open ", "analyze", "count",
        ];

        out_of_scope_keywords
            .iter()
            .any(|keyword| query_lower.contains(keyword))
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

    /// Parse natural language using Claude API to understand user intent
    async fn parse_intent(&self, query: &str) -> Result<UserIntent> {
        let prompt = format!(
            r#"Parse this user query about showing a project directory tree and extract the intent as JSON.

User query: "{}"

Respond ONLY with a JSON object (no markdown, no explanation) with these fields:
- action: "show_tree" or "help"
- depth: number (1-20) or null for default. Parse phrases like "one level"=1, "two levels"=2, "shallow"=2, "deep"=10
- exclude: array of folder names to exclude, or null
- path: specific path like "src" or "services", or null
- show_all_hidden: true/false - if user wants to see ALL hidden files including .git
- hide_all_hidden: true/false - if user wants to hide ALL dotfiles
- include_files: true/false - if user wants to see files (not just directories)

Default values if not specified:
- depth: 3
- exclude: ["target", "node_modules", ".git", ".angular", "dist"]
- include_files: false
- show_all_hidden: false
- hide_all_hidden: false

Example queries:
"show me one level" -> {{"action": "show_tree", "depth": 1, "exclude": null, "path": null, "show_all_hidden": false, "hide_all_hidden": false, "include_files": false}}
"show tree with files at depth 2" -> {{"action": "show_tree", "depth": 2, "exclude": null, "path": null, "show_all_hidden": false, "hide_all_hidden": false, "include_files": true}}"#,
            query
        );

        let request = ClaudeRequest {
            model: self.claude_model.clone(),
            max_tokens: 512,
            messages: vec![ClaudeMessage {
                role: "user".to_string(),
                content: prompt,
            }],
        };

        let response = self
            .http_client
            .post(&self.claude_api_url)
            .header("x-api-key", &self.claude_api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await?;
            anyhow::bail!("Claude API error {}: {}", status, body);
        }

        let claude_response: ClaudeResponse = response.json().await?;
        let json_text = claude_response
            .content
            .first()
            .map(|c| c.text.as_str())
            .unwrap_or("{}");

        info!("🤖 Claude response: {}", json_text);

        let parsed: ParsedIntent = serde_json::from_str(json_text)?;

        // Convert to UserIntent
        let action = if parsed.action == "help" {
            TreeAction::Help
        } else {
            TreeAction::ShowTree
        };

        let exclude = if let Some(exc) = parsed.exclude {
            exc
        } else {
            self.default_excludes.clone()
        };

        Ok(UserIntent {
            action,
            depth: parsed.depth,
            exclude,
            path: parsed.path,
            show_all_hidden: parsed.show_all_hidden.unwrap_or(false),
            hide_all_hidden: parsed.hide_all_hidden.unwrap_or(false),
            include_files: parsed.include_files.unwrap_or(false),
        })
    }

    /// Execute the tree generation with parsed intent
    async fn execute_tree_generation(&self, intent: UserIntent) -> Result<ProjectTreeResponse> {
        let depth = intent.depth.unwrap_or(3);

        info!("🌲 Generating tree: depth={}, excludes={:?}, path={:?}, show_all_hidden={}, hide_all_hidden={}, include_files={}",
              depth, intent.exclude, intent.path, intent.show_all_hidden, intent.hide_all_hidden, intent.include_files);

        match self
            .generate_tree(
                depth,
                &intent.exclude,
                intent.path.as_deref(),
                intent.hide_all_hidden,
                intent.include_files,
            )
            .await
        {
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
    async fn generate_tree(
        &self,
        max_depth: usize,
        exclude_patterns: &[String],
        base_path: Option<&str>,
        hide_all_hidden: bool,
        include_files: bool,
    ) -> Result<String> {
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

            let prefix = if is_file {
                "├── 📄 "
            } else {
                "├── "
            };

            tree.push_str(&format!("{}{}{}\n", indent, prefix, name));
        }

        Ok(tree)
    }
}
