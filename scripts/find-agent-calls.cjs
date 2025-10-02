require('dotenv').config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
const API_BASE = 'https://api.convoso.com/v1';

const endDate = new Date('2025-10-01');
const startDate = new Date('2025-10-01');
startDate.setDate(startDate.getDate() - 30);

const dateStart = startDate.toISOString().split('T')[0];
const dateEnd = endDate.toISOString().split('T')[0];

console.log(`Searching for agent calls from ${dateStart} to ${dateEnd}...\n`);

async function searchForAgentCalls() {
  let totalCalls = 0;
  let systemCalls = 0;
  let agentCalls = 0;
  const agentUserIds = new Set();
  let sampleAgentCall = null;

  // Fetch 5000 calls to find some agent calls
  for (let offset = 0; offset < 5000; offset += 1000) {
    const params = new URLSearchParams({
      auth_token: authToken,
      start: dateStart,
      end: dateEnd,
      limit: '1000',
      offset: String(offset),
      include_recordings: '1'
    });

    const response = await fetch(`${API_BASE}/log/retrieve?${params.toString()}`, {
      headers: { 'Accept': 'application/json' }
    });

    const data = await response.json();
    const calls = data.data?.results || [];

    if (calls.length === 0) break;

    totalCalls += calls.length;

    calls.forEach(call => {
      if (call.user_id === '666667' || call.user === 'System DID User') {
        systemCalls++;
      } else {
        agentCalls++;
        agentUserIds.add(call.user_id);
        if (!sampleAgentCall) {
          sampleAgentCall = call;
        }
      }
    });

    console.log(`Batch ${Math.floor(offset/1000) + 1}: ${calls.length} calls (${agentCalls} agent calls so far)`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('RESULTS:');
  console.log(`  Total calls: ${totalCalls}`);
  console.log(`  System calls (666667): ${systemCalls} (${Math.round(systemCalls/totalCalls*100)}%)`);
  console.log(`  Agent calls: ${agentCalls} (${Math.round(agentCalls/totalCalls*100)}%)`);
  console.log(`  Unique agent user_ids: ${agentUserIds.size}`);

  if (sampleAgentCall) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('SAMPLE AGENT CALL:');
    console.log(JSON.stringify(sampleAgentCall, null, 2));
  } else {
    console.log(`\n⚠️  NO AGENT CALLS FOUND in ${totalCalls} calls!`);
    console.log(`All calls are from System DID User (666667)`);
  }
}

searchForAgentCalls().catch(err => console.error('Error:', err));
