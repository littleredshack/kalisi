use anyhow::Result;
use project_tree_agent::ProjectTreeAgent;
use std::io::{self, Write};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing for logs
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    println!("🌲 Project Tree Agent - Interactive CLI\n");
    println!("Type your commands below. Type 'quit' or 'exit' to leave.\n");

    // Create agent (Redis URL doesn't matter for standalone testing)
    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

    let mut agent = ProjectTreeAgent::new(&redis_url).await?;
    agent.initialize().await?;

    println!("{}\n", "=".repeat(70));

    // Interactive loop
    let stdin = io::stdin();
    loop {
        print!("You: ");
        io::stdout().flush()?;

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
                println!("{}\n", "=".repeat(70));
            }
            Err(e) => {
                println!("\n❌ Error: {}\n", e);
                println!("{}\n", "=".repeat(70));
            }
        }
    }

    Ok(())
}
