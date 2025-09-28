#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('Starting test runner...');

const testProcess = spawn('npx', ['ng', 'test', '--karma-config=karma-ci.conf.js'], {
  stdio: 'inherit',
  shell: true
});

// Set a timeout to kill the process if it hangs
const timeout = setTimeout(() => {
  console.log('\nTest timeout reached, killing process...');
  testProcess.kill('SIGTERM');
  process.exit(1);
}, 30000); // 30 second timeout

testProcess.on('exit', (code) => {
  clearTimeout(timeout);
  console.log(`\nTests exited with code: ${code}`);
  process.exit(code || 0);
});

testProcess.on('error', (err) => {
  clearTimeout(timeout);
  console.error('Test process error:', err);
  process.exit(1);
});