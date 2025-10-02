require('dotenv').config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
const API_BASE = 'https://api.convoso.com/v1';

const endDate = new Date('2025-10-01');
const startDate = new Date('2025-10-01');
startDate.setDate(startDate.getDate() - 30);

const dateStart = startDate.toISOString().split('T')[0];
const dateEnd = endDate.toISOString().split('T')[0];

console.log(`Finding REAL agent calls (not system 666666/666667)...\n`);

async function findRealAgentCalls() {
  const realAgentCalls = [];
  const agentUserIds = new Set();

  // Fetch calls and filter for real agents
  for (let offset = 0; offset < 2000; offset += 1000) {
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

    // Filter for REAL agents (not system users)
    calls.forEach(call => {
      if (call.user_id !== '666666' && call.user_id !== '666667' && call.user_id) {
        realAgentCalls.push(call);
        agentUserIds.add(call.user_id);
      }
    });

    console.log(`Batch ${Math.floor(offset/1000) + 1}: Found ${realAgentCalls.length} real agent calls`);
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log(`FOUND ${realAgentCalls.length} real agent calls`);
  console.log(`Unique real agent user_ids: ${agentUserIds.size}`);
  console.log(`Agent IDs: ${[...agentUserIds].slice(0, 10).join(', ')}${agentUserIds.size > 10 ? '...' : ''}`);

  if (realAgentCalls.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('SAMPLE REAL AGENT CALLS:\n');

    realAgentCalls.slice(0, 3).forEach((call, i) => {
      console.log(`Call ${i + 1}:`);
      console.log(`  ID: ${call.id}`);
      console.log(`  lead_id: ${call.lead_id || 'NULL'}`);
      console.log(`  user_id: ${call.user_id}`);
      console.log(`  user: ${call.user}`);
      console.log(`  campaign: ${call.campaign}`);
      console.log(`  call_length: ${call.call_length}`);
      console.log(`  call_type: ${call.call_type}`);
      console.log(`  status: ${call.status} (${call.status_name})`);
      console.log(`  recording: ${call.recording?.length || 0} recordings`);
      console.log('');
    });

    // Check for null lead_ids
    const nullLeadIds = realAgentCalls.filter(c => !c.lead_id || c.lead_id === null || c.lead_id === '');
    console.log(`${'='.repeat(80)}`);
    console.log(`Calls with NULL lead_id: ${nullLeadIds.length} / ${realAgentCalls.length} (${Math.round(nullLeadIds/realAgentCalls.length*100)}%)`);
  }
}

findRealAgentCalls().catch(err => console.error('Error:', err));
