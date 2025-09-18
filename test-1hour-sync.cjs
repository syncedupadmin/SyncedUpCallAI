// Test Convoso sync - 1 hour lookback to find recent recordings
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Format dates for 1 hour ago
const now = new Date();
const endTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

// 1 hour ago
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
const startTime = `${oneHourAgo.getFullYear()}-${String(oneHourAgo.getMonth() + 1).padStart(2, '0')}-${String(oneHourAgo.getDate()).padStart(2, '0')} ${String(oneHourAgo.getHours()).padStart(2, '0')}:${String(oneHourAgo.getMinutes()).padStart(2, '0')}:${String(oneHourAgo.getSeconds()).padStart(2, '0')}`;

const params = new URLSearchParams({
  auth_token: AUTH_TOKEN,
  start_time: startTime,
  end_time: endTime,
  limit: '10',
  offset: '0'
});

// Add wildcard user to get all users
params.append('user', '*');

const url = `https://api.convoso.com/v1/users/recordings?${params.toString()}`;

console.log('Testing Convoso API - 1 Hour Lookback');
console.log('================================================');
console.log('Start Time:', startTime);
console.log('End Time:', endTime);
console.log('');

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);

    try {
      const json = JSON.parse(data);

      if (json.success && json.data && json.data.entries && json.data.entries.length > 0) {
        console.log(`\n✅ SUCCESS! Found ${json.data.total} total recordings`);
        console.log(`Showing first ${json.data.entries.length} recordings:\n`);

        json.data.entries.forEach((rec, i) => {
          console.log(`${i + 1}. Recording ID: ${rec.recording_id}`);
          console.log(`   Lead ID: ${rec.lead_id}`);
          console.log(`   Agent: ${rec.agent_name || 'Unknown'}`);
          console.log(`   Phone: ${rec.phone_number || 'Unknown'}`);
          console.log(`   Start: ${rec.start_time}`);
          console.log(`   Duration: ${rec.seconds || 0} seconds`);
          console.log(`   URL: ${rec.url ? '✓ ' + rec.url : '✗ No URL'}`);
          console.log('');
        });

        // Show summary
        console.log('═══════════════════════════════════════════════');
        console.log('SUMMARY:');
        console.log(`Total recordings found: ${json.data.total}`);
        console.log(`Recordings with URLs: ${json.data.entries.filter(r => r.url).length}`);
        console.log(`Time range: 1 hour (${startTime} to ${endTime})`);
        console.log('\n✅ Recordings are available! Ready to sync to database.');
      } else if (json.success === false) {
        console.log('\n❌ API Error:', json.error || json.message || 'Unknown error');
        console.log('Full response:', JSON.stringify(json, null, 2));
      } else {
        console.log('\n⚠️ No recordings found in the last hour.');
      }
    } catch (e) {
      console.log('Error parsing response:', e.message);
      console.log('Raw Response:', data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.error('Error:', err);
});