// Test Convoso sync directly - Single 15 minute pull
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Format dates for 15 minutes ago
const now = new Date();
const endTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

// 15 minutes ago
const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
const startTime = `${fifteenMinutesAgo.getFullYear()}-${String(fifteenMinutesAgo.getMonth() + 1).padStart(2, '0')}-${String(fifteenMinutesAgo.getDate()).padStart(2, '0')} ${String(fifteenMinutesAgo.getHours()).padStart(2, '0')}:${String(fifteenMinutesAgo.getMinutes()).padStart(2, '0')}:${String(fifteenMinutesAgo.getSeconds()).padStart(2, '0')}`;

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

console.log('Testing Convoso API - Single Pull (15 minute lookback)');
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

      if (json.success && json.data && json.data.entries) {
        console.log(`\nSuccess! Found ${json.data.total} total recordings`);
        console.log(`Showing ${json.data.entries.length} recordings:\n`);

        json.data.entries.forEach((rec, i) => {
          console.log(`${i + 1}. Recording ID: ${rec.recording_id}`);
          console.log(`   Lead ID: ${rec.lead_id}`);
          console.log(`   Agent: ${rec.agent_name || 'Unknown'}`);
          console.log(`   Start: ${rec.start_time}`);
          console.log(`   Duration: ${rec.seconds || 0} seconds`);
          console.log(`   URL: ${rec.url ? '✓ Has recording URL' : '✗ No URL'}`);
          console.log('');
        });

        // Show summary
        console.log('Summary:');
        console.log(`- Total recordings found: ${json.data.total}`);
        console.log(`- Recordings with URLs: ${json.data.entries.filter(r => r.url).length}`);
        console.log(`- Time range: 15 minutes`);
        console.log('\n✅ Ready to sync to database!');
      } else {
        console.log('\nNo recordings found in the last 15 minutes.');
        console.log('This could mean:');
        console.log('1. No calls were made in this time period');
        console.log('2. Recordings are still processing');
        console.log('3. The user parameter needs to be a specific email');
      }
    } catch (e) {
      console.log('Error parsing response:', e.message);
      console.log('Raw Response:', data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.error('Error:', err);
});