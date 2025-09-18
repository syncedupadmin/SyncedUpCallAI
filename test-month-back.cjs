// Test pulling recordings from a month back
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Go back one month
const now = new Date();
const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

console.log('Pulling Recordings from Past Month');
console.log('===================================');
console.log('Date Range:', formatDate(oneMonthAgo), 'to', formatDate(now));
console.log('Using lead_id="0" to get ALL recordings');
console.log('');

const params = new URLSearchParams({
  auth_token: AUTH_TOKEN,
  lead_id: '0',  // This gets ALL recordings
  date_from: formatDate(oneMonthAgo),
  date_to: formatDate(now),
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
      } else if (json.data && json.data.entries && Array.isArray(json.data.entries)) {
        const recordings = json.data.entries;

        console.log(`\n✅ SUCCESS! Found ${json.data.total} total recordings!`);
        console.log(`Retrieved ${recordings.length} recordings on this page\n`);
        console.log('═══════════════════════════════════════════════════');

        // Group recordings by date
        const byDate = {};
        recordings.forEach(rec => {
          const date = rec.start_time ? rec.start_time.split(' ')[0] : 'unknown';
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(rec);
        });

        // Show summary by date
        console.log('\nRecordings by Date:');
        console.log('-------------------');
        Object.keys(byDate).sort().reverse().forEach(date => {
          console.log(`${date}: ${byDate[date].length} recordings`);
        });

        // Show first few recordings
        console.log('\n═══════════════════════════════════════════════════');
        console.log('SAMPLE RECORDINGS:');
        console.log('═══════════════════════════════════════════════════');

        const toShow = Math.min(5, recordings.length);
        for (let i = 0; i < toShow; i++) {
          const rec = recordings[i];
          console.log(`\n${i + 1}. Recording ID: ${rec.recording_id}`);
          console.log('   Lead ID:', rec.lead_id);
          console.log('   Date/Time:', rec.start_time);
          console.log('   Duration:', rec.seconds, 'seconds');
          console.log('   Has URL:', rec.url ? '✓ Yes' : '✗ No');
        }

        // Find the oldest and newest recordings
        const sortedByTime = recordings.sort((a, b) =>
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );

        console.log('\n═══════════════════════════════════════════════════');
        console.log('TIME RANGE OF RECORDINGS:');
        console.log('═══════════════════════════════════════════════════');
        console.log('Oldest:', sortedByTime[0]?.start_time || 'N/A');
        console.log('Newest:', sortedByTime[sortedByTime.length - 1]?.start_time || 'N/A');

        console.log('\n═══════════════════════════════════════════════════');
        console.log('FINAL SUMMARY:');
        console.log('═══════════════════════════════════════════════════');
        console.log('✅ Total recordings found:', json.data.total);
        console.log('✅ Recordings retrieved:', recordings.length);
        console.log('✅ Recordings with URLs:', recordings.filter(r => r.url).length);
        console.log('✅ Date range searched:', formatDate(oneMonthAgo), 'to', formatDate(now));

        if (recordings.length === 0) {
          console.log('\n⚠️ No recordings in the past month');
        } else {
          console.log('\n🎯 CONFIRMED: Can pull recordings from the past month!');
        }
      } else {
        console.log('Unexpected response structure:');
        console.log(JSON.stringify(json, null, 2).substring(0, 1000));
      }
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
    }
  });
}).on('error', (err) => {
  console.error('❌ Request failed:', err);
});