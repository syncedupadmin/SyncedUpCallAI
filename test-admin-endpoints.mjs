#!/usr/bin/env node

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Configuration from environment
const SUPABASE_URL = 'https://sbvxvheirbjwfbqjreor.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNidnh2aGVpcmJqd2ZicWpyZW9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU5NzMxNTIsImV4cCI6MjA0MTU0OTE1Mn0.dqPIpoKdw16oG-NrlM94bz8OBT3wSy7QELXZ8MJwLdU';
const BASE_URL = 'http://localhost:3004';

// Test configuration
const TEST_CREDENTIALS = {
  email: 'test@example.com',
  password: 'test123456'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

async function testEndpoint(name, url, options = {}) {
  console.log(`${colors.cyan}Testing: ${name}${colors.reset}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (response.ok) {
      console.log(`${colors.green}✅ ${name}: Status ${response.status}${colors.reset}`);
      if (data) {
        const preview = typeof data === 'object' ?
          JSON.stringify(data, null, 2).substring(0, 200) :
          data.substring(0, 200);
        console.log(`   Response: ${preview}${preview.length >= 200 ? '...' : ''}`);
      }
      results.passed.push({ name, status: response.status });
      return { success: true, data, response };
    } else {
      console.log(`${colors.red}❌ ${name}: Status ${response.status}${colors.reset}`);
      console.log(`   Response: ${typeof data === 'object' ? JSON.stringify(data) : data}`);
      results.failed.push({ name, status: response.status, error: data });
      return { success: false, data, response };
    }
  } catch (error) {
    console.log(`${colors.red}❌ ${name}: ${error.message}${colors.reset}`);
    results.failed.push({ name, error: error.message });
    return { success: false, error };
  }
}

async function runTests() {
  console.log(`${colors.bright}${colors.blue}
========================================
   Super Admin Portal API Tests
========================================${colors.reset}
`);

  // Test 1: Public endpoints without auth
  console.log(`${colors.yellow}1. PUBLIC ENDPOINTS (No Auth)${colors.reset}\n`);

  await testEndpoint(
    'GET /api/webhooks/status',
    `${BASE_URL}/api/webhooks/status`
  );

  // Test 2: Unauthenticated admin endpoints (should fail)
  console.log(`\n${colors.yellow}2. ADMIN ENDPOINTS (Unauthenticated)${colors.reset}\n`);

  await testEndpoint(
    'GET /api/admin/stats (no auth)',
    `${BASE_URL}/api/admin/stats`
  );

  await testEndpoint(
    'GET /api/admin/calls-simple (no auth)',
    `${BASE_URL}/api/admin/calls-simple`
  );

  // Test 3: Try to authenticate with Supabase
  console.log(`\n${colors.yellow}3. SUPABASE AUTHENTICATION${colors.reset}\n`);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_CREDENTIALS.email,
    password: TEST_CREDENTIALS.password
  });

  let session = null;

  if (authError) {
    console.log(`${colors.red}❌ Supabase authentication failed: ${authError.message}${colors.reset}`);
    console.log(`${colors.yellow}   Note: Create a test user with the following credentials:${colors.reset}`);
    console.log(`   Email: ${TEST_CREDENTIALS.email}`);
    console.log(`   Password: ${TEST_CREDENTIALS.password}`);
    results.warnings.push('No test user available - create one in Supabase Dashboard');
  } else {
    console.log(`${colors.green}✅ Authenticated with Supabase${colors.reset}`);
    session = authData.session;

    // Test 4: Authenticated endpoints
    console.log(`\n${colors.yellow}4. ADMIN ENDPOINTS (Authenticated)${colors.reset}\n`);

    const authHeaders = {
      'Authorization': `Bearer ${session.access_token}`,
      'Cookie': `sb-sbvxvheirbjwfbqjreor-auth-token=${session.access_token}`
    };

    await testEndpoint(
      'GET /api/auth/admin',
      `${BASE_URL}/api/auth/admin`,
      { headers: authHeaders }
    );

    await testEndpoint(
      'GET /api/admin/stats',
      `${BASE_URL}/api/admin/stats`,
      { headers: authHeaders }
    );

    await testEndpoint(
      'GET /api/admin/calls',
      `${BASE_URL}/api/admin/calls`,
      { headers: authHeaders }
    );

    await testEndpoint(
      'GET /api/admin/calls-simple',
      `${BASE_URL}/api/admin/calls-simple`,
      { headers: authHeaders }
    );

    await testEndpoint(
      'GET /api/admin/webhook-logs',
      `${BASE_URL}/api/admin/webhook-logs`,
      { headers: authHeaders }
    );

    await testEndpoint(
      'GET /api/admin/leads',
      `${BASE_URL}/api/admin/leads`,
      { headers: authHeaders }
    );

    await testEndpoint(
      'GET /api/admin/health',
      `${BASE_URL}/api/admin/health`,
      { headers: authHeaders }
    );

    // Test 5: Check admin status
    const { data: isAdmin } = await supabase.rpc('is_admin');
    if (!isAdmin) {
      console.log(`${colors.yellow}⚠️  Test user is not an admin. Some endpoints may fail.${colors.reset}`);
      results.warnings.push('Test user lacks admin privileges');
    }
  }

  // Test 6: Additional endpoints
  console.log(`\n${colors.yellow}5. ADDITIONAL ENDPOINTS${colors.reset}\n`);

  await testEndpoint(
    'GET /api/calls',
    `${BASE_URL}/api/calls`,
    { headers: session ? { 'Authorization': `Bearer ${session.access_token}` } : {} }
  );

  // Generate report
  console.log(`\n${colors.bright}${colors.blue}
========================================
           TEST REPORT
========================================${colors.reset}
`);

  console.log(`${colors.green}✅ PASSED: ${results.passed.length} tests${colors.reset}`);
  results.passed.forEach(test => {
    console.log(`   - ${test.name}`);
  });

  if (results.failed.length > 0) {
    console.log(`\n${colors.red}❌ FAILED: ${results.failed.length} tests${colors.reset}`);
    results.failed.forEach(test => {
      console.log(`   - ${test.name}`);
      if (test.error) {
        const errorMsg = typeof test.error === 'object' ?
          JSON.stringify(test.error) : test.error;
        console.log(`     Error: ${errorMsg}`);
      }
    });
  }

  if (results.warnings.length > 0) {
    console.log(`\n${colors.yellow}⚠️  WARNINGS: ${results.warnings.length}${colors.reset}`);
    results.warnings.forEach(warning => {
      console.log(`   - ${warning}`);
    });
  }

  // Summary
  const totalTests = results.passed.length + results.failed.length;
  const passRate = totalTests > 0 ?
    ((results.passed.length / totalTests) * 100).toFixed(1) : 0;

  console.log(`\n${colors.bright}SUMMARY:${colors.reset}`);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Pass Rate: ${passRate}%`);

  // Recommendations
  console.log(`\n${colors.magenta}RECOMMENDATIONS:${colors.reset}`);

  if (!session) {
    console.log('1. Create a test user in Supabase Dashboard:');
    console.log(`   - Go to: ${SUPABASE_URL}/project/default/auth/users`);
    console.log(`   - Create user with email: ${TEST_CREDENTIALS.email}`);
    console.log(`   - Set password: ${TEST_CREDENTIALS.password}`);
    console.log('');
    console.log('2. Make the test user an admin:');
    console.log('   - Run the SQL in ensure-admin-user.sql');
    console.log('   - Or add user to admin_users table manually');
  }

  if (results.failed.length > 0) {
    console.log('3. Review failing endpoints for:');
    console.log('   - Correct authentication middleware');
    console.log('   - Proper error handling');
    console.log('   - Database connectivity issues');
  }

  // Sign out if we were signed in
  if (session) {
    await supabase.auth.signOut();
  }

  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(console.error);