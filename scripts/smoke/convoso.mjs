#!/usr/bin/env node

/**
 * Smoke test for Convoso integration endpoints
 * Tests both ingest and agent-grouped calls APIs
 */

import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const JOBS_SECRET = process.env.JOBS_SECRET;

if (!JOBS_SECRET) {
  console.error('Error: JOBS_SECRET environment variable is required');
  console.error('Set it: export JOBS_SECRET=your-secret-here');
  process.exit(1);
}

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(name, method, url, options = {}) {
  log(`\nTesting: ${name}`, 'blue');
  log(`${method} ${url}`, 'gray');

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const duration = Date.now() - startTime;
    const body = await response.text();

    let data;
    try {
      data = JSON.parse(body);
    } catch (e) {
      data = { raw: body };
    }

    if (response.ok && data.ok) {
      log(`✓ Success (${response.status}) - ${duration}ms`, 'green');
      return { success: true, data, duration };
    } else {
      log(`✗ Failed (${response.status})`, 'red');
      console.error('Response:', data);
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    log(`✗ Error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function runTests() {
  log('='.repeat(60), 'blue');
  log('Convoso Integration Smoke Tests', 'blue');
  log('='.repeat(60), 'blue');
  log(`\nApp URL: ${APP_URL}`, 'gray');
  log(`Jobs Secret: ${JOBS_SECRET.substring(0, 10)}...`, 'gray');

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  // Test 1: Check ingest endpoint health
  {
    const result = await testEndpoint(
      'Ingest Health Check',
      'GET',
      `${APP_URL}/api/integrations/convoso/ingest`
    );

    results.total++;
    if (result.success) {
      results.passed++;
      log(`  Circuit State: ${result.data.circuit?.state || 'unknown'}`, 'gray');
      log(`  Has Auth Token: ${result.data.env?.hasAuthToken || false}`, 'gray');
    } else {
      results.failed++;
    }
  }

  // Test 2: Ingest with invalid auth (should fail)
  {
    const result = await testEndpoint(
      'Ingest with Invalid Auth (should fail)',
      'POST',
      `${APP_URL}/api/integrations/convoso/ingest`,
      {
        headers: {
          'x-jobs-secret': 'invalid-secret'
        },
        body: JSON.stringify({ pages: 1, perPage: 1 })
      }
    );

    results.total++;
    if (!result.success && result.status === 401) {
      results.passed++;
      log('  ✓ Correctly rejected unauthorized request', 'green');
    } else {
      results.failed++;
      log('  ✗ Should have returned 401', 'red');
    }
  }

  // Test 3: Ingest single page with valid auth
  {
    const result = await testEndpoint(
      'Ingest Single Page',
      'POST',
      `${APP_URL}/api/integrations/convoso/ingest`,
      {
        headers: {
          'x-jobs-secret': JOBS_SECRET
        },
        body: JSON.stringify({
          pages: 1,
          perPage: 50,
          from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
          to: new Date().toISOString()
        })
      }
    );

    results.total++;
    if (result.success) {
      results.passed++;
      log(`  Scanned: ${result.data.scanned || 0} calls`, 'gray');
      log(`  Inserted: ${result.data.inserted || 0}`, 'gray');
      log(`  Updated: ${result.data.updated || 0}`, 'gray');
      log(`  Failed: ${result.data.failed || 0}`, 'gray');
      log(`  Duration: ${result.data.duration_ms || 0}ms`, 'gray');
    } else {
      results.failed++;
    }
  }

  // Test 4: Get agent-grouped calls
  {
    const result = await testEndpoint(
      'Get Agent-Grouped Calls',
      'GET',
      `${APP_URL}/api/ui/agents/calls?limit=5&offset=0`
    );

    results.total++;
    if (result.success) {
      results.passed++;
      log(`  Total Agents: ${result.data.summary?.totalAgents || 0}`, 'gray');
      log(`  Total Calls: ${result.data.summary?.totalCalls || 0}`, 'gray');
      log(`  Rows Returned: ${result.data.rows?.length || 0}`, 'gray');

      // Validate response structure
      if (result.data.rows && result.data.rows.length > 0) {
        const row = result.data.rows[0];
        const hasRequiredFields =
          'agent' in row &&
          'calls' in row &&
          'avgDurationSec' in row &&
          'completedRate' in row;

        if (hasRequiredFields) {
          log('  ✓ Response structure valid', 'green');
        } else {
          log('  ✗ Missing required fields in response', 'yellow');
        }
      }
    } else {
      results.failed++;
    }
  }

  // Test 5: Get agent calls with date filter
  {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();

    const result = await testEndpoint(
      'Get Agent Calls with Date Filter',
      'GET',
      `${APP_URL}/api/ui/agents/calls?from=${from}&to=${to}&limit=10&offset=0`
    );

    results.total++;
    if (result.success) {
      results.passed++;
      log(`  Filtered Results: ${result.data.total || 0}`, 'gray');
    } else {
      results.failed++;
    }
  }

  // Summary
  log('\n' + '='.repeat(60), 'blue');
  log('Test Summary', 'blue');
  log('='.repeat(60), 'blue');

  const passRate = results.total > 0
    ? Math.round((results.passed / results.total) * 100)
    : 0;

  log(`Total Tests: ${results.total}`, 'gray');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'gray');
  log(`Pass Rate: ${passRate}%`, passRate === 100 ? 'green' : 'yellow');

  // Write results to file
  const resultsPath = join(__dirname, 'test-results.json');
  await fs.writeFile(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    app_url: APP_URL,
    results,
    pass_rate: passRate
  }, null, 2));

  log(`\nResults saved to: ${resultsPath}`, 'gray');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\nFatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});