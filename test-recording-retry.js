// Test script for the new recording retry strategy
// Run with: node test-recording-retry.js

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test data for different scenarios
const testScenarios = [
  {
    name: 'Completed Short Call',
    data: {
      call_id: `test-call-${Date.now()}-short`,
      lead_id: `test-lead-${Date.now()}-short`,
      agent_name: 'Test Agent',
      phone_number: '555-0001',
      campaign: 'Test Campaign',
      disposition: 'SALE',
      duration: 180, // 3 minutes
      started_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      ended_at: new Date().toISOString()
    }
  },
  {
    name: 'Ongoing Call (will estimate end)',
    data: {
      call_id: `test-call-${Date.now()}-ongoing`,
      lead_id: `test-lead-${Date.now()}-ongoing`,
      agent_name: 'Test Agent',
      phone_number: '555-0002',
      campaign: 'Test Campaign',
      disposition: 'IN_PROGRESS',
      duration: 0, // Ongoing
      started_at: new Date().toISOString()
      // No ended_at - call is ongoing
    }
  },
  {
    name: 'Long Completed Call',
    data: {
      call_id: `test-call-${Date.now()}-long`,
      lead_id: `test-lead-${Date.now()}-long`,
      agent_name: 'Test Agent',
      phone_number: '555-0003',
      campaign: 'Test Campaign',
      disposition: 'SALE',
      duration: 3600, // 1 hour
      started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      ended_at: new Date().toISOString()
    }
  }
];

// Function to send webhook
async function sendWebhook(endpoint, data) {
  try {
    const response = await fetch(`${TEST_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.WEBHOOK_SECRET || 'test-secret'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    return {
      status: response.status,
      data: result
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

// Function to check pending recordings status
async function checkPendingStatus() {
  try {
    const response = await fetch(`${TEST_URL}/api/webhooks/convoso-calls-immediate`);
    const data = await response.json();
    return data;
  } catch (error) {
    return { error: error.message };
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting Recording Retry Strategy Tests\n');
  console.log('Test URL:', TEST_URL);
  console.log('=====================================\n');

  // Test the new immediate fetch endpoint
  console.log('Testing /api/webhooks/convoso-calls-immediate endpoint:\n');

  for (const scenario of testScenarios) {
    console.log(`\n📝 Test: ${scenario.name}`);
    console.log('Payload:', JSON.stringify(scenario.data, null, 2));

    const result = await sendWebhook('/api/webhooks/convoso-calls-immediate', scenario.data);

    console.log(`Response Status: ${result.status}`);
    console.log('Response:', JSON.stringify(result.data, null, 2));

    if (result.data.immediate_fetch_attempted !== undefined) {
      console.log(`✅ Immediate fetch attempted: ${result.data.immediate_fetch_attempted}`);
    }

    console.log('---');
  }

  // Check pending recordings status
  console.log('\n📊 Checking Pending Recordings Status:\n');
  const status = await checkPendingStatus();

  if (status.pending_recordings) {
    console.log('Pending Recordings Summary:');
    console.log(`  Total: ${status.pending_recordings.total_pending}`);
    console.log(`  Quick Phase: ${status.pending_recordings.quick_phase}`);
    console.log(`  Backoff Phase: ${status.pending_recordings.backoff_phase}`);
    console.log(`  Final Phase: ${status.pending_recordings.final_phase}`);
  }

  if (status.features) {
    console.log('\nEnabled Features:');
    console.log(`  Immediate Fetch: ${status.features.immediate_fetch}`);
    console.log(`  Exponential Backoff: ${status.features.exponential_backoff}`);
    console.log(`  Max Attempts: ${status.features.max_attempts}`);
    console.log(`  Max Wait Hours: ${status.features.max_wait_hours}`);
  }

  // Test the old endpoint for comparison
  console.log('\n\n📝 Testing original /api/webhooks/convoso-calls endpoint for comparison:\n');

  const comparisonTest = {
    call_id: `test-call-${Date.now()}-comparison`,
    lead_id: `test-lead-${Date.now()}-comparison`,
    agent_name: 'Test Agent',
    phone_number: '555-0004',
    campaign: 'Test Campaign',
    disposition: 'SALE',
    duration: 120,
    started_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    ended_at: new Date().toISOString()
  };

  const oldResult = await sendWebhook('/api/webhooks/convoso-calls', comparisonTest);
  console.log('Old Endpoint Response:', oldResult.status);
  console.log('Data:', JSON.stringify(oldResult.data, null, 2));

  console.log('\n✅ Test Complete!\n');
  console.log('Next Steps:');
  console.log('1. Check the database for pending_recordings entries');
  console.log('2. Monitor the cron job at /api/cron/process-recordings-v3');
  console.log('3. Verify exponential backoff timing in scheduled_for column');
}

// Run tests
runTests().catch(console.error);