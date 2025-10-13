use crate::config::Config;
use crate::crypto::CryptoService;
use crate::database::neo4j_gateway::Neo4jGateway;
use crate::email::EmailService;
use crate::logging::CentralLogger;
use crate::security_metrics::SecurityMonitor;
use crate::websocket::UpdateChannel;
use kalisi_core::auth::JwtAuth;
use redis::aio::MultiplexedConnection;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub redis: MultiplexedConnection,
    pub neo4j: Arc<Neo4jGateway>,
    pub jwt_auth: Arc<JwtAuth>,
    pub email_service: Arc<EmailService>,
    #[allow(dead_code)]
    pub crypto_service: Arc<CryptoService>,
    pub security_monitor: Arc<RwLock<SecurityMonitor>>,
    pub update_channel: UpdateChannel,
    pub logger: CentralLogger,
}

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let neo4j_gateway = Arc::new(Neo4jGateway::new(&config).await?);

        // Initialize Redis connection
        let redis_client = redis::Client::open(config.redis_url.clone())?;
        let redis = redis_client.get_multiplexed_async_connection().await?;

        let config = Arc::new(config);

        // Initialize JWT auth
        let jwt_auth = Arc::new(JwtAuth::new(&config.jwt_secret));

        // Initialize email service
        let email_service = Arc::new(EmailService::new(
            "smtp.resend.com".to_string(),
            587,
            "resend".to_string(), // Use fixed username for Resend
            config.resend_api_key.clone().unwrap_or_default(),
            "EDT System <onboarding@resend.dev>".to_string(),
        ));

        // Initialize crypto service
        let crypto_service = Arc::new(CryptoService::new());

        // Initialize security monitor
        let security_monitor = Arc::new(RwLock::new(SecurityMonitor::new()));

        // Initialize update channel for WebSocket
        let update_channel = UpdateChannel::new();

        // Initialize central logger
        let redis_manager = redis::aio::ConnectionManager::new(redis_client.clone()).await?;
        let logger = CentralLogger::new(redis_manager, "api-gateway".to_string());

        Ok(Self {
            config: config.clone(),
            redis,
            neo4j: neo4j_gateway,
            jwt_auth,
            email_service,
            crypto_service,
            security_monitor,
            update_channel,
            logger,
        })
    }

    pub fn is_approved_email(&self, email: &str) -> bool {
        // If no emails configured, allow all (development mode)
        if self.config.approved_emails.is_empty() {
            return true;
        }

        self.config
            .approved_emails
            .iter()
            .any(|approved| approved == email)
    }
}
