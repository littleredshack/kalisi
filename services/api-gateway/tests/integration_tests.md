# EDT MFA Authentication Test Suite

## 📋 Overview

This test suite provides comprehensive testing for the EDT Multi-Factor Authentication system, covering functionality, security, and performance aspects.

## 🏗️ Test Structure

```
tests/
├── README.md                    # This file
├── Cargo.toml                   # Test dependencies
├── test_utils.rs               # Shared utilities and helpers
├── mfa_auth_tests.rs           # Core MFA functionality tests
├── security_tests.rs           # Security vulnerability tests
└── bin/
    └── run_mfa_tests.rs        # Custom test runner
```

## 🧪 Test Categories

### 1. MFA Authentication Tests (`mfa_auth_tests.rs`)

Tests the core Multi-Factor Authentication functionality:

- **OTP Flow**: Email OTP request and verification
- **MFA Setup**: TOTP secret generation and QR code creation
- **MFA Enable**: TOTP verification and activation
- **Token Management**: JWT token creation and validation
- **Backup Codes**: Generation and format validation
- **Email Validation**: Approved email enforcement
- **Concurrent Operations**: Multi-user MFA setup

**Key Test Cases:**
- `test_otp_request_and_verification_flow` - Complete OTP workflow
- `test_mfa_setup_with_partial_token` - MFA setup process
- `test_mfa_enable_with_totp_code` - TOTP verification
- `test_complete_auth_flow_with_mfa` - End-to-end authentication
- `test_qr_code_url_format` - QR code URL validation
- `test_concurrent_mfa_setups` - Concurrent user operations

### 2. Security Tests (`security_tests.rs`)

Tests security vulnerabilities and attack prevention:

- **SQL Injection**: Protection against database attacks
- **XSS Prevention**: Input sanitization and output encoding
- **JWT Security**: Token manipulation detection
- **Timing Attacks**: Consistent response times
- **Brute Force**: Rate limiting and protection
- **Session Security**: Fixation and hijacking prevention
- **CSRF Protection**: Cross-site request forgery prevention
- **Directory Traversal**: File system access protection

**Key Test Cases:**
- `test_sql_injection_in_email` - SQL injection prevention
- `test_xss_injection_attempts` - XSS attack prevention
- `test_jwt_token_manipulation` - JWT security validation
- `test_timing_attack_on_otp` - Timing attack prevention
- `test_brute_force_protection` - Rate limiting effectiveness
- `test_session_fixation_protection` - Session security

### 3. Test Utilities (`test_utils.rs`)

Shared utilities and helpers for all test suites:

- **TestContext**: Test environment setup and management
- **HTTP Client**: Request/response handling
- **Data Generation**: Test data creation
- **Performance Timing**: Response time measurement
- **Database Management**: Test data cleanup

## 🚀 Running Tests

### Prerequisites

1. **Redis**: Must be running on `localhost:6379`
   ```bash
   # Using Docker
   docker run -d -p 6379:6379 redis:alpine
   
   # Or using local Redis
   redis-server
   ```

2. **Rust**: Latest stable version
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

### Quick Start

```bash
# Run all tests with the automated script
./test-mfa-system.sh

# Run quick smoke tests only
./test-mfa-system.sh --quick

# Run specific test category
./test-mfa-system.sh --filter security

# Run with coverage report
./test-mfa-system.sh --coverage
```

### Manual Test Execution

```bash
cd services/api-gateway

# Run all MFA tests
cargo test --test mfa_auth_tests

# Run security tests
cargo test --test security_tests

# Run specific test
cargo test --test mfa_auth_tests test_otp_request_and_verification_flow

# Run with output
cargo test --test mfa_auth_tests -- --nocapture

# Run in parallel
cargo test --test mfa_auth_tests -- --test-threads 4
```

### Custom Test Runner

```bash
cd services/api-gateway

# Use the custom test runner
cargo run --bin run_mfa_tests

# With filters
cargo run --bin run_mfa_tests -- --filter security

# With parallel execution
cargo run --bin run_mfa_tests -- --parallel 4
```

## 🔧 Configuration

### Environment Variables

```bash
# Test environment
export RUST_ENV=test
export TEST_REDIS_URL="redis://localhost:6379/15"
export RUST_LOG=debug
export RUST_BACKTRACE=1

# MFA configuration
export MFA_REQUIRED=true
export MFA_ISSUER="EDT Test System"
export APPROVED_EMAILS="test@example.com,admin@test.com"
```

### Test Database

Tests use Redis database 15 to avoid conflicts with development data:
- **Production**: Database 0 (default)
- **Development**: Database 1  
- **Testing**: Database 15

The test database is automatically flushed before and after test runs.

## 📊 Test Coverage

Generate and view coverage reports:

```bash
# Install coverage tool
cargo install cargo-tarpaulin

# Generate HTML coverage report
./test-mfa-system.sh --coverage

# View report (opens in browser)
open test-results/coverage/tarpaulin-report.html
```

Coverage targets:
- **Overall**: > 80%
- **Authentication**: > 90%
- **Security**: > 95%

## 🔍 Test Data and Fixtures

### Approved Test Emails

```rust
vec![
    "test@example.com",
    "admin@test.com", 
    "user1@example.com",
    "user2@example.com",
]
```

### Test TOTP Secrets

Tests use deterministic TOTP generation for reproducibility:

```rust
fn generate_test_totp(secret: &str) -> String {
    // Simplified TOTP for testing
    // In production, use proper TOTP library
}
```

### Mock Data Generation

```rust
// Valid emails
TestDataGenerator::valid_emails(5)

// Invalid emails  
TestDataGenerator::invalid_emails()

// Malicious inputs
TestDataGenerator::malicious_inputs()
```

## 🚨 Common Issues and Troubleshooting

### Redis Connection Issues

```bash
# Check Redis is running
redis-cli ping
# Expected: PONG

# Check Redis logs
redis-cli monitor

# Clear test database
redis-cli -n 15 FLUSHDB
```

### Test Failures

```bash
# Run with verbose output
cargo test --test mfa_auth_tests -- --nocapture

# Run single test with backtrace
RUST_BACKTRACE=full cargo test test_name

# Check test logs
tail -f services/api-gateway/gateway.log
```

### Performance Issues

```bash
# Run tests serially
cargo test -- --test-threads 1

# Check system resources
top
free -h
```

## 🔐 Security Testing

### Security Test Categories

1. **Input Validation**
   - SQL injection attempts
   - XSS payload injection
   - Command injection
   - Path traversal

2. **Authentication Security**
   - JWT token manipulation
   - Session fixation
   - Brute force attacks
   - Timing attacks

3. **Authorization**
   - Privilege escalation
   - CSRF attacks
   - Unauthorized access

### Security Audit

```bash
# Install security audit tool
cargo install cargo-audit

# Run security audit
cargo audit

# Check for vulnerabilities
cargo audit --json
```

## 📝 Adding New Tests

### Test Structure

```rust
#[tokio::test]
async fn test_new_functionality() {
    let mut ctx = TestContext::new().await;
    
    // Setup test data
    let test_email = "test@example.com";
    
    // Execute test
    let (status, response) = ctx.make_request(
        "POST",
        "/api/endpoint",
        Some(json!({"data": "test"})),
        None
    ).await;
    
    // Assertions
    assert_eq!(status, StatusCode::OK);
    assert_eq!(response["success"], true);
    
    // Cleanup
    ctx.cleanup().await;
}
```

### Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Assertions**: Use descriptive assertion messages
4. **Documentation**: Document complex test scenarios
5. **Performance**: Avoid unnecessary delays

### Test Naming

- `test_` prefix for all tests
- Descriptive names explaining what is tested
- Group related tests with common prefixes

Examples:
- `test_otp_request_success`
- `test_otp_request_invalid_email`
- `test_mfa_setup_with_valid_token`
- `test_security_sql_injection_prevention`

## 🤝 Contributing

### Adding Tests

1. Create tests in appropriate module
2. Follow existing patterns and naming
3. Include both positive and negative test cases
4. Add security tests for new endpoints
5. Update documentation

### Test Review Checklist

- [ ] Tests are independent and isolated
- [ ] Test data is properly cleaned up
- [ ] Security implications are tested
- [ ] Performance impact is considered
- [ ] Documentation is updated
- [ ] CI pipeline passes

## 📚 Related Documentation

- [EDT Architecture](../../docs/ARCHITECTURE.md)
- [Security Guidelines](../../docs/SECURITY.md)
- [API Documentation](../../docs/openapi.yaml)
- [Deployment Guide](../../docs/DEPLOYMENT.md)

## 🎯 Test Metrics

Current test metrics:
- **Total Tests**: ~25 comprehensive tests
- **Test Categories**: 3 (MFA, Security, Performance)
- **Coverage Target**: 80%+ overall, 90%+ auth code
- **Performance**: < 100ms per test
- **Security Tests**: 8 vulnerability categories

## 📞 Support

For test-related issues:
1. Check this README first
2. Review test logs and error messages
3. Ensure all prerequisites are met
4. Check Redis connection and database state
5. Run tests with verbose output for debugging