#!/usr/bin/env node

/**
 * Test Script for v1.1: Insights & Ops
 * Validates all new endpoints and features
 */

const https = require('https');
const http = require('http');

// Configuration
const APP_URL = process.env.APP_URL || 'https://synced-up-call-ai.vercel.app';
const JOBS_SECRET = process.env.JOBS_SECRET || '';

// Test counters
let passed = 0;
let failed = 0;

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
  process.stdout.write(`  ${name.padEnd(50, '.')} `);
  
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
    return true;
  } catch (error) {
    console.log(`❌ FAIL`);
    console.log(`    Error: ${error.message}`);
    failed++;
    return false;
  }
}

// Main test suite
async function runTests() {
  console.log('\n═══════════════════════════════════════');
  console.log('  v1.1 Insights & Ops - Test Suite');
  console.log('═══════════════════════════════════════');
  console.log(`\n  Target: ${APP_URL}`);
  console.log(`  Time: ${new Date().toISOString()}\n`);

  // 1. Test Rollups API
  console.log('== Rollups API ==');
  
  await test('GET /api/reports/rollups (default 30 days)', async () => {
    const res = await request(`${APP_URL}/api/reports/rollups`);
    const data = JSON.parse(res.body);
    
    if (!data.ok) throw new Error('Response missing ok:true');
    if (!Array.isArray(data.rows)) throw new Error('Response missing rows array');
    if (!data.totals) throw new Error('Response missing totals object');
    if (data.rows.length === 0) console.log('    Warning: No rollup data (expected in prod)');
    
    // Check row structure if data exists
    if (data.rows.length > 0) {
      const row = data.rows[0];
      if (!row.date) throw new Error('Row missing date field');
      if (typeof row.total_calls !== 'number') throw new Error('Row missing total_calls');
      if (typeof row.analyzed_calls !== 'number') throw new Error('Row missing analyzed_calls');
      if (typeof row.success_calls !== 'number') throw new Error('Row missing success_calls');
      if (row.revenue_cents === undefined) throw new Error('Row missing revenue_cents');
    }
  });

  await test('GET /api/reports/rollups?days=7', async () => {
    const res = await request(`${APP_URL}/api/reports/rollups?days=7`);
    const data = JSON.parse(res.body);
    
    if (!data.ok) throw new Error('Response missing ok:true');
    if (!Array.isArray(data.rows)) throw new Error('Response missing rows array');
    // In production, should have 7 rows (or less if no data)
    if (data.rows.length > 7) throw new Error(`Expected max 7 rows, got ${data.rows.length}`);
  });

  // 2. Test Cron Health API
  console.log('\n== Cron Health API ==');
  
  await test('GET /api/health/cron', async () => {
    const res = await request(`${APP_URL}/api/health/cron`);
    const data = JSON.parse(res.body);
    
    if (!data.ok) throw new Error('Response missing ok:true');
    if (!Array.isArray(data.jobs)) throw new Error('Response missing jobs array');
    if (typeof data.all_ok !== 'boolean') throw new Error('Response missing all_ok boolean');
    
    // Check job structure if exists
    if (data.jobs.length > 0) {
      const job = data.jobs[0];
      if (!job.name) throw new Error('Job missing name');
      if (!job.last_ok) throw new Error('Job missing last_ok');
      if (!job.status) throw new Error('Job missing status');
      if (typeof job.age_sec !== 'number') throw new Error('Job missing age_sec');
    }
  });

  // 3. Test Webhook Replay API (with auth)
  console.log('\n== Webhook Replay API ==');
  
  await test('POST /api/admin/replay (no auth)', async () => {
    const res = await request(`${APP_URL}/api/admin/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 0 })
    });
    
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  if (JOBS_SECRET) {
    await test('POST /api/admin/replay (with auth)', async () => {
      const res = await request(`${APP_URL}/api/admin/replay`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-jobs-secret': JOBS_SECRET
        },
        body: JSON.stringify({ limit: 0 })
      });
      
      const data = JSON.parse(res.body);
      if (!data.ok) throw new Error('Response missing ok:true');
      if (typeof data.enqueued !== 'number') throw new Error('Response missing enqueued count');
    });
  } else {
    console.log('  POST /api/admin/replay (with auth)............ ⏭️ SKIPPED (no JOBS_SECRET)');
  }

  // 4. Test Value Dashboard Page
  console.log('\n== UI Pages ==');
  
  await test('GET /reports/value', async () => {
    const res = await request(`${APP_URL}/reports/value`);
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
    // Check that it's HTML
    if (!res.body.includes('<!DOCTYPE html>') && !res.body.includes('<html')) {
      throw new Error('Response is not HTML');
    }
  });

  // 5. Test Health Check still works
  console.log('\n== Health Check (Regression) ==');
  
  await test('GET /api/health', async () => {
    const res = await request(`${APP_URL}/api/health`);
    const data = JSON.parse(res.body);
    if (!data.ok) throw new Error('Health check failed');
  });

  // Summary
  console.log('\n═══════════════════════════════════════');
  console.log('            TEST SUMMARY');
  console.log('═══════════════════════════════════════\n');
  console.log(`  Total Tests: ${passed + failed}`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  
  const successRate = passed + failed > 0 
    ? Math.round((passed / (passed + failed)) * 100)
    : 0;
  console.log(`\n  Success Rate: ${successRate}%`);
  
  if (failed === 0) {
    console.log('\n✅ All tests passed! v1.1 features are working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Review the errors above.');
  }
  
  console.log('\n');
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});