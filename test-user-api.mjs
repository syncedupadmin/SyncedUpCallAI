import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
if (!authToken) {
  console.error('CONVOSO_AUTH_TOKEN not found in .env.local');
  process.exit(1);
}

async function testUserRecordingsAPI(userEmail) {
  console.log(`\n=== TESTING USER RECORDINGS API ===`);
  console.log(`Testing with email: ${userEmail}\n`);

  // Test different endpoint variations
  const endpoints = [
    { url: 'https://api.convoso.com/v1/users/get-recordings', method: 'POST' },
    { url: 'https://api.convoso.com/v1/users/recordings', method: 'POST' },
    { url: 'https://api.convoso.com/v1/user/recordings', method: 'POST' },
    { url: 'https://api.convoso.com/api/users/get-recordings', method: 'POST' },
  ];

  for (const endpoint of endpoints) {
    console.log(`Testing ${endpoint.method} ${endpoint.url}...`);

    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          auth_token: authToken,
          user: userEmail,
          limit: 2  // Just get 2 recordings for testing
        })
      });

      console.log(`  Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`  ✅ SUCCESS! Response structure:`);

        // Analyze response structure
        if (Array.isArray(data)) {
          console.log(`    - Response is an array with ${data.length} items`);
          if (data.length > 0) {
            console.log(`    - First item keys: ${Object.keys(data[0]).join(', ')}`);
            console.log(`    - Sample recording:`);
            const rec = data[0];
            console.log(`      * lead_id: ${rec.lead_id || rec.LeadID || 'NOT FOUND'}`);
            console.log(`      * agent: ${rec.agent_name || rec.User || rec.agent || 'NOT FOUND'}`);
            console.log(`      * recording_url: ${rec.url || rec.recording_url || rec.RecordingURL || 'NOT FOUND'}`);
            console.log(`      * call_id: ${rec.call_id || rec.CallID || rec.recording_id || 'NOT FOUND'}`);
          }
        } else if (data.recordings) {
          console.log(`    - Has 'recordings' field with ${data.recordings.length} items`);
          if (data.recordings.length > 0) {
            const rec = data.recordings[0];
            console.log(`    - First recording keys: ${Object.keys(rec).join(', ')}`);
            console.log(`    - Sample recording:`);
            console.log(`      * lead_id: ${rec.lead_id || rec.LeadID || 'NOT FOUND'}`);
            console.log(`      * agent: ${rec.agent_name || rec.User || rec.agent || 'NOT FOUND'}`);
            console.log(`      * recording_url: ${rec.url || rec.recording_url || rec.RecordingURL || 'NOT FOUND'}`);
            console.log(`      * call_id: ${rec.call_id || rec.CallID || rec.recording_id || 'NOT FOUND'}`);
          }
        } else if (data.data) {
          console.log(`    - Has 'data' field`);
          if (data.data.entries) {
            console.log(`    - Has 'data.entries' with ${data.data.entries.length} items`);
            if (data.data.entries.length > 0) {
              const rec = data.data.entries[0];
              console.log(`    - First entry keys: ${Object.keys(rec).join(', ')}`);
              console.log(`    - Sample recording:`);
              console.log(`      * lead_id: ${rec.lead_id || rec.LeadID || 'NOT FOUND'}`);
              console.log(`      * agent: ${rec.agent_name || rec.User || rec.agent || 'NOT FOUND'}`);
              console.log(`      * recording_url: ${rec.url || rec.recording_url || rec.RecordingURL || 'NOT FOUND'}`);
              console.log(`      * call_id: ${rec.call_id || rec.CallID || rec.recording_id || 'NOT FOUND'}`);
            }
          }
        } else {
          console.log(`    - Unknown structure. Top-level keys: ${Object.keys(data).join(', ')}`);
        }

        console.log(`\n    🔍 CAN WE FILTER BY LEAD? Checking if lead_id is present...`);
        let hasLeadId = false;
        if (Array.isArray(data) && data.length > 0) {
          hasLeadId = !!(data[0].lead_id || data[0].LeadID);
        } else if (data.recordings && data.recordings.length > 0) {
          hasLeadId = !!(data.recordings[0].lead_id || data.recordings[0].LeadID);
        } else if (data.data?.entries && data.data.entries.length > 0) {
          hasLeadId = !!(data.data.entries[0].lead_id || data.data.entries[0].LeadID);
        }
        console.log(`    ${hasLeadId ? '✅ YES - Lead ID is present, we can filter!' : '❌ NO - Lead ID not found'}`);

        return data;  // Return for further analysis
      } else {
        const errorText = await response.text();
        console.log(`  ❌ Failed: ${errorText.substring(0, 100)}`);
      }
    } catch (error) {
      console.log(`  ❌ Network error: ${error.message}`);
    }
  }
}

// Test with a sample email - you may need to change this to a real agent email
const testEmail = 'Test Agent 4123';  // Based on the data we saw
console.log('Note: You may need to replace the test email with a real agent email from your Convoso system');
await testUserRecordingsAPI(testEmail);

process.exit(0);