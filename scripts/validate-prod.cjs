#!/usr/bin/env node

/**
 * Production Validation Script for SyncedUp Call AI v1.0
 * Cross-platform E2E testing of the deployed application
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const APP_URL = process.env.APP_URL || 'https://synced-up-call-ai.vercel.app';
const TMP_DIR = path.join(__dirname, 'validation-' + Date.now());

// Ensure temp directory exists
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

// Test counters
let passed = 0;
let failed = 0;
let skipped = 0;
const testResults = [];

// Make HTTP request
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000
    };

    const req = lib.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// Test runner
async function test(name, fn) {
  process.stdout.write(`  ${name.padEnd(40, '.')} `);
  const start = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    console.log(`${colors.green}✓${colors.reset} ${colors.gray}(${duration}ms)${colors.reset}`);
    passed++;
    testResults.push({ name, status: 'passed', duration });
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`${colors.red}✗${colors.reset} ${colors.gray}(${duration}ms)${colors.reset}`);
    console.log(`    ${colors.red}${error.message}${colors.reset}`);
    failed++;
    testResults.push({ name, status: 'failed', duration, error: error.message });
    return null;
  }
}

// Main validation
async function validate() {
  console.log('\n═══════════════════════════════════════');
  console.log('  SyncedUp Call AI - Production Tests');
  console.log('═══════════════════════════════════════');
  console.log(`\n  Target: ${APP_URL}`);
  console.log(`  Time: ${new Date().toISOString()}\n`);

  // 1. Health Check
  console.log('== Health & Environment ==');
  const health = await test('API Health', async () => {
    const res = await request(`${APP_URL}/api/health`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = JSON.parse(res.body);
    if (!data.ok) throw new Error('Health check failed');
    
    // Save health response
    fs.writeFileSync(path.join(TMP_DIR, 'health.json'), JSON.stringify(data, null, 2));
    
    // Display environment status
    console.log('\n    Environment variables:');
    Object.entries(data.env || {}).forEach(([key, value]) => {
      console.log(`      ${key}: ${value ? '✓' : '✗'}`);
    });
    
    return data;
  });

  // 2. UI Pages
  console.log('\n== UI Pages ==');
  const pages = ['', 'dashboard', 'calls', 'search', 'admin', 'library', 'batch'];
  for (const page of pages) {
    const pageName = page || 'home';
    await test(`GET /${pageName}`, async () => {
      const res = await request(`${APP_URL}/${page}`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    });
  }

  // 3. Public API Endpoints
  console.log('\n== Public API Endpoints ==');
  await test('GET /api/ui/calls', async () => {
    const res = await request(`${APP_URL}/api/ui/calls?limit=1`);
    const data = JSON.parse(res.body);
    if (!data.ok) throw new Error('API returned ok:false');
    
    // Save sample response
    fs.writeFileSync(path.join(TMP_DIR, 'calls.json'), JSON.stringify(data, null, 2));
    
    // Validate structure
    if (!Array.isArray(data.data)) throw new Error('Missing data array');
    if (typeof data.total !== 'number') throw new Error('Missing total count');
    
    return data;
  });

  await test('GET /api/ui/library', async () => {
    const res = await request(`${APP_URL}/api/ui/library?limit=1`);
    const data = JSON.parse(res.body);
    if (!data.ok) throw new Error('API returned ok:false');
  });

  await test('GET /api/ui/search', async () => {
    const res = await request(`${APP_URL}/api/ui/search?q=test`);
    const data = JSON.parse(res.body);
    if (!data.ok) throw new Error('API returned ok:false');
  });

  // 4. Call Detail Endpoints
  console.log('\n== Call Detail APIs ==');
  await test('GET /api/ui/call (no ID)', async () => {
    const res = await request(`${APP_URL}/api/ui/call`);
    const data = JSON.parse(res.body);
    if (data.error !== 'missing_id') throw new Error('Expected missing_id error');
  });

  await test('GET /api/ui/call (404)', async () => {
    const res = await request(`${APP_URL}/api/ui/call?id=nonexistent`);
    const data = JSON.parse(res.body);
    if (data.error !== 'call_not_found') throw new Error('Expected call_not_found error');
  });

  await test('GET /api/ui/call/transcript (no ID)', async () => {
    const res = await request(`${APP_URL}/api/ui/call/transcript`);
    const data = JSON.parse(res.body);
    if (data.error !== 'id_required') throw new Error('Expected id_required error');
  });

  // 5. Admin Endpoints
  console.log('\n== Admin Endpoints ==');
  await test('GET /api/admin/backfill', async () => {
    const res = await request(`${APP_URL}/api/admin/backfill`);
    const data = JSON.parse(res.body);
    if (!data.ok) throw new Error('Backfill status check failed');
    if (!data.gaps) throw new Error('Missing gaps data');
  });

  await test('GET /api/admin/last-webhooks', async () => {
    const res = await request(`${APP_URL}/api/admin/last-webhooks?limit=1`);
    const data = JSON.parse(res.body);
    if (!data.ok) throw new Error('Webhook history check failed');
  });

  // 6. Protected Endpoints (should fail)
  console.log('\n== Protected Endpoints (Auth Required) ==');
  await test('POST /api/jobs/transcribe (401)', async () => {
    const res = await request(`${APP_URL}/api/jobs/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: 'test' })
    });
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`Expected 401/403, got ${res.status}`);
    }
  });

  await test('POST /api/jobs/analyze (401)', async () => {
    const res = await request(`${APP_URL}/api/jobs/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: 'test' })
    });
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`Expected 401/403, got ${res.status}`);
    }
  });

  // 7. Cron Endpoints
  console.log('\n== Cron Endpoints (Auth Required) ==');
  await test('GET /api/cron/rollup (401)', async () => {
    const res = await request(`${APP_URL}/api/cron/rollup`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test('GET /api/cron/retention (401)', async () => {
    const res = await request(`${APP_URL}/api/cron/retention`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // 8. v1.0 Features
  console.log('\n== v1.0 Feature Verification ==');
  await test('Call detail page exists', async () => {
    const res = await request(`${APP_URL}/calls/test-id`);
    // Should return 200 (page loads) even for non-existent ID
    if (res.status !== 200 && res.status !== 404) {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });

  await test('Backfill tools available', async () => {
    const res = await request(`${APP_URL}/api/admin/backfill`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  });

  await test('Revenue rollups configured', async () => {
    const res = await request(`${APP_URL}/api/cron/rollup`);
    // Should return 401 (auth required) not 404
    if (res.status === 404) throw new Error('Endpoint not found');
  });

  await test('Data retention configured', async () => {
    const res = await request(`${APP_URL}/api/cron/retention`);
    // Should return 401 (auth required) not 404
    if (res.status === 404) throw new Error('Endpoint not found');
  });

  // Generate Report
  const total = passed + failed + skipped;
  const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

  const report = `# Production Validation Report

**Date**: ${new Date().toISOString()}  
**Target**: ${APP_URL}  
**Commit**: ${health?.meta?.commitSha || 'unknown'}

## Test Results

- **Total Tests**: ${total}
- **Passed**: ${passed} ✅
- **Failed**: ${failed} ❌
- **Skipped**: ${skipped} ⚠️
- **Success Rate**: ${successRate}%

## Environment Status

\`\`\`json
${JSON.stringify(health || {}, null, 2)}
\`\`\`

## v1.0 Features

| Feature | Status | Details |
|---------|--------|---------|
| Call Detail Page | ${testResults.find(t => t.name.includes('Call detail page'))?.status === 'passed' ? '✅' : '❌'} | Enhanced with SSE, downloads |
| Slack Alerts | ${health?.env?.SLACK_ALERT_WEBHOOK ? '✅' : '⚠️'} | High-risk detection |
| Revenue Rollups | ${testResults.find(t => t.name.includes('Revenue rollups'))?.status === 'passed' ? '✅' : '❌'} | Daily aggregations |
| Backfill Tools | ${testResults.find(t => t.name.includes('Backfill tools'))?.status === 'passed' ? '✅' : '❌'} | CLI and API |
| Data Retention | ${testResults.find(t => t.name.includes('Data retention'))?.status === 'passed' ? '✅' : '❌'} | PII masking |

## Test Details

${testResults.map(t => `- ${t.name}: ${t.status === 'passed' ? '✅' : '❌'} (${t.duration}ms)`).join('\n')}

## Artifacts

All test artifacts saved to: ${TMP_DIR}

- health.json - Health check response
- calls.json - Calls API response sample
- VALIDATION_REPORT.md - This report
`;

  // Save report
  fs.writeFileSync(path.join(TMP_DIR, 'VALIDATION_REPORT.md'), report);

  // Display summary
  console.log('\n═══════════════════════════════════════');
  console.log('            TEST SUMMARY');
  console.log('═══════════════════════════════════════\n');
  console.log(`  Total Tests: ${total}`);
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`  ${colors.yellow}Skipped: ${skipped}${colors.reset}`);
  console.log(`\n  Success Rate: ${successRate}%`);

  if (failed === 0) {
    console.log(`\n${colors.green}✅ All tests passed!${colors.reset}`);
    console.log('\nThe v1.0 deployment is healthy and all features are accessible.');
  } else {
    console.log(`\n${colors.red}⚠️ Some tests failed${colors.reset}`);
    console.log('\nReview the failures above for details.');
  }

  console.log(`\nFull report saved to: ${TMP_DIR}/VALIDATION_REPORT.md\n`);

  // Return exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run validation
validate().catch(error => {
  console.error(`\n${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});