# API Gateway Test Suite

This directory contains comprehensive tests for the Rust API Gateway service.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── auth_tests.rs       # Authentication handler tests
│   ├── self_awareness_tests.rs  # Self-awareness handler tests
│   ├── graph_tests.rs      # Neo4j graph operations tests
│   ├── middleware_tests.rs # Middleware tests
│   └── storage_tests.rs   # Storage layer tests
├── integration/            # Integration tests for full workflows
│   ├── auth_flow_tests.rs  # Complete authentication flow tests
│   ├── api_integration_tests.rs  # API endpoint integration tests
│   └── neo4j_integration_tests.rs  # Neo4j integration tests
├── fixtures/               # Test fixtures and mocks
│   └── mod.rs             # Test data builders and mock implementations
└── lib.rs                 # Main test module
```

## Prerequisites

### 1. PostgreSQL Test Database

Create a test database:
```bash
createdb edt_test
```

### 2. Redis Test Instance

Ensure Redis is running:
```bash
redis-server
```

### 3. Neo4j Test Instance

Start Neo4j with Docker:
```bash
docker run -d \
  --name neo4j-test \
  -p 7687:7687 \
  -p 7474:7474 \
  -e NEO4J_AUTH=neo4j/${NEO4J_PASSWORD} \
  neo4j:5
```

### 4. Environment Variables

Create a `.env.test` file:
```env
TEST_DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@localhost/edt_test
TEST_NEO4J_URI=bolt://localhost:7687
TEST_NEO4J_USER=neo4j
TEST_NEO4J_PASSWORD=${NEO4J_PASSWORD}
TEST_NEO4J_DATABASE=neo4j
```

## Running Tests

### Run All Tests
```bash
cargo test
```

### Run Unit Tests Only
```bash
cargo test --test unit
```

### Run Integration Tests Only
```bash
cargo test --test integration
```

### Run Specific Test Module
```bash
cargo test auth_tests
```

### Run with Output
```bash
cargo test -- --nocapture
```

### Run Tests in Parallel
```bash
cargo test -- --test-threads=4
```

### Run Tests Serially (for database tests)
```bash
cargo test -- --test-threads=1
```

## Test Coverage

### Generate Coverage Report
```bash
# Install tarpaulin
cargo install cargo-tarpaulin

# Generate coverage
cargo tarpaulin --out Html --output-dir ./coverage
```

### View Coverage
Open `coverage/tarpaulin-report.html` in your browser.

## Writing Tests

### Unit Test Example
```rust
#[tokio::test]
async fn test_create_user() {
    let mut storage = setup_test_storage().await;
    
    let user_id = storage.create_user("test@example.com", "Test User")
        .await
        .expect("Failed to create user");
    
    assert!(user_id > 0);
}
```

### Integration Test Example
```rust
#[actix_web::test]
async fn test_complete_auth_flow() {
    let server = setup_test_app().await;
    let client = server.client();
    
    // Request OTP
    let response = client
        .post("/auth/request-otp")
        .send_json(&json!({ "email": "test@example.com" }))
        .await
        .expect("Failed to send request");
    
    assert_eq!(response.status(), StatusCode::OK);
}
```

### Using Test Fixtures
```rust
use crate::fixtures::TestFixtures;

#[tokio::test]
async fn test_with_fixtures() {
    let storage = setup_test_storage().await;
    let user_ids = TestFixtures::create_test_users(&mut storage).await;
    
    // Test with pre-created users
    assert_eq!(user_ids.len(), 4);
}
```

## Test Database Migrations

Migrations are automatically run when creating test connections. To manually run migrations:

```bash
sqlx migrate run --database-url $TEST_DATABASE_URL
```

## Debugging Tests

### Enable Debug Logging
```bash
RUST_LOG=debug cargo test
```

### Run Single Test with Backtrace
```bash
RUST_BACKTRACE=1 cargo test test_name -- --exact
```

### Use Test Context
Tests can use the `test-context` crate for setup/teardown:

```rust
use test_context::{test_context, TestContext};

struct DatabaseContext {
    storage: Storage,
}

#[async_trait]
impl TestContext for DatabaseContext {
    async fn setup() -> Self {
        let storage = setup_test_storage().await;
        Self { storage }
    }
    
    async fn teardown(self) {
        cleanup_test_data(&self.storage).await;
    }
}

#[test_context(DatabaseContext)]
#[tokio::test]
async fn test_with_context(ctx: &DatabaseContext) {
    // Use ctx.storage
}
```

## Performance Testing

For load testing, use the included benchmarks:

```bash
cargo bench
```

## Continuous Integration

Tests are automatically run in CI. The pipeline:
1. Sets up test databases
2. Runs all tests
3. Generates coverage report
4. Fails if coverage drops below 80%

## Common Issues

### Database Connection Errors
- Ensure PostgreSQL is running
- Check TEST_DATABASE_URL is correct
- Verify user has CREATE DATABASE permissions

### Neo4j Connection Errors
- Ensure Neo4j is running on port 7687
- Check authentication credentials
- Verify Neo4j version compatibility (5.x required)

### Test Isolation Issues
- Use unique identifiers for test data
- Clean up after each test
- Consider using transactions for rollback

### Flaky Tests
- Use serial execution for database-dependent tests
- Add retry logic for network operations
- Ensure proper test data cleanup

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Cleanup**: Always clean up test data
3. **Descriptive Names**: Use clear, descriptive test names
4. **Assertions**: Use specific assertions with good error messages
5. **Mocking**: Mock external services appropriately
6. **Coverage**: Aim for at least 80% code coverage
7. **Performance**: Keep individual tests under 1 second
8. **Documentation**: Document complex test scenarios

## Contributing

When adding new features:
1. Write unit tests for new functions
2. Add integration tests for new endpoints
3. Update test fixtures if needed
4. Ensure all tests pass locally
5. Update this README if test structure changes