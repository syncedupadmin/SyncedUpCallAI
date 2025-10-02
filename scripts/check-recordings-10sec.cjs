require('dotenv').config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
const API_BASE = 'https://api.convoso.com/v1';

const endDate = new Date('2025-10-01');
const startDate = new Date('2025-10-01');
startDate.setDate(startDate.getDate() - 30);

const dateStart = startDate.toISOString().split('T')[0];
const dateEnd = endDate.toISOString().split('T')[0];

async function checkRecordingsFor10SecCalls() {
  console.log('Checking for recordings in 10+ second calls...\n');

  let totalCalls = 0;
  let callsWith10Sec = 0;
  let callsWith10SecAndRecordings = 0;

  // Fetch 2000 calls
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

    totalCalls += calls.length;

    calls.forEach(call => {
      const duration = parseInt(call.call_length) || 0;
      if (duration >= 10) {
        callsWith10Sec++;
        if (call.recording && call.recording.length > 0) {
          callsWith10SecAndRecordings++;

          // Show first sample
          if (callsWith10SecAndRecordings === 1) {
            console.log('✓ FOUND CALL WITH RECORDING!\n');
            console.log('Call ID:', call.id);
            console.log('Lead ID:', call.lead_id);
            console.log('Duration:', call.call_length, 'seconds');
            console.log('User:', call.user);
            console.log('Recording Array:');
            console.log(JSON.stringify(call.recording, null, 2));

            const url = call.recording?.[0]?.public_url || call.recording?.[0]?.src || null;
            console.log('\nExtracted URL:', url || 'NULL');
            console.log('\n' + '='.repeat(80) + '\n');
          }
        }
      }
    });

    console.log(`Batch ${Math.floor(offset/1000) + 1}: ${callsWith10Sec} calls (10+ sec), ${callsWith10SecAndRecordings} with recordings`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY:');
  console.log(`  Total calls: ${totalCalls}`);
  console.log(`  Calls 10+ sec: ${callsWith10Sec}`);
  console.log(`  Calls 10+ sec WITH recordings: ${callsWith10SecAndRecordings}`);
  console.log(`  Recording rate: ${callsWith10Sec > 0 ? Math.round(callsWith10SecAndRecordings/callsWith10Sec*100) : 0}%`);
}

checkRecordingsFor10SecCalls().catch(err => console.error('Error:', err));
