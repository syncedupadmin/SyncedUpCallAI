import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

console.log('========================================');
console.log('API ENDPOINT TESTING');
console.log('========================================\n');

const baseUrl = process.env.APP_URL || 'http://localhost:3000';
const authToken = process.env.CONVOSO_AUTH_TOKEN;

// Helper to test endpoint
async function testEndpoint(name, url, options = {}) {
  try {
    console.log(`Testing: ${name}`);
    console.log(`  URL: ${url}`);

    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');

    console.log(`  Status: ${response.status} ${response.statusText}`);

    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      console.log(`  Response: ${JSON.stringify(data).substring(0, 200)}${data.length > 200 ? '...' : ''}`);

      if (response.ok && (data.ok || data.authenticated !== undefined || data.success)) {
        console.log(`  ✅ PASSED\n`);
        return true;
      } else {
        console.log(`  ❌ FAILED: Response not OK\n`);
        return false;
      }
    } else {
      const text = await response.text();
      console.log(`  Response (text): ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

      if (response.ok) {
        console.log(`  ✅ PASSED\n`);
        return true;
      } else {
        console.log(`  ❌ FAILED\n`);
        return false;
      }
    }
  } catch (error) {
    console.log(`  ❌ ERROR: ${error.message}\n`);
    return false;
  }
}

async function runTests() {
  const results = {
    passed: 0,
    failed: 0,
    total: 0
  };

  console.log('1. ADMIN AUTHENTICATION ENDPOINTS\n');
  console.log('----------------------------------------');

  // Test admin auth check
  if (await testEndpoint(
    'Admin Auth Check',
    `${baseUrl}/api/auth/admin`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  console.log('2. CONVOSO WEBHOOK ENDPOINTS\n');
  console.log('----------------------------------------');

  // Test webhook status
  if (await testEndpoint(
    'Webhook Status',
    `${baseUrl}/api/webhooks/convoso`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // Test webhook with sample data
  if (await testEndpoint(
    'Webhook POST (Test)',
    `${baseUrl}/api/webhooks/convoso`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test: true,
        lead_id: 'TEST_' + Date.now(),
        phone_number: '5555551234',
        agent_name: 'Test Agent',
        campaign: 'Test Campaign'
      })
    }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  console.log('3. RECORDING FETCH ENDPOINTS\n');
  console.log('----------------------------------------');

  // Test recording fetch status
  if (await testEndpoint(
    'Recording Fetch Status',
    `${baseUrl}/api/test/fetch-convoso-recordings`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // Test diagnose endpoint
  if (await testEndpoint(
    'Convoso Diagnose Status',
    `${baseUrl}/api/test/convoso-diagnose`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  console.log('4. ADMIN API ENDPOINTS\n');
  console.log('----------------------------------------');

  // Test admin health
  if (await testEndpoint(
    'Admin Health',
    `${baseUrl}/api/admin/health`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // Test admin calls
  if (await testEndpoint(
    'Admin Calls',
    `${baseUrl}/api/admin/calls`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // Test admin webhook logs
  if (await testEndpoint(
    'Admin Webhook Logs',
    `${baseUrl}/api/admin/webhook-logs`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // Test last webhooks
  if (await testEndpoint(
    'Last Webhooks',
    `${baseUrl}/api/admin/last-webhooks`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  console.log('5. SYSTEM HEALTH ENDPOINTS\n');
  console.log('----------------------------------------');

  // Test main health endpoint
  if (await testEndpoint(
    'System Health',
    `${baseUrl}/api/health`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  // Test UI stats
  if (await testEndpoint(
    'UI Stats',
    `${baseUrl}/api/ui/stats/safe`,
    { method: 'GET' }
  )) {
    results.passed++;
  } else {
    results.failed++;
  }
  results.total++;

  console.log('========================================');
  console.log('TEST SUMMARY');
  console.log('========================================\n');

  const score = Math.round((results.passed / results.total) * 100);

  console.log(`✅ Passed: ${results.passed}/${results.total}`);
  console.log(`❌ Failed: ${results.failed}/${results.total}`);
  console.log(`📊 Success Rate: ${score}%`);

  if (score === 100) {
    console.log('\n🎉 All API endpoints are working correctly!');
  } else if (score >= 80) {
    console.log('\n✅ Most endpoints are working, with some minor issues');
  } else if (score >= 60) {
    console.log('\n⚠️ Several endpoints have issues that need attention');
  } else {
    console.log('\n❌ Critical: Many endpoints are failing');
  }

  // Test the actual Convoso API with corrected endpoint
  if (authToken) {
    console.log('\n6. CONVOSO API DIRECT TEST\n');
    console.log('----------------------------------------');

    const convosoUrl = `https://api.convoso.com/v1/leads/get-recordings?auth_token=${authToken}&lead_id=test&limit=1`;

    console.log('Testing corrected Convoso endpoint:');
    console.log(`  URL: https://api.convoso.com/v1/leads/get-recordings`);
    console.log('  Note: Using plural "leads" not singular "lead"');

    try {
      const response = await fetch(convosoUrl);
      console.log(`  Status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        if (data.success !== undefined) {
          console.log(`  ✅ Convoso API endpoint is correct and working`);
          console.log(`  Response structure: ${JSON.stringify(Object.keys(data))}`);
        }
      } else if (response.status === 401) {
        console.log(`  ❌ Authentication failed - check CONVOSO_AUTH_TOKEN`);
      } else {
        console.log(`  ⚠️ Unexpected status: ${response.status}`);
      }
    } catch (error) {
      console.log(`  ❌ Network error: ${error.message}`);
    }
  }

  console.log('\n✅ API endpoint testing complete!');
  process.exit(0);
}

// Run tests
console.log(`Testing against: ${baseUrl}\n`);
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});