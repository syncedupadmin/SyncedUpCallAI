#!/usr/bin/env node

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:3004';
const TEST_CREDENTIALS = {
  email: 'admin@syncedupsolutions.com',
  password: 'AdminTest123!' // You'll need to set this up
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

// Test results storage
const testResults = {
  passed: [],
  failed: [],
  warnings: []
};

// Helper to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url || `${BASE_URL}${options.path}`);
    const protocol = url.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        'Content-Type': 'application/json'
      }
    };

    const req = protocol.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            status: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null,
            rawBody: body
          };
          resolve(result);
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: null,
            rawBody: body,
            parseError: e.message
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test functions
async function testEndpoint(name, options, expectedStatus = 200, requireAuth = false) {
  console.log(`${colors.cyan}Testing: ${name}${colors.reset}`);

  try {
    const response = await makeRequest(options);

    if (response.status === expectedStatus) {
      console.log(`${colors.green}✅ ${name}: Status ${response.status}${colors.reset}`);
      if (response.body) {
        console.log(`   Response: ${JSON.stringify(response.body, null, 2).substring(0, 200)}`);
      }
      testResults.passed.push({ name, status: response.status, body: response.body });
      return { success: true, response };
    } else {
      console.log(`${colors.red}❌ ${name}: Expected ${expectedStatus}, got ${response.status}${colors.reset}`);
      if (response.body || response.rawBody) {
        console.log(`   Response: ${response.body ? JSON.stringify(response.body) : response.rawBody}`);
      }
      testResults.failed.push({ name, expected: expectedStatus, actual: response.status, body: response.body });
      return { success: false, response };
    }
  } catch (error) {
    console.log(`${colors.red}❌ ${name}: ${error.message}${colors.reset}`);
    testResults.failed.push({ name, error: error.message });
    return { success: false, error };
  }
}

async function runTests() {
  console.log(`${colors.bright}${colors.blue}
========================================
   Super Admin Portal API Tests
========================================${colors.reset}
`);

  let authCookie = null;

  // Test 1: Check unauthenticated access
  console.log(`${colors.yellow}\n1. AUTHENTICATION TESTS${colors.reset}\n`);

  await testEndpoint('GET /api/auth/admin (unauthenticated)', {
    path: '/api/auth/admin',
    method: 'GET'
  }, 401);

  await testEndpoint('GET /api/admin/stats (unauthenticated)', {
    path: '/api/admin/stats',
    method: 'GET'
  }, 401);

  // Test 2: Attempt admin authentication
  console.log(`${colors.yellow}\n2. ADMIN LOGIN TEST${colors.reset}\n`);

  const loginResult = await testEndpoint('POST /api/auth/admin (login)', {
    path: '/api/auth/admin',
    method: 'POST'
  }, 200, false, TEST_CREDENTIALS);

  if (loginResult.success && loginResult.response.headers['set-cookie']) {
    authCookie = loginResult.response.headers['set-cookie'][0];
    console.log(`${colors.green}✅ Admin cookie obtained${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Failed to obtain admin cookie. Some authenticated tests will fail.${colors.reset}`);
    testResults.warnings.push('No admin authentication available - create an admin user first');
  }

  // Test 3: Test authenticated endpoints
  if (authCookie) {
    console.log(`${colors.yellow}\n3. AUTHENTICATED ADMIN ENDPOINTS${colors.reset}\n`);

    const authHeaders = { Cookie: authCookie };

    await testEndpoint('GET /api/auth/admin (authenticated)', {
      path: '/api/auth/admin',
      method: 'GET',
      headers: authHeaders
    }, 200);

    await testEndpoint('GET /api/admin/stats', {
      path: '/api/admin/stats',
      method: 'GET',
      headers: authHeaders
    }, 200);

    await testEndpoint('GET /api/admin/calls', {
      path: '/api/admin/calls',
      method: 'GET',
      headers: authHeaders
    }, 200);

    await testEndpoint('GET /api/admin/calls-simple', {
      path: '/api/admin/calls-simple',
      method: 'GET',
      headers: authHeaders
    }, 200);

    await testEndpoint('GET /api/admin/webhook-logs', {
      path: '/api/admin/webhook-logs',
      method: 'GET',
      headers: authHeaders
    }, 200);

    await testEndpoint('GET /api/admin/health', {
      path: '/api/admin/health',
      method: 'GET',
      headers: authHeaders
    }, 200);

    await testEndpoint('GET /api/admin/leads', {
      path: '/api/admin/leads',
      method: 'GET',
      headers: authHeaders
    }, 200);
  }

  // Test 4: Test webhook status (doesn't require auth)
  console.log(`${colors.yellow}\n4. WEBHOOK STATUS TEST${colors.reset}\n`);

  await testEndpoint('GET /api/webhooks/status', {
    path: '/api/webhooks/status',
    method: 'GET'
  }, 200);

  // Test 5: Test public endpoints
  console.log(`${colors.yellow}\n5. PUBLIC ENDPOINTS TEST${colors.reset}\n`);

  await testEndpoint('GET /api/calls (public)', {
    path: '/api/calls',
    method: 'GET'
  }, 200);

  // Generate report
  console.log(`${colors.bright}${colors.blue}\n
========================================
           TEST REPORT
========================================${colors.reset}
`);

  console.log(`${colors.green}✅ PASSED: ${testResults.passed.length} tests${colors.reset}`);
  testResults.passed.forEach(test => {
    console.log(`   - ${test.name}`);
  });

  if (testResults.failed.length > 0) {
    console.log(`\n${colors.red}❌ FAILED: ${testResults.failed.length} tests${colors.reset}`);
    testResults.failed.forEach(test => {
      console.log(`   - ${test.name}`);
      if (test.expected) {
        console.log(`     Expected: ${test.expected}, Got: ${test.actual}`);
      }
      if (test.error) {
        console.log(`     Error: ${test.error}`);
      }
    });
  }

  if (testResults.warnings.length > 0) {
    console.log(`\n${colors.yellow}⚠️  WARNINGS: ${testResults.warnings.length}${colors.reset}`);
    testResults.warnings.forEach(warning => {
      console.log(`   - ${warning}`);
    });
  }

  // Summary
  const totalTests = testResults.passed.length + testResults.failed.length;
  const passRate = totalTests > 0 ? ((testResults.passed.length / totalTests) * 100).toFixed(1) : 0;

  console.log(`\n${colors.bright}SUMMARY:${colors.reset}`);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Pass Rate: ${passRate}%`);

  if (testResults.failed.length === 0 && testResults.warnings.length === 0) {
    console.log(`${colors.green}${colors.bright}\n🎉 All tests passed successfully! The super admin portal is fully functional.${colors.reset}`);
  } else if (testResults.failed.length === 0) {
    console.log(`${colors.yellow}${colors.bright}\n⚠️  All tests passed with warnings. Review the warnings above.${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bright}\n❌ Some tests failed. Review the failures above.${colors.reset}`);
  }

  // Provide recommendations
  console.log(`\n${colors.magenta}RECOMMENDATIONS:${colors.reset}`);
  if (!authCookie) {
    console.log('1. Create an admin user with credentials:');
    console.log('   - Email: admin@syncedupsolutions.com');
    console.log('   - Password: Set a secure password');
    console.log('   - Run the ensure-admin-user.sql script in Supabase');
  }

  if (testResults.failed.length > 0) {
    console.log('2. Fix the failing endpoints listed above');
    console.log('3. Check server logs for detailed error messages');
    console.log('4. Verify database connections and RLS policies');
  }
}

// Run the tests
runTests().catch(console.error);