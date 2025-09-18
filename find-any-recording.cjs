// Find ANY recording in the last 24 hours to process
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Try multiple time windows to find recordings
const timeWindows = [
  { hours: 1, label: 'Last Hour' },
  { hours: 6, label: 'Last 6 Hours' },
  { hours: 12, label: 'Last 12 Hours' },
  { hours: 24, label: 'Last 24 Hours' },
  { hours: 48, label: 'Last 48 Hours' }
];

console.log('Searching for ANY Available Recording');
console.log('=====================================\n');

async function tryTimeWindow(hoursAgo, label) {
  return new Promise((resolve) => {
    const now = new Date();
    const startTime = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);

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
      start_time: formatDateTime(startTime),
      end_time: formatDateTime(now),
      limit: '5',
      offset: '0'
    });

    // Try the /lead/get-recordings endpoint (singular)
    const url = `https://api.convoso.com/v1/lead/get-recordings?${params.toString()}`;

    console.log(`Trying ${label}: ${formatDateTime(startTime)} to ${formatDateTime(now)}`);

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          // Check if we got recordings
          const recordings = json.data?.entries || json.entries || json.recordings || [];

          if (recordings.length > 0) {
            console.log(`✅ FOUND ${recordings.length} RECORDINGS!\n`);
            resolve({ success: true, recordings, timeWindow: label });
          } else if (json.success === false) {
            console.log(`❌ Error: ${json.text || json.error || 'Unknown'}\n`);
            resolve({ success: false });
          } else {
            console.log(`⚠️ No recordings found\n`);
            resolve({ success: false });
          }
        } catch (e) {
          // Try /leads/get-recordings (plural)
          const url2 = `https://api.convoso.com/v1/leads/get-recordings?${params.toString()}`;

          https.get(url2, (res2) => {
            let data2 = '';
            res2.on('data', (chunk) => data2 += chunk);
            res2.on('end', () => {
              try {
                const json2 = JSON.parse(data2);
                const recordings2 = json2.data?.entries || json2.entries || json2.recordings || [];

                if (recordings2.length > 0) {
                  console.log(`✅ FOUND ${recordings2.length} RECORDINGS (plural endpoint)!\n`);
                  resolve({ success: true, recordings: recordings2, timeWindow: label });
                } else {
                  console.log(`⚠️ No recordings found\n`);
                  resolve({ success: false });
                }
              } catch (e2) {
                console.log(`❌ Failed to parse response\n`);
                resolve({ success: false });
              }
            });
          }).on('error', () => resolve({ success: false }));
        }
      });
    }).on('error', () => resolve({ success: false }));
  });
}

async function searchForRecordings() {
  for (const window of timeWindows) {
    const result = await tryTimeWindow(window.hours, window.label);

    if (result.success && result.recordings) {
      console.log('========================================');
      console.log('RECORDING FOUND - READY FOR PROCESSING');
      console.log('========================================\n');

      const rec = result.recordings[0]; // Take the first one
      console.log('Selected Recording:');
      console.log('==================');
      console.log(`Recording ID: ${rec.recording_id || rec.id}`);
      console.log(`Lead ID: ${rec.lead_id}`);
      console.log(`Agent: ${rec.agent_name || rec.agent || 'Unknown'}`);
      console.log(`Phone: ${rec.phone_number || rec.phone}`);
      console.log(`Start Time: ${rec.start_time || rec.call_start}`);
      console.log(`Duration: ${rec.seconds || rec.duration || 0} seconds`);
      console.log(`Recording URL: ${rec.url || rec.recording_url || rec.recording || 'No URL'}`);
      console.log('');

      if (rec.url || rec.recording_url || rec.recording) {
        console.log('📞 THIS RECORDING CAN BE PROCESSED!');
        console.log('====================================');
        console.log(`URL: ${rec.url || rec.recording_url || rec.recording}`);
        console.log('');
        console.log('To process this recording:');
        console.log('1. Save to database with call_id');
        console.log('2. Queue for transcription');
        console.log('3. Run AI analysis on transcript');
        console.log('');
        console.log('Time Window Used:', result.timeWindow);
      } else {
        console.log('⚠️ Recording found but no URL available');
      }

      return true;
    }
  }

  console.log('❌ No recordings found in any time window');
  console.log('This could mean:');
  console.log('1. No calls have been made recently');
  console.log('2. The API endpoint has changed');
  console.log('3. Authentication issue');

  return false;
}

searchForRecordings();