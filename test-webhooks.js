#!/usr/bin/env node

// Test Convoso webhooks
const baseUrl = 'https://synced-up-call-ai.vercel.app';

async function testWebhook(endpoint, data, description) {
  console.log(`\n📝 Testing: ${description}`);
  console.log(`   Endpoint: ${endpoint}`);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Request': 'true'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (response.ok) {
      console.log(`   ✅ Success:`, result.message || 'Data saved');
      if (result.contact_id) console.log(`   Contact ID: ${result.contact_id}`);
      if (result.call_id) console.log(`   Call ID: ${result.call_id}`);
    } else {
      console.log(`   ❌ Failed:`, result.error || 'Unknown error');
    }

    return result;
  } catch (error) {
    console.log(`   ❌ Network error:`, error.message);
    return null;
  }
}

async function getStats() {
  console.log('\n📊 Getting webhook statistics...');

  try {
    // Check lead endpoint
    const leadsResponse = await fetch(`${baseUrl}/api/webhooks/convoso-leads`);
    const leadsStatus = await leadsResponse.json();
    console.log(`   Leads endpoint: ${leadsStatus.ok ? '✅ Active' : '❌ Down'}`);

    // Check calls endpoint
    const callsResponse = await fetch(`${baseUrl}/api/webhooks/convoso-calls`);
    const callsStatus = await callsResponse.json();
    console.log(`   Calls endpoint: ${callsStatus.ok ? '✅ Active' : '❌ Down'}`);
    console.log(`   Recent calls in DB: ${callsStatus.recent_calls || 0}`);

  } catch (error) {
    console.log(`   ❌ Could not fetch stats:`, error.message);
  }
}

async function runTests() {
  console.log('🚀 Convoso Webhook Test Suite');
  console.log('================================');

  // Get current status
  await getStats();

  // Test 1: Lead with minimal data
  const timestamp = Date.now();
  await testWebhook(
    '/api/webhooks/convoso-leads',
    {
      lead_id: `TEST-LEAD-${timestamp}`,
      phone_number: '555-0100'
    },
    'Lead webhook with minimal data'
  );

  // Test 2: Lead with full data
  await testWebhook(
    '/api/webhooks/convoso-leads',
    {
      lead_id: `TEST-LEAD-FULL-${timestamp}`,
      phone_number: '555-0200',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@test.com',
      address: '123 Main St',
      city: 'New York',
      state: 'NY',
      list_id: 'LIST-001'
    },
    'Lead webhook with full data'
  );

  // Test 3: Call with required fields only
  await testWebhook(
    '/api/webhooks/convoso-calls',
    {
      call_id: `TEST-CALL-${timestamp}`,
      agent_name: 'Test Agent',
      disposition: 'SALE',
      duration: 120
    },
    'Call webhook with minimal required data'
  );

  // Test 4: Call with full data
  await testWebhook(
    '/api/webhooks/convoso-calls',
    {
      call_id: `TEST-CALL-FULL-${timestamp}`,
      lead_id: `TEST-LEAD-${timestamp}`,
      agent_name: 'John Agent',
      phone_number: '555-0300',
      disposition: 'INTERESTED',
      duration: 240,
      campaign: 'Test Campaign',
      recording_url: 'https://example.com/recording.mp3',
      started_at: new Date(Date.now() - 240000).toISOString(),
      ended_at: new Date().toISOString()
    },
    'Call webhook with full data'
  );

  // Test 5: Call without recording (should queue for fetch)
  await testWebhook(
    '/api/webhooks/convoso-calls',
    {
      call_id: `TEST-CALL-NO-REC-${timestamp}`,
      lead_id: `TEST-LEAD-${timestamp}`,
      agent_name: 'Agent Smith',
      disposition: 'CALLBACK',
      duration: 60
    },
    'Call webhook without recording (should queue)'
  );

  // Test 6: Invalid call (missing required fields)
  await testWebhook(
    '/api/webhooks/convoso-calls',
    {
      call_id: `TEST-CALL-INVALID-${timestamp}`,
      phone_number: '555-0400'
    },
    'Call webhook with missing required fields (should fail)'
  );

  console.log('\n✨ Test suite complete!');
  console.log('Check your database for the test records.');
}

// Run tests
runTests().catch(console.error);