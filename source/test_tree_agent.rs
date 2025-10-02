use anyhow::Result;

// Import the agent - we'll need to add this module
mod project_tree_agent {
    include!("services/agent-runtime/src/project_tree_agent.rs");
}

use project_tree_agent::{ProjectTreeAgent, ProjectTreeResponse};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing for logs
    tracing_subscriber::fmt::init();

    println!("🌲 Project Tree Agent - Interactive Test\n");
    println!("Type your commands below. Type 'quit' to exit.\n");

    // Create agent (using dummy Redis URL since we're testing directly)
    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

    let mut agent = ProjectTreeAgent::new(&redis_url).await?;
    agent.initialize().await?;

    println!("\n{}\n", "=".repeat(60));

    // Interactive loop
    let stdin = std::io::stdin();
    loop {
        print!("You: ");
        std::io::Write::flush(&mut std::io::stdout())?;

        let mut input = String::new();
        stdin.read_line(&mut input)?;
        let input = input.trim();

        if input.is_empty() {
            continue;
        }

        if input.eq_ignore_ascii_case("quit") || input.eq_ignore_ascii_case("exit") {
            println!("\n👋 Goodbye!");
            break;
        }

        // Process the query
        match agent.process_query(input).await {
            Ok(response) => {
                println!("\n🌲 Agent: {}\n", response.message);
                if !response.tree.is_empty() {
                    println!("{}", response.tree);
                }
                println!("{}\n", "=".repeat(60));
            }
            Err(e) => {
                println!("\n❌ Error: {}\n", e);
                println!("{}\n", "=".repeat(60));
            }
        }
    }

    Ok(())
}
