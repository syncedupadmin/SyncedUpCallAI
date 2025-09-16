import dotenv from 'dotenv';
import pg from 'pg';
const { Client } = pg;

dotenv.config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function findTestData() {
  await client.connect();

  // Find a lead that actually has a recording
  const result = await client.query(`
    SELECT
      source_ref as lead_id,
      agent_name,
      agent_email,
      recording_url,
      metadata
    FROM calls
    WHERE source = 'convoso'
      AND recording_url IS NOT NULL
      AND source_ref IS NOT NULL
    LIMIT 1
  `);

  await client.end();

  if (result.rows.length > 0) {
    return result.rows[0];
  }
  return null;
}

async function testLeadAPI(leadId) {
  console.log(`\n=== TESTING LEAD API WITH LEAD ${leadId} ===`);

  const params = new URLSearchParams({
    auth_token: authToken,
    lead_id: leadId.toString(),
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
        console.log(`✅ Found ${data.data.entries.length} recordings`);

        const firstRec = data.data.entries[0];
        console.log(`\nFirst recording structure:`);
        console.log(`  Available fields: ${Object.keys(firstRec).join(', ')}`);

        // Check for any field that might contain agent info
        const possibleAgentFields = [
          'agent_id', 'agent_name', 'agent', 'agent_email',
          'user_id', 'user_name', 'user', 'user_email',
          'User', 'UserID', 'UserName',
          'rep_id', 'rep_name', 'rep',
          'operator', 'operator_id', 'operator_name'
        ];

        console.log(`\nChecking for agent information:`);
        let foundAgentInfo = false;
        possibleAgentFields.forEach(field => {
          if (firstRec[field]) {
            console.log(`  ✅ ${field}: ${firstRec[field]}`);
            foundAgentInfo = true;
          }
        });

        if (!foundAgentInfo) {
          console.log(`  ❌ No agent information found in any field`);
        }

        return { hasAgentInfo: foundAgentInfo, data };
      } else {
        console.log(`❌ No recordings found for lead ${leadId}`);
        return { hasAgentInfo: false, data };
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
  return null;
}

async function testFilteringOptions() {
  console.log(`\n=== TESTING FILTERING OPTIONS ===`);

  // Test if we can filter by multiple parameters
  const testParams = [
    {
      desc: 'Lead + Date Range',
      params: {
        auth_token: authToken,
        lead_id: '103833',
        start_date: '2025-01-01',
        end_date: '2025-12-31'
      }
    },
    {
      desc: 'Lead + User',
      params: {
        auth_token: authToken,
        lead_id: '103833',
        user: 'Test Agent 4123'
      }
    },
    {
      desc: 'Lead + Agent ID',
      params: {
        auth_token: authToken,
        lead_id: '103833',
        agent_id: '4123'
      }
    }
  ];

  for (const test of testParams) {
    console.log(`\nTesting: ${test.desc}`);
    const params = new URLSearchParams(test.params);
    const url = `https://api.convoso.com/v1/leads/get-recordings?${params}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      console.log(`  Status: ${response.status}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          console.log(`  ✅ Request accepted`);
          console.log(`  Total results: ${data.data?.total || 0}`);
        } else {
          console.log(`  ❌ API error: ${data.text || data.message}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Network error: ${error.message}`);
    }
  }
}

// Main execution
console.log('=== COMPREHENSIVE CONVOSO API TEST ===\n');

// First, find a lead with a recording
const testData = await findTestData();
if (testData) {
  console.log('Found test data from database:');
  console.log(`  Lead ID: ${testData.lead_id}`);
  console.log(`  Agent: ${testData.agent_name}`);
  console.log(`  Has Recording: ${!!testData.recording_url}`);

  // Test the API with this lead
  const result = await testLeadAPI(testData.lead_id);

  // Summary
  console.log('\n=== SUMMARY ===');
  if (result?.hasAgentInfo) {
    console.log('✅ GOOD NEWS: Recordings include agent information!');
    console.log('   We CAN distinguish which agent made which recording.');
  } else {
    console.log('❌ PROBLEM: Recordings do NOT include agent information.');
    console.log('   We CANNOT tell which agent made which recording when multiple agents talk to the same lead.');
    console.log('\n   IMPLICATIONS:');
    console.log('   - Must fetch recordings by agent email/ID instead of lead_id');
    console.log('   - Then filter client-side for the specific lead');
    console.log('   - This is inefficient but necessary');
  }
} else {
  console.log('No recordings found in database to test with.');
}

// Test filtering options
await testFilteringOptions();

process.exit(0);