#!/usr/bin/env node

/**
 * Comprehensive test script for Convoso API integration
 * Tests both recordings fetch and lead data enrichment
 */

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN || '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

console.log('=========================================');
console.log('  CONVOSO API COMPREHENSIVE TEST');
console.log('=========================================\n');

// Helper function to format dates
function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Test 1: Fetch recordings using lead_id=0 trick (current working method)
async function testLeadRecordingsAPI() {
  console.log('TEST 1: Fetch Recordings via /leads/get-recordings');
  console.log('--------------------------------------------');

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const params = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    lead_id: '0', // Returns ALL recordings
    date_from: formatDate(yesterday),
    date_to: formatDate(today),
    limit: '5'
  });

  const url = `${CONVOSO_API_BASE}/leads/get-recordings?${params.toString()}`;

  console.log('Request URL:', url.replace(CONVOSO_AUTH_TOKEN, 'xxx...'));
  console.log('Date range:', formatDate(yesterday), 'to', formatDate(today));

  try {
    const response = await fetch(url);
    console.log('Response Status:', response.status);

    const data = await response.json();

    if (data.success) {
      console.log('✅ SUCCESS: API call successful');
      console.log('Total recordings found:', data.data?.total || 0);
      console.log('Recordings fetched:', data.data?.entries?.length || 0);

      if (data.data?.entries?.length > 0) {
        console.log('\nFirst recording sample:');
        const sample = data.data.entries[0];
        console.log(JSON.stringify(sample, null, 2));
        return sample.lead_id; // Return for next test
      }
    } else {
      console.log('❌ FAILED:', data.text || data.error || 'Unknown error');
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
  }

  console.log('\n');
  return null;
}

// Test 2: Test the /users/recordings endpoint (documented method)
async function testUserRecordingsAPI() {
  console.log('TEST 2: Fetch Recordings via /users/recordings');
  console.log('--------------------------------------------');

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Note: This endpoint requires specific user emails
  // You'll need to provide actual user emails from your Convoso account
  const params = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    user: 'admin@example.com', // Replace with actual user email
    start_time: formatDateTime(yesterday),
    end_time: formatDateTime(today),
    limit: '5',
    offset: '0'
  });

  const url = `${CONVOSO_API_BASE}/users/recordings?${params.toString()}`;

  console.log('Request URL:', url.replace(CONVOSO_AUTH_TOKEN, 'xxx...'));
  console.log('Date range:', formatDateTime(yesterday), 'to', formatDateTime(today));
  console.log('⚠️  Note: This endpoint requires valid user emails from your Convoso account');

  try {
    const response = await fetch(url);
    console.log('Response Status:', response.status);

    const data = await response.json();

    if (data.success) {
      console.log('✅ SUCCESS: API call successful');
      console.log('Total recordings found:', data.data?.total || 0);
      console.log('Recordings fetched:', data.data?.entries?.length || 0);

      if (data.data?.entries?.length > 0) {
        console.log('\nFirst recording sample:');
        console.log(JSON.stringify(data.data.entries[0], null, 2));
      }
    } else {
      console.log('⚠️  FAILED:', data.text || data.error || 'Unknown error');
      console.log('This is expected if the user email is not valid');
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
  }

  console.log('\n');
}

// Test 3: Fetch lead data for enrichment
async function testLeadSearchAPI(leadId) {
  console.log('TEST 3: Fetch Lead Data via /leads/search');
  console.log('--------------------------------------------');

  if (!leadId) {
    console.log('⚠️  No lead_id available from recordings test');
    console.log('Using test lead_id: 12345');
    leadId = '12345';
  }

  const formData = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    lead_id: leadId,
    limit: '1'
  });

  const url = `${CONVOSO_API_BASE}/leads/search`;

  console.log('Request URL:', url);
  console.log('Lead ID:', leadId);
  console.log('Method: POST');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });

    console.log('Response Status:', response.status);

    const data = await response.json();

    if (data.success) {
      console.log('✅ SUCCESS: API call successful');
      console.log('Total leads found:', data.data?.total || 0);

      if (data.data?.entries?.length > 0) {
        const lead = data.data.entries[0];
        console.log('\nLead data:');
        console.log('- ID:', lead.id);
        console.log('- Name:', `${lead.first_name} ${lead.last_name}`);
        console.log('- Phone:', lead.phone_number);
        console.log('- Status:', lead.status_name || lead.status);
        console.log('- Agent:', lead.user_name === 'System User' ? 'Auto-Detected' : lead.user_name);
        console.log('- Campaign:', lead.campaign_name);
        console.log('- List:', lead.directory_name || lead.list_id);
        console.log('\nFull lead data:');
        console.log(JSON.stringify(lead, null, 2));
      }
    } else {
      console.log('⚠️  Lead not found:', data.text || 'Unknown error');
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
  }

  console.log('\n');
}

// Test 4: Combined workflow test
async function testCombinedWorkflow() {
  console.log('TEST 4: Combined Workflow (Recording + Lead Data)');
  console.log('--------------------------------------------');

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 7); // Last 7 days for better chance of data

  // Step 1: Fetch recordings
  console.log('Step 1: Fetching recordings...');
  const recordingsParams = new URLSearchParams({
    auth_token: CONVOSO_AUTH_TOKEN,
    lead_id: '0',
    date_from: formatDate(yesterday),
    date_to: formatDate(today),
    limit: '10'
  });

  try {
    const recordingsResponse = await fetch(
      `${CONVOSO_API_BASE}/leads/get-recordings?${recordingsParams.toString()}`
    );
    const recordingsData = await recordingsResponse.json();

    if (recordingsData.success && recordingsData.data?.entries?.length > 0) {
      console.log(`✅ Found ${recordingsData.data.entries.length} recordings`);

      // Step 2: Enrich with lead data
      console.log('\nStep 2: Enriching with lead data...');
      const enrichedCalls = [];

      for (const recording of recordingsData.data.entries.slice(0, 3)) { // Test first 3
        const leadParams = new URLSearchParams({
          auth_token: CONVOSO_AUTH_TOKEN,
          lead_id: recording.lead_id,
          limit: '1'
        });

        const leadResponse = await fetch(`${CONVOSO_API_BASE}/leads/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: leadParams.toString()
        });

        const leadData = await leadResponse.json();

        if (leadData.success && leadData.data?.entries?.length > 0) {
          const lead = leadData.data.entries[0];
          const enrichedCall = {
            recording_id: recording.recording_id,
            lead_id: recording.lead_id,
            start_time: recording.start_time,
            end_time: recording.end_time,
            duration_seconds: parseFloat(recording.seconds || '0'),
            recording_url: recording.url,
            customer_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
            customer_phone: lead.phone_number,
            agent_name: lead.user_name === 'System User' ? 'Auto-Detected' : lead.user_name,
            disposition: lead.status_name || lead.status,
            campaign: lead.campaign_name,
            list: lead.directory_name || lead.list_id
          };
          enrichedCalls.push(enrichedCall);
          console.log(`✅ Enriched recording ${recording.recording_id}`);
        } else {
          console.log(`⚠️  No lead data for recording ${recording.recording_id}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('\nEnriched call data sample:');
      console.log(JSON.stringify(enrichedCalls[0], null, 2));

    } else {
      console.log('❌ No recordings found in date range');
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
  }

  console.log('\n');
}

// Main test runner
async function runTests() {
  console.log('Auth Token:', CONVOSO_AUTH_TOKEN.substring(0, 10) + '...');
  console.log('API Base:', CONVOSO_API_BASE);
  console.log('\n');

  // Run tests in sequence
  const leadId = await testLeadRecordingsAPI();
  await testUserRecordingsAPI();
  await testLeadSearchAPI(leadId);
  await testCombinedWorkflow();

  console.log('=========================================');
  console.log('  TEST COMPLETE');
  console.log('=========================================');

  console.log('\n📋 SUMMARY:');
  console.log('- The /leads/get-recordings endpoint with lead_id=0 works for fetching all recordings');
  console.log('- The /users/recordings endpoint requires valid user emails from your Convoso account');
  console.log('- The /leads/search endpoint works for enriching recording data with lead details');
  console.log('- The "System User" agent name should be handled as "Auto-Detected"');
  console.log('- Database should use duration_sec field (not duration) per recent fixes');
}

// Run the tests
runTests().catch(console.error);