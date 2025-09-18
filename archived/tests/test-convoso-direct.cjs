// Direct test of Convoso API
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Format current date and time
const now = new Date();
const endTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

// 24 hours ago
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const startTime = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')} ${String(yesterday.getHours()).padStart(2, '0')}:${String(yesterday.getMinutes()).padStart(2, '0')}:${String(yesterday.getSeconds()).padStart(2, '0')}`;

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

console.log('Testing Convoso API...');
console.log('URL:', url);
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
    console.log('Headers:', res.headers);
    console.log('');

    try {
      const json = JSON.parse(data);
      console.log('Response:', JSON.stringify(json, null, 2));

      if (json.success && json.data && json.data.entries) {
        console.log(`\nFound ${json.data.total} total recordings`);
        console.log(`Showing ${json.data.entries.length} recordings:\n`);

        json.data.entries.forEach((rec, i) => {
          console.log(`${i + 1}. Recording ID: ${rec.recording_id}`);
          console.log(`   Lead ID: ${rec.lead_id}`);
          console.log(`   Start: ${rec.start_time}`);
          console.log(`   URL: ${rec.url}`);
          console.log('');
        });
      }
    } catch (e) {
      console.log('Raw Response:', data);
    }
  });
}).on('error', (err) => {
  console.error('Error:', err);
});