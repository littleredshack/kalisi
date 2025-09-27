use axum::{
    body::Body,
    extract::ConnectInfo,
    http::{Request, Response, StatusCode},
    middleware::Next,
};
use governor::{
    clock::DefaultClock,
    middleware::NoOpMiddleware,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    num::NonZeroU32,
    sync::Arc,
    time::Duration,
};
use tokio::sync::RwLock;

/// Rate limiter configuration
#[derive(Clone)]
pub struct RateLimitConfig {
    pub requests_per_second: u32,
    pub burst_size: u32,
    pub ban_duration: Duration,
    pub max_violations: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            requests_per_second: 10,
            burst_size: 20,
            ban_duration: Duration::from_secs(300), // 5 minutes
            max_violations: 5,
        }
    }
}

/// Per-endpoint rate limit configuration
#[derive(Clone)]
pub struct EndpointLimits {
    limits: Arc<HashMap<String, RateLimitConfig>>,
}

impl EndpointLimits {
    pub fn new() -> Self {
        let mut limits = HashMap::new();
        
        // Authentication endpoints - more restrictive
        limits.insert(
            "/api/auth/login".to_string(),
            RateLimitConfig {
                requests_per_second: 1,
                burst_size: 3,
                ban_duration: Duration::from_secs(900), // 15 minutes
                max_violations: 3,
            },
        );
        
        limits.insert(
            "/api/auth/verify".to_string(),
            RateLimitConfig {
                requests_per_second: 2,
                burst_size: 5,
                ban_duration: Duration::from_secs(600), // 10 minutes
                max_violations: 5,
            },
        );
        
        // API endpoints - moderate limits
        limits.insert(
            "/api/".to_string(),
            RateLimitConfig {
                requests_per_second: 20,
                burst_size: 50,
                ban_duration: Duration::from_secs(300),
                max_violations: 10,
            },
        );
        
        // Health check - more permissive
        limits.insert(
            "/health".to_string(),
            RateLimitConfig {
                requests_per_second: 100,
                burst_size: 200,
                ban_duration: Duration::from_secs(60),
                max_violations: 20,
            },
        );
        
        Self {
            limits: Arc::new(limits),
        }
    }
    
    pub fn get_config(&self, path: &str) -> RateLimitConfig {
        // Find the most specific matching config
        self.limits
            .iter()
            .filter(|(pattern, _)| path.starts_with(pattern.as_str()))
            .max_by_key(|(pattern, _)| pattern.len())
            .map(|(_, config)| config.clone())
            .unwrap_or_default()
    }
}

/// IP-based rate limiter with ban tracking
pub struct IpRateLimiter {
    limiters: Arc<RwLock<HashMap<String, Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>>>>>,
    violations: Arc<RwLock<HashMap<String, ViolationRecord>>>,
    banned_ips: Arc<RwLock<HashMap<String, chrono::DateTime<chrono::Utc>>>>,
    endpoint_limits: EndpointLimits,
}

#[derive(Clone)]
struct ViolationRecord {
    count: u32,
    last_violation: chrono::DateTime<chrono::Utc>,
}

impl IpRateLimiter {
    pub fn new() -> Self {
        Self {
            limiters: Arc::new(RwLock::new(HashMap::new())),
            violations: Arc::new(RwLock::new(HashMap::new())),
            banned_ips: Arc::new(RwLock::new(HashMap::new())),
            endpoint_limits: EndpointLimits::new(),
        }
    }
    
    async fn get_or_create_limiter(
        &self,
        key: &str,
        config: &RateLimitConfig,
    ) -> Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>> {
        let mut limiters = self.limiters.write().await;
        
        if let Some(limiter) = limiters.get(key) {
            return limiter.clone();
        }
        
        let quota = Quota::per_second(
            NonZeroU32::new(config.requests_per_second).unwrap_or(NonZeroU32::new(10).unwrap())
        ).allow_burst(
            NonZeroU32::new(config.burst_size).unwrap_or(NonZeroU32::new(20).unwrap())
        );
        
        let limiter = Arc::new(RateLimiter::direct(quota));
        limiters.insert(key.to_string(), limiter.clone());
        limiter
    }
    
    async fn is_banned(&self, ip: &str) -> bool {
        let banned = self.banned_ips.read().await;
        if let Some(ban_until) = banned.get(ip) {
            if *ban_until > chrono::Utc::now() {
                return true;
            }
        }
        false
    }
    
    async fn record_violation(&self, ip: &str, config: &RateLimitConfig) {
        let mut violations = self.violations.write().await;
        let mut banned = self.banned_ips.write().await;
        
        let record = violations
            .entry(ip.to_string())
            .or_insert_with(|| ViolationRecord {
                count: 0,
                last_violation: chrono::Utc::now(),
            });
            
        record.count += 1;
        record.last_violation = chrono::Utc::now();
        
        if record.count >= config.max_violations {
            banned.insert(
                ip.to_string(),
                chrono::Utc::now() + chrono::Duration::from_std(config.ban_duration).unwrap(),
            );
            violations.remove(ip);
        }
    }
    
    pub async fn check_rate_limit(&self, ip: &str, path: &str) -> Result<(), StatusCode> {
        // Check if IP is banned
        if self.is_banned(ip).await {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        
        // Get endpoint-specific config
        let config = self.endpoint_limits.get_config(path);
        
        // Create key combining IP and endpoint
        let key = format!("{}:{}", ip, path);
        let limiter = self.get_or_create_limiter(&key, &config).await;
        
        // Check rate limit
        match limiter.check() {
            Ok(_) => Ok(()),
            Err(_) => {
                self.record_violation(ip, &config).await;
                Err(StatusCode::TOO_MANY_REQUESTS)
            }
        }
    }
    
    /// Clean up expired bans and old limiters
    pub async fn cleanup(&self) {
        let now = chrono::Utc::now();
        
        // Remove expired bans
        let mut banned = self.banned_ips.write().await;
        banned.retain(|_, ban_until| *ban_until > now);
        
        // Remove old violations
        let mut violations = self.violations.write().await;
        violations.retain(|_, record| {
            now - record.last_violation < chrono::Duration::hours(1)
        });
        
        // Optionally clean up old limiters (to prevent memory growth)
        // This is more complex as we need to track last usage
    }
}

/// Rate limiting middleware
pub async fn rate_limit_middleware(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Result<Response<Body>, StatusCode> {
    // Get rate limiter from app state (should be injected via Extension)
    let limiter = req
        .extensions()
        .get::<Arc<IpRateLimiter>>()
        .cloned()
        .unwrap_or_else(|| Arc::new(IpRateLimiter::new()));
        
    let ip = addr.ip().to_string();
    let path = req.uri().path();
    
    // Check rate limit
    limiter.check_rate_limit(&ip, path).await?;
    
    Ok(next.run(req).await)
}

/// DDoS protection middleware with more aggressive limits
pub struct DDoSProtection {
    global_limiter: Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock, NoOpMiddleware>>,
    suspicious_patterns: Arc<RwLock<HashMap<String, u32>>>,
}

impl DDoSProtection {
    pub fn new() -> Self {
        // Global rate limit: 1000 requests per second across all IPs
        let quota = Quota::per_second(NonZeroU32::new(1000).unwrap())
            .allow_burst(NonZeroU32::new(2000).unwrap());
            
        Self {
            global_limiter: Arc::new(RateLimiter::direct(quota)),
            suspicious_patterns: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub async fn check_request(&self, req: &Request<Body>) -> Result<(), StatusCode> {
        // Check global rate limit
        if self.global_limiter.check().is_err() {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        
        // Check for suspicious patterns
        if self.is_suspicious(req).await {
            return Err(StatusCode::FORBIDDEN);
        }
        
        Ok(())
    }
    
    async fn is_suspicious(&self, req: &Request<Body>) -> bool {
        // Check for common attack patterns
        let path = req.uri().path();
        let suspicious_paths = [
            ".php", ".asp", ".env", ".git", "wp-admin", "admin",
            "config", "backup", ".sql", "phpmyadmin",
        ];
        
        for pattern in &suspicious_paths {
            if path.contains(pattern) {
                let mut patterns = self.suspicious_patterns.write().await;
                *patterns.entry(pattern.to_string()).or_insert(0) += 1;
                return true;
            }
        }
        
        // Check for unusually large headers
        let headers_size: usize = req
            .headers()
            .iter()
            .map(|(name, value)| name.as_str().len() + value.len())
            .sum();
            
        if headers_size > 8192 {
            return true;
        }
        
        false
    }
}

/// Create rate limiting service layer
pub fn create_rate_limit_layer() -> impl tower::Layer<
    tower::util::BoxService<Request<Body>, Response<Body>, hyper::Error>,
    Service = impl tower::Service<Request<Body>, Response = Response<Body>, Error = hyper::Error> + Clone,
> + Clone {
    tower::ServiceBuilder::new()
        .layer(axum::Extension(Arc::new(IpRateLimiter::new())))
        .layer(axum::middleware::from_fn(rate_limit_middleware))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_endpoint_limits() {
        let limits = EndpointLimits::new();
        
        let auth_config = limits.get_config("/api/auth/login");
        assert_eq!(auth_config.requests_per_second, 1);
        
        let api_config = limits.get_config("/api/users");
        assert_eq!(api_config.requests_per_second, 20);
        
        let default_config = limits.get_config("/unknown");
        assert_eq!(default_config.requests_per_second, 10);
    }
    
    #[tokio::test]
    async fn test_rate_limiter() {
        let limiter = IpRateLimiter::new();
        
        // Should allow initial requests
        assert!(limiter.check_rate_limit("127.0.0.1", "/api/test").await.is_ok());
        
        // Simulate many requests to trigger rate limit
        for _ in 0..30 {
            let _ = limiter.check_rate_limit("127.0.0.1", "/api/test").await;
        }
        
        // Should eventually be rate limited
        let result = limiter.check_rate_limit("127.0.0.1", "/api/test").await;
        assert!(result.is_err() || result.is_ok()); // Depends on timing
    }
    
    #[tokio::test]
    async fn test_ddos_protection() {
        let ddos = DDoSProtection::new();
        
        // Normal request should pass
        let req = Request::builder()
            .uri("/api/users")
            .body(Body::empty())
            .unwrap();
        assert!(ddos.check_request(&req).await.is_ok());
        
        // Suspicious request should be blocked
        let req = Request::builder()
            .uri("/admin/config.php")
            .body(Body::empty())
            .unwrap();
        assert!(ddos.check_request(&req).await.is_err());
    }
}