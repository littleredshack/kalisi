use neo4rs::{Graph, ConfigBuilder, query};
use std::sync::Arc;
use serde::{Serialize, Deserialize};
use serde_json::json;
use chrono::{DateTime, Utc};
use uuid::Uuid;
use crate::config::Config;

/// Node types for the EDT graph
#[derive(Debug, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: i64,
    pub label: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub properties: serde_json::Value,
}

/// Relationship types for the EDT graph
#[derive(Debug, Serialize, Deserialize)]
pub struct GraphRelationship {
    pub source: i64,
    pub target: i64,
    #[serde(rename = "type")]
    pub rel_type: String,
    pub properties: serde_json::Value,
}

/// System overview counts
#[derive(Debug, Serialize, Deserialize)]
pub struct SystemOverview {
    pub projects: i64,
    pub agents: i64,
    pub components: i64,
    pub events: i64,
}

/// Activity event
#[derive(Debug, Serialize, Deserialize)]
pub struct ActivityEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub title: String,
    pub description: String,
    pub timestamp: String,
}

/// Neo4j graph database connection wrapper
#[derive(Clone)]
pub struct GraphDb {
    pub graph: Arc<Graph>,
}

impl GraphDb {
    /// Create a new Neo4j connection
    pub async fn new(config: &Config) -> anyhow::Result<Self> {
        let neo4j_config = ConfigBuilder::default()
            .uri(&config.neo4j_uri)
            .user(&config.neo4j_username)
            .password(&config.neo4j_password)
            .db(config.neo4j_database.clone())
            .build()?;
        
        let graph = Arc::new(Graph::connect(neo4j_config).await?);
        
        // Run initialization queries
        Self::initialize_constraints(&graph).await?;
        
        Ok(Self { graph })
    }
    
    #[cfg(test)]
    /// Create a test Neo4j connection
    pub async fn new_test() -> anyhow::Result<Self> {
        use std::env;
        
        dotenv::dotenv().ok();
        
        let neo4j_config = ConfigBuilder::default()
            .uri(&env::var("TEST_NEO4J_URI").unwrap_or_else(|_| "bolt://localhost:7687".to_string()))
            .user(&env::var("TEST_NEO4J_USER").unwrap_or_else(|_| "neo4j".to_string()))
            .password(&env::var("TEST_NEO4J_PASSWORD").unwrap_or_else(|_| "password".to_string()))
            .db(&env::var("TEST_NEO4J_DATABASE").unwrap_or_else(|_| "neo4j".to_string()))
            .build()?;
        
        let graph = Arc::new(Graph::connect(neo4j_config).await?);
        
        // Run initialization queries for test database
        Self::initialize_constraints(&graph).await?;
        
        // Clear any existing test data
        graph.run("MATCH (n) WHERE n.test = true DETACH DELETE n").await?;
        
        Ok(Self { graph })
    }
    
    /// Initialize database constraints and indexes
    async fn initialize_constraints(graph: &Graph) -> anyhow::Result<()> {
        // Create unique constraint on Twin.id
        graph.run(
            query("CREATE CONSTRAINT twin_id_unique IF NOT EXISTS 
             FOR (t:Twin) REQUIRE t.id IS UNIQUE")
        ).await?;
        
        // Create unique constraint on Component.id  
        graph.run(
            query("CREATE CONSTRAINT component_id_unique IF NOT EXISTS
             FOR (c:Component) REQUIRE c.id IS UNIQUE")
        ).await?;
        
        // Create unique constraint on Service.name
        graph.run(
            query("CREATE CONSTRAINT service_name_unique IF NOT EXISTS
             FOR (s:Service) REQUIRE s.name IS UNIQUE")
        ).await?;
        
        // Create index on Twin.type for performance
        graph.run(
            query("CREATE INDEX twin_type_index IF NOT EXISTS
             FOR (t:Twin) ON (t.type)")
        ).await?;
        
        // Create index on Component.status for monitoring
        graph.run(
            query("CREATE INDEX component_status_index IF NOT EXISTS
             FOR (c:Component) ON (c.status)")
        ).await?;
        
        // Create index on relationships for performance
        graph.run(
            query("CREATE INDEX rel_type_index IF NOT EXISTS
             FOR ()-[r:CONTAINS]->() ON (r.created_at)")
        ).await?;
        
        graph.run(
            query("CREATE INDEX rel_depends_index IF NOT EXISTS
             FOR ()-[r:DEPENDS_ON]->() ON (r.created_at)")
        ).await?;
        
        tracing::info!("Neo4j database constraints and indexes initialized");
        
        Ok(())
    }
    
    /// Health check for Neo4j connection
    pub async fn health_check(&self) -> anyhow::Result<bool> {
        let mut result = self.graph.execute(
            neo4rs::query("RETURN 1 as health")
        ).await?;
        
        Ok(result.next().await?.is_some())
    }
    
    /// Get system overview with counts from the graph
    pub async fn get_system_overview(&self) -> anyhow::Result<SystemOverview> {
        // Count projects (systems)
        let mut projects_result = self.graph.execute(
            query("MATCH (s:System) RETURN count(s) as count")
        ).await?;
        
        let projects = if let Ok(Some(row)) = projects_result.next().await {
            row.get::<i64>("count").unwrap_or(0)
        } else {
            0
        };
        
        // Count agents
        let mut agents_result = self.graph.execute(
            query("MATCH (a:Agent) RETURN count(a) as count")
        ).await?;
        
        let agents = if let Ok(Some(row)) = agents_result.next().await {
            row.get::<i64>("count").unwrap_or(0)
        } else {
            0
        };
        
        // Count components
        let mut components_result = self.graph.execute(
            query("MATCH (c:Component) RETURN count(c) as count")
        ).await?;
        
        let components = if let Ok(Some(row)) = components_result.next().await {
            row.get::<i64>("count").unwrap_or(0)
        } else {
            0
        };
        
        // Count events
        let mut events_result = self.graph.execute(
            query("MATCH (e:Event) RETURN count(e) as count")
        ).await?;
        
        let events = if let Ok(Some(row)) = events_result.next().await {
            row.get::<i64>("count").unwrap_or(0)
        } else {
            0
        };
        
        Ok(SystemOverview {
            projects,
            agents,
            components,
            events,
        })
    }
    
    /// Get recent activity events from the graph - NO AUTO-POPULATION
    pub async fn get_recent_activity(&self, limit: i64) -> anyhow::Result<Vec<ActivityEvent>> {
        let mut result = self.graph.execute(
            query("MATCH (e:Event) 
                   RETURN e.type as event_type, e.title as title, 
                          e.description as description, e.timestamp as timestamp
                   ORDER BY e.timestamp DESC
                   LIMIT $limit")
                .param("limit", limit)
        ).await?;
        
        let mut activities = Vec::new();
        
        while let Ok(Some(row)) = result.next().await {
            activities.push(ActivityEvent {
                event_type: row.get::<String>("event_type").unwrap_or_default(),
                title: row.get::<String>("title").unwrap_or_default(),
                description: row.get::<String>("description").unwrap_or_default(),
                timestamp: row.get::<String>("timestamp").unwrap_or_else(|_| Utc::now().to_rfc3339()),
            });
        }
        
        // FIXED: Return empty array instead of auto-creating data
        Ok(activities)
    }
    
    /// Get full graph data with nodes and relationships - NO AUTO-POPULATION
    pub async fn get_graph_data(&self) -> anyhow::Result<(Vec<GraphNode>, Vec<GraphRelationship>)> {
        // Get all nodes
        let mut nodes_result = self.graph.execute(
            query("MATCH (n) 
                   WHERE n:System OR n:Component OR n:Module OR n:Database OR n:Agent OR n:Service
                   RETURN id(n) as id, labels(n) as labels, properties(n) as props")
        ).await?;
        
        let mut nodes = Vec::new();
        
        while let Ok(Some(row)) = nodes_result.next().await {
            let id = row.get::<i64>("id").unwrap_or_default();
            let labels: Vec<String> = row.get("labels").unwrap_or_default();
            let label = labels.first().cloned().unwrap_or_default();
            let props: serde_json::Value = row.get("props").unwrap_or(serde_json::json!({}));
            
            nodes.push(GraphNode {
                id,
                label: props.get("name").and_then(|v| v.as_str()).unwrap_or(&label).to_string(),
                node_type: label.to_lowercase(),
                properties: props,
            });
        }
        
        // Get all relationships
        let mut rels_result = self.graph.execute(
            query("MATCH (a)-[r]->(b)
                   WHERE (a:System OR a:Component OR a:Module OR a:Database OR a:Agent OR a:Service)
                   AND (b:System OR b:Component OR b:Module OR b:Database OR b:Agent OR b:Service)
                   RETURN id(a) as source, id(b) as target, type(r) as rel_type, properties(r) as props")
        ).await?;
        
        let mut relationships = Vec::new();
        
        while let Ok(Some(row)) = rels_result.next().await {
            relationships.push(GraphRelationship {
                source: row.get::<i64>("source").unwrap_or_default(),
                target: row.get::<i64>("target").unwrap_or_default(),
                rel_type: row.get::<String>("rel_type").unwrap_or_default(),
                properties: row.get("props").unwrap_or(serde_json::json!({})),
            });
        }
        
        // FIXED: Return empty data instead of auto-creating
        Ok((nodes, relationships))
    }
    
    /// Track a new event in the graph
    pub async fn track_event(&self, event_type: &str, title: &str, description: &str, user_email: &str) -> anyhow::Result<String> {
        let event_id = uuid::Uuid::new_v4().to_string();
        let timestamp = Utc::now().to_rfc3339();
        
        self.graph.run(
            query("CREATE (e:Event {
                    id: $id,
                    type: $event_type,
                    title: $title,
                    description: $description,
                    timestamp: $timestamp,
                    tracked_by: $user_email
                })")
                .param("id", event_id.clone())
                .param("event_type", event_type)
                .param("title", title)
                .param("description", description)
                .param("timestamp", timestamp)
                .param("user_email", user_email)
        ).await?;
        
        Ok(event_id)
    }
    
    /// Initialize system structure - TO BE CALLED EXPLICITLY
    pub async fn initialize_system(&self) -> anyhow::Result<()> {
        // Create the main EDT system node
        self.graph.run(
            query("MERGE (s:System {id: 'edt-system', name: 'EDT System', version: '2.0'})")
        ).await?;
        
        // Track initialization event
        self.track_event(
            "system_init", 
            "EDT System Initialized", 
            "Core system structure created in Neo4j graph database", 
            "system"
        ).await?;
        
        Ok(())
    }
    
    /// Register a component in the graph
    pub async fn register_component(&self, id: &str, name: &str, component_type: &str) -> anyhow::Result<()> {
        self.graph.run(
            query("MATCH (s:System {id: 'edt-system'})
                   MERGE (c:Component {id: $id, name: $name, type: $type, status: 'active'})
                   MERGE (s)-[:CONTAINS]->(c)")
                .param("id", id)
                .param("name", name)
                .param("type", component_type)
        ).await?;
        
        // Track component registration
        self.track_event(
            "component_registered",
            &format!("Component {} Registered", name),
            &format!("New {} component added to the system", component_type),
            "system"
        ).await?;
        
        Ok(())
    }
    
    /// Register an agent in the graph
    pub async fn register_agent(&self, id: &str, name: &str, role: &str, agent_type: &str) -> anyhow::Result<()> {
        self.graph.run(
            query("MATCH (s:System {id: 'edt-system'})
                   MERGE (a:Agent {id: $id, name: $name, role: $role, type: $type, status: 'active'})
                   MERGE (s)-[:EMPLOYS]->(a)")
                .param("id", id)
                .param("name", name)
                .param("role", role)
                .param("type", agent_type)
        ).await?;
        
        // Track agent spawning
        self.track_event(
            "agent_spawn",
            &format!("Agent {} Spawned", name),
            &format!("New {} agent with role {} joined the swarm", agent_type, role),
            "system"
        ).await?;
        
        Ok(())
    }
    
    /// Get agent details and their relationships
    pub async fn get_agent_details(&self, agent_id: &str) -> anyhow::Result<serde_json::Value> {
        let mut result = self.graph.execute(
            query("MATCH (a:Agent {id: $agent_id})
                   OPTIONAL MATCH (a)-[r]-(connected)
                   RETURN a, collect({node: connected, relationship: type(r)}) as connections")
                .param("agent_id", agent_id)
        ).await?;
        
        if let Ok(Some(row)) = result.next().await {
            let agent: serde_json::Value = row.get("a").unwrap_or(serde_json::json!({}));
            let connections: Vec<serde_json::Value> = row.get("connections").unwrap_or_default();
            
            Ok(json!({
                "agent": agent,
                "connections": connections
            }))
        } else {
            Ok(json!({
                "error": "Agent not found"
            }))
        }
    }
    
    /// Get component health status
    pub async fn get_component_health(&self) -> anyhow::Result<Vec<serde_json::Value>> {
        let mut result = self.graph.execute(
            query("MATCH (c:Component)
                   RETURN c.id as id, c.name as name, c.status as status,
                          c.last_health_check as last_check")
        ).await?;
        
        let mut components = Vec::new();
        
        while let Ok(Some(row)) = result.next().await {
            components.push(json!({
                "id": row.get::<String>("id").unwrap_or_default(),
                "name": row.get::<String>("name").unwrap_or_default(),
                "status": row.get::<String>("status").unwrap_or("unknown".to_string()),
                "last_check": row.get::<String>("last_check").unwrap_or_else(|_| "never".to_string())
            }));
        }
        
        Ok(components)
    }
    
    /// Update component status
    pub async fn update_component_status(&self, component_id: &str, status: &str) -> anyhow::Result<()> {
        self.graph.run(
            query("MATCH (c:Component {id: $component_id})
                   SET c.status = $status, c.last_health_check = $timestamp")
                .param("component_id", component_id)
                .param("status", status)
                .param("timestamp", Utc::now().to_rfc3339())
        ).await?;
        
        Ok(())
    }
    
    /// Add a relationship between nodes
    pub async fn add_relationship(&self, from_id: &str, to_id: &str, rel_type: &str) -> anyhow::Result<()> {
        self.graph.run(
            query("MATCH (a {id: $from_id}), (b {id: $to_id})
                   CREATE (a)-[r:REL_TYPE {created_at: $timestamp}]->(b)")
                .param("from_id", from_id)
                .param("to_id", to_id)
                .param("timestamp", Utc::now().to_rfc3339())
        ).await?;
        
        Ok(())
    }
    
    /// Search nodes by property
    pub async fn search_nodes(&self, label: &str, property: &str, value: &str) -> anyhow::Result<Vec<serde_json::Value>> {
        let query_str = format!("MATCH (n:{}) WHERE n.{} CONTAINS $value RETURN n", label, property);
        let mut result = self.graph.execute(
            query(&query_str).param("value", value)
        ).await?;
        
        let mut nodes = Vec::new();
        
        while let Ok(Some(row)) = result.next().await {
            let node: serde_json::Value = row.get("n").unwrap_or(serde_json::json!({}));
            nodes.push(node);
        }
        
        Ok(nodes)
    }
    
    /// Get system metrics
    pub async fn get_system_metrics(&self) -> anyhow::Result<serde_json::Value> {
        // Get various metrics in parallel using Neo4j
        let mut total_nodes = self.graph.execute(
            query("MATCH (n) RETURN count(n) as count")
        ).await?;
        
        let mut total_relationships = self.graph.execute(
            query("MATCH ()-[r]->() RETURN count(r) as count")
        ).await?;
        
        let mut active_agents = self.graph.execute(
            query("MATCH (a:Agent) WHERE a.status = 'active' RETURN count(a) as count")
        ).await?;
        
        let mut recent_events = self.graph.execute(
            query("MATCH (e:Event) WHERE e.timestamp > $cutoff RETURN count(e) as count")
                .param("cutoff", (Utc::now() - chrono::Duration::hours(24)).to_rfc3339())
        ).await?;
        
        Ok(json!({
            "total_nodes": total_nodes.next().await
                .ok()
                .flatten()
                .and_then(|row| row.get::<i64>("count").ok())
                .unwrap_or(0),
            "total_relationships": total_relationships.next().await
                .ok()
                .flatten()
                .and_then(|row| row.get::<i64>("count").ok())
                .unwrap_or(0),
            "active_agents": active_agents.next().await
                .ok()
                .flatten()
                .and_then(|row| row.get::<i64>("count").ok())
                .unwrap_or(0),
            "recent_events_24h": recent_events.next().await
                .ok()
                .flatten()
                .and_then(|row| row.get::<i64>("count").ok())
                .unwrap_or(0),
        }))
    }
}