//! Test runner for MFA authentication system
//! 
//! Usage:
//!   cargo run --bin run_mfa_tests
//!   cargo run --bin run_mfa_tests -- --filter security
//!   cargo run --bin run_mfa_tests -- --parallel 4

use std::process::{Command, Stdio};
use std::env;
use std::io::{self, Write};

#[derive(Debug)]
struct TestSuite {
    name: String,
    description: String,
    module: String,
    tests: Vec<TestCase>,
}

#[derive(Debug)]
struct TestCase {
    name: String,
    description: String,
}

fn main() {
    println!("🧪 EDT MFA Authentication Test Suite Runner");
    println!("==========================================\n");
    
    let args: Vec<String> = env::args().collect();
    let filter = get_filter(&args);
    let parallel = get_parallel_count(&args);
    
    // Initialize test environment
    setup_test_environment();
    
    // Define all test suites
    let test_suites = define_test_suites();
    
    // Filter test suites if requested
    let filtered_suites = if let Some(filter) = &filter {
        test_suites.into_iter()
            .filter(|suite| suite.name.contains(filter) || suite.module.contains(filter))
            .collect()
    } else {
        test_suites
    };
    
    if filtered_suites.is_empty() {
        println!("❌ No test suites found matching filter: {:?}", filter);
        return;
    }
    
    println!("🎯 Running {} test suite(s):", filtered_suites.len());
    for suite in &filtered_suites {
        println!("   • {} - {}", suite.name, suite.description);
    }
    println!();
    
    // Run all test suites
    let mut total_passed = 0;
    let mut total_failed = 0;
    let mut failed_tests = Vec::new();
    
    for suite in &filtered_suites {
        println!("🔍 Running test suite: {}", suite.name);
        println!("   {}", suite.description);
        
        let (passed, failed, suite_failures) = run_test_suite(suite, parallel);
        total_passed += passed;
        total_failed += failed;
        failed_tests.extend(suite_failures);
        
        if failed > 0 {
            println!("   ❌ {} failed, {} passed\n", failed, passed);
        } else {
            println!("   ✅ All {} tests passed\n", passed);
        }
    }
    
    // Final summary
    println!("📊 Test Results Summary");
    println!("======================");
    println!("✅ Passed: {}", total_passed);
    println!("❌ Failed: {}", total_failed);
    println!("📈 Success Rate: {:.1}%", 
        (total_passed as f64 / (total_passed + total_failed) as f64) * 100.0);
    
    if !failed_tests.is_empty() {
        println!("\n💥 Failed Tests:");
        for test in &failed_tests {
            println!("   • {}", test);
        }
    }
    
    // Cleanup
    cleanup_test_environment();
    
    // Exit with appropriate code
    if total_failed > 0 {
        std::process::exit(1);
    } else {
        println!("\n🎉 All tests passed successfully!");
    }
}

fn get_filter(args: &[String]) -> Option<String> {
    for i in 0..args.len() - 1 {
        if args[i] == "--filter" {
            return Some(args[i + 1].clone());
        }
    }
    None
}

fn get_parallel_count(args: &[String]) -> usize {
    for i in 0..args.len() - 1 {
        if args[i] == "--parallel" {
            return args[i + 1].parse().unwrap_or(1);
        }
    }
    1
}

fn setup_test_environment() {
    println!("🔧 Setting up test environment...");
    
    // Set test environment variables
    env::set_var("RUST_ENV", "test");
    env::set_var("TEST_REDIS_URL", "redis://localhost:6379/15");
    env::set_var("RUST_LOG", "debug");
    
    // Check Redis connection
    if !check_redis_connection() {
        println!("❌ Redis connection failed. Please ensure Redis is running on localhost:6379");
        std::process::exit(1);
    }
    
    // Clear test database
    clear_test_database();
    
    println!("✅ Test environment ready\n");
}

fn check_redis_connection() -> bool {
    match std::process::Command::new("redis-cli")
        .args(&["-p", "6379", "ping"])
        .output()
    {
        Ok(output) => {
            String::from_utf8_lossy(&output.stdout).trim() == "PONG"
        },
        Err(_) => false,
    }
}

fn clear_test_database() {
    let _ = std::process::Command::new("redis-cli")
        .args(&["-p", "6379", "-n", "15", "FLUSHDB"])
        .output();
}

fn cleanup_test_environment() {
    println!("🧹 Cleaning up test environment...");
    clear_test_database();
    println!("✅ Cleanup complete");
}

fn define_test_suites() -> Vec<TestSuite> {
    vec![
        TestSuite {
            name: "MFA Authentication".to_string(),
            description: "Core MFA functionality including OTP, TOTP, and QR codes".to_string(),
            module: "mfa_auth_tests".to_string(),
            tests: vec![
                TestCase {
                    name: "test_otp_request_and_verification_flow".to_string(),
                    description: "Complete OTP request and verification workflow".to_string(),
                },
                TestCase {
                    name: "test_otp_request_unapproved_email".to_string(),
                    description: "Reject OTP requests from unapproved email addresses".to_string(),
                },
                TestCase {
                    name: "test_mfa_setup_with_partial_token".to_string(),
                    description: "MFA setup process with valid partial authentication token".to_string(),
                },
                TestCase {
                    name: "test_mfa_enable_with_totp_code".to_string(),
                    description: "Enable MFA using TOTP verification code".to_string(),
                },
                TestCase {
                    name: "test_complete_auth_flow_with_mfa".to_string(),
                    description: "End-to-end authentication with MFA enabled".to_string(),
                },
                TestCase {
                    name: "test_qr_code_url_format".to_string(),
                    description: "Validate QR code URL format and parameters".to_string(),
                },
                TestCase {
                    name: "test_concurrent_mfa_setups".to_string(),
                    description: "Multiple users setting up MFA simultaneously".to_string(),
                },
                TestCase {
                    name: "test_backup_codes_functionality".to_string(),
                    description: "Backup code generation and validation".to_string(),
                },
            ],
        },
        TestSuite {
            name: "Security".to_string(),
            description: "Security vulnerability testing and attack prevention".to_string(),
            module: "security_tests".to_string(),
            tests: vec![
                TestCase {
                    name: "test_sql_injection_in_email".to_string(),
                    description: "Prevent SQL injection attacks via email parameter".to_string(),
                },
                TestCase {
                    name: "test_xss_injection_attempts".to_string(),
                    description: "Prevent XSS attacks in input fields".to_string(),
                },
                TestCase {
                    name: "test_jwt_token_manipulation".to_string(),
                    description: "Detect and reject manipulated JWT tokens".to_string(),
                },
                TestCase {
                    name: "test_timing_attack_on_otp".to_string(),
                    description: "Prevent timing attacks on OTP verification".to_string(),
                },
                TestCase {
                    name: "test_brute_force_protection".to_string(),
                    description: "Rate limiting and brute force attack protection".to_string(),
                },
                TestCase {
                    name: "test_session_fixation_protection".to_string(),
                    description: "Prevent session fixation attacks".to_string(),
                },
                TestCase {
                    name: "test_csrf_protection".to_string(),
                    description: "Cross-Site Request Forgery protection".to_string(),
                },
                TestCase {
                    name: "test_directory_traversal_protection".to_string(),
                    description: "Prevent directory traversal in static file serving".to_string(),
                },
            ],
        },
        TestSuite {
            name: "Performance".to_string(),
            description: "Performance and load testing".to_string(),
            module: "performance_tests".to_string(),
            tests: vec![
                TestCase {
                    name: "test_high_concurrency_otp_requests".to_string(),
                    description: "Handle high volume of concurrent OTP requests".to_string(),
                },
                TestCase {
                    name: "test_mfa_setup_performance".to_string(),
                    description: "MFA setup response time benchmarks".to_string(),
                },
                TestCase {
                    name: "test_token_validation_performance".to_string(),
                    description: "JWT token validation performance".to_string(),
                },
            ],
        },
    ]
}

fn run_test_suite(suite: &TestSuite, parallel: usize) -> (usize, usize, Vec<String>) {
    let mut cmd = Command::new("cargo");
    cmd.args(&["test", "--test", &suite.module]);
    
    if parallel > 1 {
        cmd.args(&["--", "--test-threads", &parallel.to_string()]);
    }
    
    cmd.stdout(Stdio::piped())
       .stderr(Stdio::piped());
    
    match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // Parse test results
            let (passed, failed, failures) = parse_test_output(&stdout, &stderr);
            
            // Show detailed output if there were failures
            if failed > 0 {
                println!("   📋 Test Output:");
                for line in stdout.lines() {
                    if line.contains("FAILED") || line.contains("ERROR") {
                        println!("      {}", line);
                    }
                }
                
                if !stderr.is_empty() {
                    println!("   🚨 Error Output:");
                    for line in stderr.lines().take(10) { // Limit error output
                        println!("      {}", line);
                    }
                }
            }
            
            (passed, failed, failures)
        },
        Err(e) => {
            println!("   ❌ Failed to run test suite: {}", e);
            (0, suite.tests.len(), suite.tests.iter().map(|t| t.name.clone()).collect())
        }
    }
}

fn parse_test_output(stdout: &str, stderr: &str) -> (usize, usize, Vec<String>) {
    let mut passed = 0;
    let mut failed = 0;
    let mut failures = Vec::new();
    
    // Parse stdout for test results
    for line in stdout.lines() {
        if line.contains("test result:") {
            // Format: "test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out"
            if let Some(results) = line.split("test result:").nth(1) {
                if let Some(passed_str) = extract_number(results, "passed") {
                    passed = passed_str;
                }
                if let Some(failed_str) = extract_number(results, "failed") {
                    failed = failed_str;
                }
            }
        } else if line.contains("FAILED") {
            // Extract failed test name
            if let Some(test_name) = line.split_whitespace().next() {
                failures.push(test_name.to_string());
            }
        }
    }
    
    // If we couldn't parse stdout, try stderr
    if passed == 0 && failed == 0 && !stderr.is_empty() {
        failed = 1; // Assume failure if we have stderr output
    }
    
    (passed, failed, failures)
}

fn extract_number(text: &str, keyword: &str) -> Option<usize> {
    text.split(keyword)
        .next()?
        .split_whitespace()
        .last()?
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_test_output() {
        let stdout = "test result: ok. 5 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out";
        let (passed, failed, _) = parse_test_output(stdout, "");
        assert_eq!(passed, 5);
        assert_eq!(failed, 2);
    }
    
    #[test]
    fn test_extract_number() {
        assert_eq!(extract_number("5 passed; 2 failed", "passed"), Some(5));
        assert_eq!(extract_number("5 passed; 2 failed", "failed"), Some(2));
        assert_eq!(extract_number("no numbers here", "passed"), None);
    }
}