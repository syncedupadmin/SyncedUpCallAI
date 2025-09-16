import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
if (!authToken) {
  console.error('CONVOSO_AUTH_TOKEN not found in .env.local');
  process.exit(1);
}

async function testLeadRecordingsAPI(leadId) {
  console.log(`\n=== TESTING LEAD RECORDINGS API ===`);
  console.log(`Testing with lead ID: ${leadId}\n`);

  const params = new URLSearchParams({
    auth_token: authToken,
    lead_id: leadId.toString(),
    limit: '5'
  });

  const url = `https://api.convoso.com/v1/leads/get-recordings?${params}`;
  console.log(`GET ${url}\n`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`\n✅ SUCCESS! Full Response:`);
      console.log(JSON.stringify(data, null, 2));

      if (data.success && data.data?.entries) {
        console.log(`\n=== ANALYSIS ===`);
        console.log(`Total recordings found: ${data.data.entries.length}`);

        data.data.entries.forEach((entry, i) => {
          console.log(`\nRecording ${i + 1}:`);
          console.log(`  - Recording ID: ${entry.recording_id}`);
          console.log(`  - Lead ID: ${entry.lead_id}`);
          console.log(`  - URL: ${entry.url}`);
          console.log(`  - Start Time: ${entry.start_time}`);
          console.log(`  - Duration: ${entry.seconds} seconds`);

          // Check for agent information
          console.log(`  - Agent Info:`);
          console.log(`    * agent_id: ${entry.agent_id || 'NOT PRESENT'}`);
          console.log(`    * agent_name: ${entry.agent_name || 'NOT PRESENT'}`);
          console.log(`    * user_id: ${entry.user_id || 'NOT PRESENT'}`);
          console.log(`    * user: ${entry.user || 'NOT PRESENT'}`);
          console.log(`    * User: ${entry.User || 'NOT PRESENT'}`);

          // Check all fields
          console.log(`  - All fields: ${Object.keys(entry).join(', ')}`);
        });

        console.log(`\n🔍 CRITICAL FINDING:`);
        const hasAgentInfo = data.data.entries.some(e =>
          e.agent_id || e.agent_name || e.user_id || e.user || e.User
        );
        if (hasAgentInfo) {
          console.log(`✅ RECORDINGS INCLUDE AGENT INFORMATION!`);
        } else {
          console.log(`❌ NO AGENT INFORMATION IN RECORDINGS`);
          console.log(`This means when multiple agents talk to the same lead, we cannot distinguish their recordings.`);
        }
      }
    } else {
      const errorText = await response.text();
      console.log(`❌ Failed:`, errorText);
    }
  } catch (error) {
    console.log(`❌ Network error: ${error.message}`);
  }
}

// Test with the lead ID we found in the database
console.log('Testing with known lead ID from database...');
await testLeadRecordingsAPI('103833');

process.exit(0);