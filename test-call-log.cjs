// Test the CORRECT Convoso API endpoint: /reports/call-log
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Look back 15 minutes as requested
const now = new Date();
const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);

// Format for API
const formatDateTime = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const params = new URLSearchParams({
  auth_token: AUTH_TOKEN,
  start_date: formatDateTime(fifteenMinutesAgo),  // call-log uses start_date
  end_date: formatDateTime(now),                   // call-log uses end_date
  limit: '10',
  offset: '0'
});

const url = `https://api.convoso.com/v1/reports/call-log?${params.toString()}`;

console.log('Testing Convoso Call-Log API (15 minute lookback)');
console.log('=================================================');
console.log('Start Date:', formatDateTime(fifteenMinutesAgo));
console.log('End Date:', formatDateTime(now));
console.log('');
console.log('URL:', url);
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

      if (json.success === false) {
        console.log('❌ API Error:', json.text || json.error || json.message || 'Unknown error');
        console.log('Full response:', JSON.stringify(json, null, 2));
        return;
      }

      if (json.data && json.data.entries && json.data.entries.length > 0) {
        console.log(`\n✅ SUCCESS! Found ${json.data.total} total calls`);
        console.log(`Showing ${json.data.entries.length} calls:\n`);
        console.log('══════════════════════════════════════════════');

        json.data.entries.forEach((call, i) => {
          console.log(`\n${i + 1}. COMPLETE CALL DATA:`);
          console.log('   Call ID:', call.call_id);
          console.log('   Lead ID:', call.lead_id, '(Real ID!)');
          console.log('   Agent:', call.agent_name, `(ID: ${call.agent_id})`);
          console.log('   Customer:', `${call.first_name} ${call.last_name}`);
          console.log('   Phone:', call.phone_number);
          console.log('   Email:', call.email || 'N/A');
          console.log('   Disposition:', call.disposition);
          console.log('   Duration:', call.duration, 'seconds');
          console.log('   Talk Time:', call.talk_time, 'seconds');
          console.log('   Start:', call.call_start);
          console.log('   End:', call.call_end);
          console.log('   Campaign:', call.campaign);
          console.log('   Recording URL:', call.recording_url ? '✓ Available' : '✗ Not available');

          if (call.recording_url) {
            console.log('   📞 URL:', call.recording_url);
          }
        });

        console.log('\n══════════════════════════════════════════════');
        console.log('SUMMARY:');
        console.log(`Total calls found: ${json.data.total}`);
        console.log(`Calls with recordings: ${json.data.entries.filter(c => c.recording_url).length}`);
        console.log('\n✅ Ready to sync to database with COMPLETE data!');
        console.log('Each call has: lead_id, agent info, customer info, disposition, recording URL');
      } else {
        console.log('\n⚠️ No calls found in the last 15 minutes');
        console.log('Expanding search to last hour...\n');

        // Try again with 1 hour
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const params2 = new URLSearchParams({
          auth_token: AUTH_TOKEN,
          start_date: formatDateTime(oneHourAgo),
          end_date: formatDateTime(now),
          limit: '10',
          offset: '0'
        });

        const url2 = `https://api.convoso.com/v1/reports/call-log?${params2.toString()}`;

        https.get(url2, (res2) => {
          let data2 = '';
          res2.on('data', (chunk) => data2 += chunk);
          res2.on('end', () => {
            try {
              const json2 = JSON.parse(data2);
              if (json2.data && json2.data.entries && json2.data.entries.length > 0) {
                console.log(`✅ Found ${json2.data.total} calls in the last hour!`);
                const call = json2.data.entries[0];
                console.log('\nSample call:');
                console.log(`Call ID: ${call.call_id}, Lead: ${call.lead_id}, Agent: ${call.agent_name}`);
                console.log(`Customer: ${call.first_name} ${call.last_name}, Phone: ${call.phone_number}`);
              } else {
                console.log('No calls found in the last hour either.');
              }
            } catch (e) {
              console.log('Error:', e.message);
            }
          });
        }).on('error', console.error);
      }
    } catch (e) {
      console.log('Error parsing response:', e.message);
      console.log('Raw Response:', data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.error('Error:', err);
});