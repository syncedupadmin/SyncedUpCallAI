import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const LEAD_ID = '10393511';

console.log('=== PROCESSING LEAD 10393511 ===\n');

// Step 1: Check if recordings exist for this lead
async function checkRecordings() {
  const authToken = process.env.CONVOSO_AUTH_TOKEN;

  console.log('STEP 1: Checking for recordings in Convoso...');

  const params = new URLSearchParams({
    auth_token: authToken,
    lead_id: LEAD_ID,
    limit: '10'
  });

  const url = `https://api.convoso.com/v1/leads/get-recordings?${params}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();

      if (data.success && data.data?.entries?.length > 0) {
        console.log(`✅ Found ${data.data.entries.length} recordings for lead ${LEAD_ID}\n`);

        data.data.entries.forEach((rec, i) => {
          console.log(`Recording ${i + 1}:`);
          console.log(`  - Recording ID: ${rec.recording_id}`);
          console.log(`  - URL: ${rec.url}`);
          console.log(`  - Start Time: ${rec.start_time}`);
          console.log(`  - Duration: ${rec.seconds} seconds`);
          console.log('');
        });

        return data.data.entries;
      } else {
        console.log(`❌ No recordings found for lead ${LEAD_ID}`);
        return [];
      }
    } else {
      console.log(`❌ API Error: ${response.status} ${response.statusText}`);
      return [];
    }
  } catch (error) {
    console.log(`❌ Network error: ${error.message}`);
    return [];
  }
}

// Step 2: Send webhook to create call record
async function sendWebhook(recording) {
  console.log('STEP 2: Creating call record via webhook...');

  const webhookData = {
    lead_id: LEAD_ID,
    agent_name: 'Test Agent',
    agent_email: 'test@example.com',
    phone_number: '555-0100',
    campaign: 'Test Campaign',
    disposition: 'CONTACTED',
    started_at: recording?.start_time || new Date().toISOString(),
    ended_at: recording?.end_time || new Date(Date.now() + 300000).toISOString(),
    duration: recording?.seconds || 300,
    direction: 'outbound'
  };

  try {
    const response = await fetch('http://localhost:3000/api/webhooks/convoso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookData)
    });

    if (response.ok) {
      console.log('✅ Call record created successfully');
      console.log(`   Fingerprint: ${LEAD_ID}_test agent_${webhookData.started_at.split('.')[0]}_${webhookData.duration}`);
      return true;
    } else {
      console.log(`❌ Failed to create call record: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error sending webhook: ${error.message}`);
    return false;
  }
}

// Step 3: Test smart matching
async function testSmartMatching() {
  console.log('\nSTEP 3: Testing smart matching algorithm...');

  try {
    const response = await fetch('http://localhost:3000/api/test/smart-recording-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: LEAD_ID,
        limit: 10,
        dry_run: true,  // Don't save to database yet
        test_matching: true
      })
    });

    if (response.ok) {
      const result = await response.json();

      console.log('✅ Smart matching complete');
      console.log(`   Success Rate: ${result.statistics?.success_rate || '0%'}`);
      console.log(`   Exact matches: ${result.statistics?.exact_matches || 0}`);
      console.log(`   Fuzzy matches: ${result.statistics?.fuzzy_matches || 0}`);
      console.log(`   Unmatched: ${result.statistics?.unmatched || 0}`);

      if (result.match_results?.length > 0) {
        console.log('\nMatch Details:');
        result.match_results.forEach(match => {
          if (match.matched) {
            console.log(`  ✅ Recording ${match.recording_id}: ${match.match_details.confidence * 100}% confidence`);
            console.log(`     ${match.match_details.reason}`);
          } else {
            console.log(`  ❌ Recording ${match.recording_id}: No match found`);
          }
        });
      }

      return result;
    } else {
      console.log(`❌ Smart matching failed: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Error testing smart matching: ${error.message}`);
    return null;
  }
}

// Run the complete flow
async function processLead() {
  console.log('Starting complete flow for lead 10393511...\n');

  // Check for recordings
  const recordings = await checkRecordings();

  if (recordings.length > 0) {
    // Create call record for first recording
    const webhookSent = await sendWebhook(recordings[0]);

    if (webhookSent) {
      // Wait a moment for database to update
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test smart matching
      await testSmartMatching();
    }
  } else {
    console.log('\n⚠️ No recordings found for this lead.');
    console.log('Creating a test call record anyway...');

    // Create a test call record
    await sendWebhook(null);

    console.log('\n📝 Next steps:');
    console.log('1. Go to /test-smart-recordings');
    console.log(`2. Enter Lead ID: ${LEAD_ID}`);
    console.log('3. Click "Test Smart Matching" to see the results');
  }

  console.log('\n=== PROCESSING COMPLETE ===');
  console.log(`\n🔗 Check results at:`);
  console.log(`   - /admin/calls (to see the call record)`);
  console.log(`   - /test-smart-recordings (to test matching)`);
  console.log(`   - /admin/review-recordings (if any unmatched)`);
}

processLead().catch(console.error);