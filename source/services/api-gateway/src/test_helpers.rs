#[cfg(test)]
pub mod test_helpers {
    use crate::storage::{OtpStorage, SessionStorage};
    use crate::graph::GraphClient;
    use redis::aio::MultiplexedConnection;
    use sqlx::{PgPool, postgres::PgPoolOptions};
    use anyhow::Result;
    
    /// Create test Redis connection
    pub async fn create_test_redis() -> Result<MultiplexedConnection> {
        let client = redis::Client::open("redis://127.0.0.1/")?;
        Ok(client.get_multiplexed_async_connection().await?)
    }
    
    /// Create test PostgreSQL pool
    pub async fn create_test_pg_pool() -> Result<PgPool> {
        dotenv::dotenv().ok();
        let database_url = std::env::var("TEST_DATABASE_URL")
            .expect("TEST_DATABASE_URL must be set in .env file for tests");
        
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await?;
        
        // Run migrations
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await?;
        
        Ok(pool)
    }
    
    /// Create test OTP storage
    pub async fn create_test_otp_storage() -> Result<OtpStorage> {
        let redis = create_test_redis().await?;
        Ok(OtpStorage::new(redis))
    }
    
    /// Create test session storage
    pub async fn create_test_session_storage() -> Result<SessionStorage> {
        let pool = create_test_pg_pool().await?;
        Ok(SessionStorage::new(pool))
    }
    
    /// Create test graph client
    pub async fn create_test_graph_client() -> Result<GraphClient> {
        dotenv::dotenv().ok();
        
        let uri = std::env::var("TEST_NEO4J_URI")
            .expect("TEST_NEO4J_URI must be set in .env file for tests");
        let user = std::env::var("TEST_NEO4J_USER")
            .expect("TEST_NEO4J_USER must be set in .env file for tests");
        let password = std::env::var("TEST_NEO4J_PASSWORD")
            .expect("TEST_NEO4J_PASSWORD must be set in .env file for tests");
        
        GraphClient::new(&uri, &user, &password).await
    }
    
    /// Clean up test data in PostgreSQL
    pub async fn cleanup_test_postgres(pool: &PgPool) -> Result<()> {
        // Delete test data in reverse order of foreign key dependencies
        sqlx::query!("DELETE FROM auth_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test%')")
            .execute(pool)
            .await?;
        
        sqlx::query!("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%test%')")
            .execute(pool)
            .await?;
        
        sqlx::query!("DELETE FROM users WHERE email LIKE '%test%')")
            .execute(pool)
            .await?;
        
        Ok(())
    }
    
    /// Clean up test data in Redis
    pub async fn cleanup_test_redis(redis: &mut MultiplexedConnection) -> Result<()> {
        use redis::AsyncCommands;
        
        // Delete all test OTP keys
        let keys: Vec<String> = redis.keys("otp:*test*").await?;
        for key in keys {
            redis.del::<_, ()>(&key).await?;
        }
        
        Ok(())
    }
    
    /// Clean up test data in Neo4j
    pub async fn cleanup_test_neo4j(graph: &GraphClient) -> Result<()> {
        graph.execute_query("MATCH (n) WHERE n.test = true DETACH DELETE n").await?;
        Ok(())
    }
    
    /// Create test user in database
    pub async fn create_test_user(pool: &PgPool, email: &str, name: &str) -> Result<i64> {
        let result = sqlx::query!(
            "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id",
            email,
            name
        )
        .fetch_one(pool)
        .await?;
        
        Ok(result.id)
    }
    
    /// Create test session in database
    pub async fn create_test_session(pool: &PgPool, user_id: i64, token: &str) -> Result<()> {
        let expires_at = chrono::Utc::now() + chrono::Duration::days(7);
        
        sqlx::query!(
            "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)",
            user_id,
            token,
            expires_at
        )
        .execute(pool)
        .await?;
        
        Ok(())
    }
}

// Re-export for tests
#[cfg(test)]
pub use test_helpers::*;