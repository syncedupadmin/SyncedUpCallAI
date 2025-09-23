#!/usr/bin/env node

/**
 * Operations Testing Script
 *
 * Tests all operational monitoring endpoints and features
 * Usage: node test-operations.mjs
 */

import fetch from 'node-fetch';

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';
const TESTS_PASSED = [];
const TESTS_FAILED = [];

function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📝',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  }[type] || '📝';

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

async function testEndpoint(name, url, expectedStatus = 200) {
  try {
    log(`Testing ${name}...`);
    const response = await fetch(`${BASE_URL}${url}`);

    if (response.status !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
    }

    const data = await response.json();

    TESTS_PASSED.push(name);
    log(`${name} - Response received`, 'success');

    return { success: true, data };
  } catch (error) {
    TESTS_FAILED.push(name);
    log(`${name} - Failed: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function testHealthEndpoint() {
  const result = await testEndpoint('Health Check', '/api/health');

  if (result.success && result.data) {
    const { status, services, errors, resources } = result.data;

    log(`  System Status: ${status}`);
    log(`  Database: ${services?.database?.status || 'unknown'}`);
    log(`  Memory Usage: ${resources?.memory?.percent || 0}%`);
    log(`  Errors (1h): ${errors?.last_hour || 0}`);

    if (status === 'unhealthy') {
      log('System is unhealthy!', 'warning');
    }
  }

  return result;
}

async function testStatusEndpoint() {
  const result = await testEndpoint('Status Endpoint', '/api/status');

  if (result.success && result.data) {
    const { status, uptime, services, issues } = result.data;

    log(`  Overall Status: ${status}`);
    log(`  Uptime: ${uptime?.formatted || 'unknown'}`);
    log(`  Active Issues: ${issues?.length || 0}`);

    if (issues && issues.length > 0) {
      log('Active issues detected:', 'warning');
      issues.forEach(issue => {
        log(`    - ${issue.type}: ${issue.message}`, 'warning');
      });
    }

    if (services?.queues) {
      const { recordings, transcriptions } = services.queues;
      log(`  Recording Queue - Pending: ${recordings.pending}, Failed: ${recordings.failed}`);
      log(`  Transcription Queue - Pending: ${transcriptions.pending}`);
    }
  }

  return result;
}

async function testMetricsEndpoints() {
  const endpoints = [
    { name: 'System Metrics', path: '/api/metrics/system' },
    { name: 'Job Metrics', path: '/api/metrics/jobs' },
    { name: 'Error Metrics', path: '/api/metrics/errors' }
  ];

  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.path);

    if (result.success && result.data) {
      if (endpoint.path.includes('system')) {
        log(`  Process Uptime: ${result.data.process?.uptime || 0}s`);
        log(`  Memory: ${result.data.memory?.heap_used_mb || 0}MB / ${result.data.memory?.heap_total_mb || 0}MB`);
      } else if (endpoint.path.includes('jobs')) {
        log(`  Recording Queue Pending: ${result.data.recording_queue?.pending || 0}`);
        log(`  Transcription Success Rate: ${(result.data.transcription_queue?.success_rate || 0) * 100}%`);
      } else if (endpoint.path.includes('errors')) {
        log(`  Total Errors (24h): ${result.data.summary?.total_24h || 0}`);
        log(`  Critical Errors: ${result.data.summary?.critical || 0}`);
      }
    }
  }
}

async function testDatabaseConnection() {
  log('Testing database connectivity...');

  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();

    if (data.services?.database?.status === 'healthy') {
      TESTS_PASSED.push('Database Connection');
      log('Database connection healthy', 'success');
      log(`  Latency: ${data.services.database.latency}ms`);
      return true;
    } else {
      throw new Error('Database unhealthy');
    }
  } catch (error) {
    TESTS_FAILED.push('Database Connection');
    log('Database connection failed', 'error');
    return false;
  }
}

async function testOperationalDashboard() {
  log('Testing operational dashboard...');

  try {
    const response = await fetch(`${BASE_URL}/superadmin/operations`);

    if (response.status === 200) {
      TESTS_PASSED.push('Operations Dashboard');
      log('Operations dashboard accessible', 'success');
      return true;
    } else {
      throw new Error(`Dashboard returned status ${response.status}`);
    }
  } catch (error) {
    TESTS_FAILED.push('Operations Dashboard');
    log(`Operations dashboard failed: ${error.message}`, 'error');
    return false;
  }
}

async function performLoadTest() {
  log('Performing basic load test on health endpoint...');

  const concurrency = 10;
  const requests = 50;
  const startTime = Date.now();
  const results = [];

  for (let i = 0; i < requests; i += concurrency) {
    const batch = [];

    for (let j = 0; j < concurrency && i + j < requests; j++) {
      batch.push(
        fetch(`${BASE_URL}/api/health`)
          .then(res => ({ success: true, status: res.status }))
          .catch(err => ({ success: false, error: err.message }))
      );
    }

    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  const duration = Date.now() - startTime;
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const rps = (requests / (duration / 1000)).toFixed(2);

  log(`Load test completed:`);
  log(`  Total Requests: ${requests}`);
  log(`  Successful: ${successful}`);
  log(`  Failed: ${failed}`);
  log(`  Duration: ${duration}ms`);
  log(`  Requests/sec: ${rps}`);

  if (failed > requests * 0.05) {
    TESTS_FAILED.push('Load Test');
    log('Load test failed - too many errors', 'error');
  } else {
    TESTS_PASSED.push('Load Test');
    log('Load test passed', 'success');
  }
}

async function runAllTests() {
  console.log('\n🚀 Starting Operations Testing Suite\n');
  console.log(`Testing against: ${BASE_URL}\n`);

  // Test health endpoint
  await testHealthEndpoint();
  console.log('');

  // Test status endpoint
  await testStatusEndpoint();
  console.log('');

  // Test metrics endpoints
  await testMetricsEndpoints();
  console.log('');

  // Test database connection
  await testDatabaseConnection();
  console.log('');

  // Test operational dashboard
  await testOperationalDashboard();
  console.log('');

  // Perform load test
  await performLoadTest();
  console.log('');

  // Summary
  console.log('\n📊 Test Summary\n');
  console.log(`✅ Passed: ${TESTS_PASSED.length}`);
  TESTS_PASSED.forEach(test => console.log(`  - ${test}`));

  console.log(`\n❌ Failed: ${TESTS_FAILED.length}`);
  TESTS_FAILED.forEach(test => console.log(`  - ${test}`));

  console.log('\n' + (TESTS_FAILED.length === 0 ? '🎉 All tests passed!' : '⚠️  Some tests failed'));

  process.exit(TESTS_FAILED.length > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});