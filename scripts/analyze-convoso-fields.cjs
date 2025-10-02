require('dotenv').config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
if (!authToken) {
  console.error('CONVOSO_AUTH_TOKEN not set');
  process.exit(1);
}

const API_BASE = 'https://api.convoso.com/v1';

// Use correct date (2025-10-01 as "today")
const endDate = new Date('2025-10-01');
const startDate = new Date('2025-10-01');
startDate.setDate(startDate.getDate() - 30);

const dateStart = startDate.toISOString().split('T')[0];
const dateEnd = endDate.toISOString().split('T')[0];

console.log('='.repeat(80));
console.log('CONVOSO API FIELD ANALYSIS');
console.log('='.repeat(80));
console.log(`Date range: ${dateStart} to ${dateEnd}\n`);

async function fetchAgents() {
  console.log('--- STEP 1: Fetching Agents from /agent-performance/search ---\n');

  const params = new URLSearchParams({
    auth_token: authToken,
    date_start: dateStart,
    date_end: dateEnd
  });

  const response = await fetch(`${API_BASE}/agent-performance/search?${params.toString()}`, {
    headers: { 'Accept': 'application/json' }
  });

  const data = await response.json();

  if (!data.success || !data.data) {
    console.error('Agent fetch failed:', data);
    return [];
  }

  // Convert object to array
  const agents = Object.values(data.data);
  console.log(`✓ Found ${agents.length} agents\n`);

  // Show sample agents
  console.log('Sample agents (first 3):');
  agents.slice(0, 3).forEach((agent, i) => {
    console.log(`\nAgent ${i + 1}:`);
    console.log(JSON.stringify(agent, null, 2));
  });

  return agents;
}

async function fetchCalls() {
  console.log('\n' + '='.repeat(80));
  console.log('--- STEP 2: Fetching Calls from /log/retrieve ---\n');

  const params = new URLSearchParams({
    auth_token: authToken,
    start: dateStart,
    end: dateEnd,
    limit: '100',
    offset: '0',
    include_recordings: '1'
  });

  const response = await fetch(`${API_BASE}/log/retrieve?${params.toString()}`, {
    headers: { 'Accept': 'application/json' }
  });

  const data = await response.json();
  const calls = data.data?.results || [];

  console.log(`✓ Found ${calls.length} calls\n`);

  // Show sample calls
  console.log('Sample calls (first 2):');
  calls.slice(0, 2).forEach((call, i) => {
    console.log(`\nCall ${i + 1}:`);
    console.log(JSON.stringify(call, null, 2));
  });

  return calls;
}

async function analyzeFields(agents, calls) {
  console.log('\n' + '='.repeat(80));
  console.log('--- STEP 3: Field Analysis ---\n');

  // Analyze null values in calls
  let nullLeadId = 0;
  let nullUserId = 0;
  let nullUser = 0;
  const userIdValues = new Set();
  const userValues = new Set();

  calls.forEach(call => {
    if (!call.lead_id || call.lead_id === null || call.lead_id === '') {
      nullLeadId++;
    }
    if (!call.user_id || call.user_id === null || call.user_id === '') {
      nullUserId++;
    }
    if (!call.user || call.user === null || call.user === '') {
      nullUser++;
    }
    if (call.user_id) userIdValues.add(String(call.user_id));
    if (call.user) userValues.add(call.user);
  });

  console.log('NULL VALUE STATISTICS:');
  console.log(`  Calls with null lead_id: ${nullLeadId} / ${calls.length} (${Math.round(nullLeadId/calls.length*100)}%)`);
  console.log(`  Calls with null user_id: ${nullUserId} / ${calls.length} (${Math.round(nullUserId/calls.length*100)}%)`);
  console.log(`  Calls with null user: ${nullUser} / ${calls.length} (${Math.round(nullUser/calls.length*100)}%)`);
  console.log(`  Unique user_id values in calls: ${userIdValues.size}`);
  console.log(`  Unique user values in calls: ${userValues.size}`);

  // Try to match agents to calls
  console.log('\n' + '-'.repeat(80));
  console.log('AGENT MATCHING ANALYSIS:\n');

  const agentUserIds = new Set(agents.map(a => String(a.user_id)));
  const agentUsernames = new Set(agents.map(a => a.username));
  const agentEmails = new Set(agents.filter(a => a.email).map(a => a.email));

  console.log(`Agent user_id values: ${agentUserIds.size}`);
  console.log(`Agent username values: ${agentUsernames.size}`);
  console.log(`Agent email values: ${agentEmails.size}`);

  // Check overlap
  const userIdMatches = [...userIdValues].filter(id => agentUserIds.has(id));
  const userMatches = [...userValues].filter(u => agentUsernames.has(u));

  console.log(`\nMATCH RESULTS:`);
  console.log(`  Calls with user_id matching agent user_id: ${userIdMatches.length} / ${userIdValues.size}`);
  console.log(`  Calls with user matching agent username: ${userMatches.length} / ${userValues.size}`);

  // Show examples of matching
  if (userIdMatches.length > 0) {
    console.log(`\n  Example user_id matches: ${userIdMatches.slice(0, 5).join(', ')}`);
  }
  if (userMatches.length > 0) {
    console.log(`  Example user matches: ${userMatches.slice(0, 5).join(', ')}`);
  }

  // Find calls with missing lead_id and show details
  if (nullLeadId > 0) {
    console.log('\n' + '-'.repeat(80));
    console.log('SAMPLE CALLS WITH NULL lead_id:\n');
    const nullLeadCalls = calls.filter(c => !c.lead_id || c.lead_id === null || c.lead_id === '');
    nullLeadCalls.slice(0, 3).forEach((call, i) => {
      console.log(`Call ${i + 1} (null lead_id):`);
      console.log(`  call_id: ${call.id}`);
      console.log(`  user_id: ${call.user_id}`);
      console.log(`  user: ${call.user}`);
      console.log(`  campaign: ${call.campaign}`);
      console.log(`  status: ${call.status}`);
      console.log(`  call_length: ${call.call_length}`);
      console.log(`  lead_id: ${call.lead_id} (NULL)\n`);
    });
  }
}

async function run() {
  try {
    const agents = await fetchAgents();
    const calls = await fetchCalls();

    if (agents.length > 0 && calls.length > 0) {
      await analyzeFields(agents, calls);
    }

    console.log('\n' + '='.repeat(80));
    console.log('ANALYSIS COMPLETE');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
