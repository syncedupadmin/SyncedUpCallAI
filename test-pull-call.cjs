// Test pulling calls with the correct endpoint
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Get calls from the last 7 days
const now = new Date();
const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

// Format as YYYY-MM-DD (required format)
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

const params = new URLSearchParams({
  auth_token: AUTH_TOKEN,
  date_from: formatDate(sevenDaysAgo),  // YYYY-MM-DD format
  date_to: formatDate(now),              // YYYY-MM-DD format
  limit: '10'
});

const url = `https://api.convoso.com/v1/leads/get-recordings?${params.toString()}`;

console.log('Pulling Calls from Convoso');
console.log('===========================');
console.log('Date Range:', formatDate(sevenDaysAgo), 'to', formatDate(now));
console.log('Endpoint: /leads/get-recordings');
console.log('');

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);

    if (res.statusCode !== 200) {
      console.log('❌ API Error - Status:', res.statusCode);
      console.log('Response:', data.substring(0, 500));
      return;
    }

    try {
      const json = JSON.parse(data);

      if (json.recordings && json.recordings.length > 0) {
        console.log(`\n✅ SUCCESS! Found ${json.recordings.length} recordings\n`);
        console.log('═══════════════════════════════════════════════════');

        json.recordings.forEach((rec, i) => {
          console.log(`\n${i + 1}. CALL DETAILS:`);
          console.log('   ID:', rec.id || rec.recording_id);
          console.log('   Lead ID:', rec.lead_id);
          console.log('   Agent:', rec.agent || rec.agent_name || 'Unknown');
          console.log('   Phone:', rec.phone || rec.phone_number);
          console.log('   Date:', rec.date || rec.created_at);
          console.log('   Duration:', rec.duration || 0, 'seconds');
          console.log('   Disposition:', rec.disposition || 'N/A');
          console.log('   Campaign:', rec.campaign || 'N/A');
          console.log('   Recording URL:', rec.url || rec.recording_url ? '✓ Available' : '✗ Not available');

          if (rec.url || rec.recording_url) {
            console.log('   📞 URL:', rec.url || rec.recording_url);
          }
        });

        console.log('\n═══════════════════════════════════════════════════');
        console.log('SUMMARY:');
        console.log(`Total recordings: ${json.recordings.length}`);
        console.log(`With URLs: ${json.recordings.filter(r => r.url || r.recording_url).length}`);
        console.log('\n✅ Calls pulled successfully!');

        // Save first call to database
        if (json.recordings.length > 0) {
          const firstCall = json.recordings[0];
          console.log('\n📌 First call ready to save:');
          console.log('   call_id:', `convoso_${firstCall.id || firstCall.recording_id}`);
          console.log('   lead_id:', firstCall.lead_id);
          console.log('   recording_url:', firstCall.url || firstCall.recording_url);
        }
      } else {
        console.log('\n⚠️ No recordings found in date range');
        console.log('Response structure:', Object.keys(json));

        // Try to understand the response
        console.log('Full response:', JSON.stringify(json, null, 2));
        if (json.success === false) {
          console.log('API returned failure:', json.text || json.message || json.error);
        } else if (json.data) {
          console.log('Has data field:', Object.keys(json.data));
        }
      }
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
      console.log('Raw response:', data.substring(0, 1000));
    }
  });
}).on('error', (err) => {
  console.error('❌ Request failed:', err.message);
});