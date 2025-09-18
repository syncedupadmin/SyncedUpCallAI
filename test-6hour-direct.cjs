// Direct test of Convoso API - Pull from 6 hours ago
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Format current date and time
const now = new Date();
const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);

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

const startTime = formatDateTime(sixHoursAgo);
const endTime = formatDateTime(fiveHoursAgo);

const params = new URLSearchParams({
  auth_token: AUTH_TOKEN,
  start_time: startTime,
  end_time: endTime,
  limit: '1',
  offset: '0'
});

// Add wildcard user parameter
params.append('user', '*');

// Use the /users/recordings endpoint which we know exists
const url = `https://api.convoso.com/v1/users/recordings?${params.toString()}`;

console.log('Pulling Recording from 6 Hours Ago');
console.log('===================================');
console.log('Start Time:', startTime);
console.log('End Time:', endTime);
console.log('');

https.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('API Response Status:', res.statusCode);

    try {
      const json = JSON.parse(data);

      // Check different response structures
      if (json.success === false) {
        console.log('❌ API Error:', json.text || json.error || json.message);

        // If it's a user error, try without user parameter
        if (json.text && json.text.includes('No such User')) {
          console.log('\nRetrying without user parameter...\n');

          // Remove user parameter and try again
          const params2 = new URLSearchParams({
            auth_token: AUTH_TOKEN,
            start_time: startTime,
            end_time: endTime,
            limit: '1',
            offset: '0'
          });

          const url2 = `https://api.convoso.com/v1/users/recordings?${params2.toString()}`;

          https.get(url2, (res2) => {
            let data2 = '';
            res2.on('data', (chunk) => data2 += chunk);
            res2.on('end', () => {
              try {
                const json2 = JSON.parse(data2);
                handleResponse(json2);
              } catch (e) {
                console.log('Error:', e.message);
              }
            });
          }).on('error', console.error);
        }
      } else {
        handleResponse(json);
      }
    } catch (e) {
      console.log('Raw Response:', data.substring(0, 500));
    }
  });
}).on('error', console.error);

function handleResponse(json) {
  if (json.success && json.data && json.data.entries && json.data.entries.length > 0) {
    const rec = json.data.entries[0];

    console.log('✅ FOUND A RECORDING!');
    console.log('====================');
    console.log('Recording ID:', rec.recording_id);
    console.log('Lead ID:', rec.lead_id);
    console.log('Agent:', rec.agent_name || 'Unknown');
    console.log('Phone:', rec.phone_number);
    console.log('Start Time:', rec.start_time);
    console.log('Duration:', rec.seconds || 0, 'seconds');
    console.log('Recording URL:', rec.url || 'No URL');
    console.log('');

    if (rec.url) {
      console.log('📞 This recording is ready for processing!');
      console.log('URL:', rec.url);
      console.log('');
      console.log('Next Steps:');
      console.log('1. Save to database');
      console.log('2. Queue for transcription');
      console.log('3. Process with AI analysis');
    } else {
      console.log('⚠️ No recording URL available');
    }
  } else if (json.data && json.data.total === 0) {
    console.log('⚠️ No recordings found in the 6-hour window');
    console.log('');
    console.log('Possible reasons:');
    console.log('1. No calls were made during this time');
    console.log('2. Recordings are still processing');
    console.log('3. Need to use a different time window');
    console.log('');
    console.log('Try expanding the time range or checking a different period.');
  } else {
    console.log('Unexpected response structure:', JSON.stringify(json, null, 2).substring(0, 500));
  }
}