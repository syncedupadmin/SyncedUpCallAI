// Pull recordings from August 17, 2025
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Specific date: August 17, 2025
const targetDate = '2025-08-17';
const nextDay = '2025-08-18';

console.log('Pulling Recordings from August 17, 2025');
console.log('========================================');
console.log('Date Range:', targetDate, 'to', nextDay);
console.log('Using lead_id="0" to get ALL recordings');
console.log('');

const params = new URLSearchParams({
  auth_token: AUTH_TOKEN,
  lead_id: '0',  // Get ALL recordings
  date_from: targetDate,
  date_to: nextDay,
  limit: '100'  // Get up to 100 recordings
});

const url = `https://api.convoso.com/v1/leads/get-recordings?${params.toString()}`;

console.log('Calling API...\n');

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);

    if (res.statusCode !== 200) {
      console.log('❌ HTTP Error:', res.statusCode);
      return;
    }

    try {
      const json = JSON.parse(data);

      if (json.success === false) {
        console.log('❌ API Error:', json.text || json.error || json.message);
        console.log('Error Code:', json.code);
        return;
      }

      if (json.data && json.data.entries) {
        const recordings = json.data.entries;

        if (recordings.length === 0) {
          console.log('⚠️ No recordings found on August 17, 2025');
          console.log('\nThis could mean:');
          console.log('1. No calls were made on that date');
          console.log('2. Recordings were purged (old data)');
          console.log('3. The account was not active on that date');
        } else {
          console.log(`✅ FOUND ${recordings.length} recordings from August 17, 2025!\n`);
          console.log('═══════════════════════════════════════════════════');
          console.log('COMPLETE DATA FROM AUGUST 17, 2025:');
          console.log('═══════════════════════════════════════════════════\n');

          // Show first recording with ALL fields
          const rec = recordings[0];

          console.log('FIRST RECORDING - ALL DATA FIELDS:');
          console.log('===================================');
          Object.keys(rec).forEach(key => {
            const value = rec[key];
            const displayValue = typeof value === 'string' && value.length > 100
              ? value.substring(0, 80) + '...'
              : value;
            console.log(`${key}: ${displayValue}`);
          });

          console.log('\n═══════════════════════════════════════════════════');
          console.log('SUMMARY OF ALL RECORDINGS FROM AUG 17:');
          console.log('═══════════════════════════════════════════════════\n');

          // Show all recordings
          recordings.forEach((rec, i) => {
            console.log(`${i + 1}. Recording ID: ${rec.recording_id}`);
            console.log(`   Lead ID: ${rec.lead_id}`);
            console.log(`   Time: ${rec.start_time} to ${rec.end_time}`);
            console.log(`   Duration: ${rec.seconds} seconds`);
            console.log(`   Has URL: ${rec.url ? '✓ Yes' : '✗ No'}`);
            console.log('');
          });

          console.log('═══════════════════════════════════════════════════');
          console.log('DATA AVAILABLE FOR AUGUST 17 RECORDINGS:');
          console.log('═══════════════════════════════════════════════════');
          console.log('✅ Recording ID');
          console.log('✅ Lead ID');
          console.log('✅ Start Time');
          console.log('✅ End Time');
          console.log('✅ Duration (seconds)');
          console.log('✅ Recording URL');
          console.log('');
          console.log('❌ NOT Available:');
          console.log('- Agent Name');
          console.log('- Customer Name');
          console.log('- Phone Number');
          console.log('- Disposition');
          console.log('- Campaign');
        }
      } else {
        console.log('Unexpected response structure');
      }
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
    }
  });
}).on('error', console.error);