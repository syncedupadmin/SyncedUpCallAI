// Test pulling with lead_id = "0"
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Format dates
const now = new Date();
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

console.log('Testing with lead_id = "0"');
console.log('===========================');
console.log('Date Range:', formatDate(sevenDaysAgo), 'to', formatDate(now));
console.log('');

// Test with lead_id = 0
const params = new URLSearchParams({
  auth_token: AUTH_TOKEN,
  lead_id: '0',  // Using "0" as lead_id
  date_from: formatDate(sevenDaysAgo),
  date_to: formatDate(now),
  limit: '100'
});

const url = `https://api.convoso.com/v1/leads/get-recordings?${params.toString()}`;

console.log('URL:', url);
console.log('');

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);

    try {
      const json = JSON.parse(data);

      if (json.success === false) {
        console.log('❌ API Error:', json.text || json.error || json.message);
        console.log('Error Code:', json.code);
      } else if (json.data && json.data.entries && Array.isArray(json.data.entries)) {
        console.log(`\n✅ SUCCESS! Found ${json.data.total} total recordings!`);
        console.log(`Showing ${json.data.entries.length} on this page\n`);
        console.log('═══════════════════════════════════════════════════');

        // Show first 5 recordings
        const recordings = json.data.entries;
        const toShow = Math.min(5, recordings.length);
        for (let i = 0; i < toShow; i++) {
          const rec = recordings[i];
          console.log(`\n${i + 1}. Recording:`);
          console.log('   Recording ID:', rec.recording_id);
          console.log('   Lead ID:', rec.lead_id);
          console.log('   Start:', rec.start_time);
          console.log('   End:', rec.end_time);
          console.log('   Duration:', rec.seconds, 'seconds');
          console.log('   URL:', rec.url ? '✓ Available' : '✗ Not available');
          if (rec.url) {
            console.log('   📞 URL:', rec.url.substring(0, 80) + '...');
          }
        }

        if (recordings.length > 5) {
          console.log(`\n... and ${recordings.length - 5} more recordings on this page`);
        }

        console.log('\n═══════════════════════════════════════════════════');
        console.log('SUMMARY:');
        console.log('Total recordings in system:', json.data.total);
        console.log('Recordings on this page:', recordings.length);
        console.log('Recordings with URLs:', recordings.filter(r => r.url).length);
        console.log('\n🎯 Using lead_id="0" WORKS! It returns ALL recordings!');
        console.log('The response is in data.entries, not recordings');
      } else if (json.recordings && Array.isArray(json.recordings)) {
        console.log(`\n✅ Found ${json.recordings.length} recordings in json.recordings`);
      } else {
        console.log('Unexpected response structure:');
        console.log(JSON.stringify(json, null, 2).substring(0, 500));
      }
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
      console.log('Raw response:', data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.error('❌ Request failed:', err);
});