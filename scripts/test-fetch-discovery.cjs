require('dotenv').config({ path: '.env.local' });

// CRITICAL: Use correct current date (2025-10-01, NOT future dates)
const endDate = new Date('2025-10-01');
const startDate = new Date('2025-10-01');
startDate.setDate(startDate.getDate() - 30);

const dateStart = startDate.toISOString().split('T')[0];
const dateEnd = endDate.toISOString().split('T')[0];

const authToken = process.env.CONVOSO_AUTH_TOKEN;
if (!authToken) {
  console.error('CONVOSO_AUTH_TOKEN not set');
  process.exit(1);
}

console.log(`Fetching calls from ${dateStart} to ${dateEnd}...`);
console.log(`(Using Oct 1, 2025 as "today" per system context)\n`);

// Test pagination to find target agents
const targetAgents = ['1110461', '1203498', '1110456'];
let totalCalls = 0;
let totalTenSecPlus = 0;
let totalWithRecordings = 0;
let foundTargetAgents = {};

async function fetchBatch(offset) {
  const params = new URLSearchParams({
    auth_token: authToken,
    start: dateStart,
    end: dateEnd,
    limit: '1000',
    offset: String(offset),
    include_recordings: '1'
  });

  const response = await fetch(`https://api.convoso.com/v1/log/retrieve?${params.toString()}`, {
    headers: { 'Accept': 'application/json' }
  });

  const data = await response.json();
  const calls = data.data?.results || [];

  totalCalls += calls.length;

  const tenSecPlus = calls.filter(c => parseInt(c.call_length) >= 10);
  totalTenSecPlus += tenSecPlus.length;

  const withRecordings = tenSecPlus.filter(c => c.recording?.[0]?.public_url || c.recording?.[0]?.src);
  totalWithRecordings += withRecordings.length;

  // Count target agents
  calls.forEach(c => {
    const userId = String(c.user_id);
    if (targetAgents.includes(userId)) {
      foundTargetAgents[userId] = (foundTargetAgents[userId] || 0) + 1;
    }
  });

  console.log(`Batch at offset ${offset}: ${calls.length} calls, ${tenSecPlus.length} (10+ sec), ${withRecordings.length} with recordings`);

  return calls.length;
}

async function run() {
  // Fetch first 5000 calls across 5 batches
  for (let i = 0; i < 5; i++) {
    const count = await fetchBatch(i * 1000);
    if (count === 0) break;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total calls fetched: ${totalCalls}`);
  console.log(`10+ seconds: ${totalTenSecPlus}`);
  console.log(`With recordings: ${totalWithRecordings}`);

  console.log(`\nTarget agents found:`);
  targetAgents.forEach(agentId => {
    const count = foundTargetAgents[agentId] || 0;
    console.log(`  Agent ${agentId}: ${count} calls`);
  });

  const targetCallsTotal = Object.values(foundTargetAgents).reduce((a, b) => a + b, 0);
  console.log(`\nTotal calls from target agents: ${targetCallsTotal}`);

  if (totalTenSecPlus >= 2500) {
    console.log(`\n✅ SUCCESS: Found ${totalTenSecPlus} calls (10+ sec), enough for 2500 target`);
  } else {
    console.log(`\n⚠️  Only ${totalTenSecPlus} calls (10+ sec), need 2500+`);
  }
}

run().catch(err => console.error('Error:', err));
