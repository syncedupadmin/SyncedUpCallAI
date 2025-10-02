require('dotenv').config({ path: '.env.local' });

const authToken = process.env.CONVOSO_AUTH_TOKEN;
const API_BASE = 'https://api.convoso.com/v1';

const endDate = new Date('2025-10-01');
const startDate = new Date('2025-10-01');
startDate.setDate(startDate.getDate() - 30);

const dateStart = startDate.toISOString().split('T')[0];
const dateEnd = endDate.toISOString().split('T')[0];

async function checkRecordingStructure() {
  console.log('Checking recording structure in API response...\n');

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

  // Find calls with recordings
  const callsWithRecordings = calls.filter(c =>
    c.recording && Array.isArray(c.recording) && c.recording.length > 0
  );

  console.log(`Total calls: ${calls.length}`);
  console.log(`Calls with recording array: ${callsWithRecordings.length}`);
  console.log(`Calls with empty recording: ${calls.filter(c => !c.recording || c.recording.length === 0).length}\n`);

  if (callsWithRecordings.length > 0) {
    const sample = callsWithRecordings[0];
    console.log('Sample call with recording:');
    console.log('  Call ID:', sample.id);
    console.log('  Lead ID:', sample.lead_id);
    console.log('  User:', sample.user);
    console.log('  Call Length:', sample.call_length);
    console.log('  Recording Array Length:', sample.recording.length);
    console.log('\n  Recording Object:');
    console.log(JSON.stringify(sample.recording[0], null, 4));

    // Test extraction
    const url = sample.recording?.[0]?.public_url || sample.recording?.[0]?.src || null;
    console.log('\n  Extracted URL:', url || 'NULL');

    // Check all fields
    console.log('\n  Available fields in recording[0]:');
    Object.keys(sample.recording[0]).forEach(key => {
      console.log(`    ${key}: ${sample.recording[0][key]}`);
    });
  } else {
    console.log('❌ NO CALLS WITH RECORDINGS FOUND!');
    console.log('\nSample call without recording:');
    console.log(JSON.stringify(calls[0], null, 2));
  }
}

checkRecordingStructure().catch(err => console.error('Error:', err));
