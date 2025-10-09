// Main test module that includes all test suites

#[cfg(test)]
mod fixtures;

#[cfg(test)]
mod unit;

#[cfg(test)]
mod integration;

// Re-export commonly used test utilities
#[cfg(test)]
pub use fixtures::{mocks, TestFixtures};
