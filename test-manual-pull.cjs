// Test manual pull - Get one recording from 6 hours ago
const http = require('http');

// Calculate time range for 6 hours ago
const now = new Date();
const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);

console.log('Manual Convoso Pull Test - 6 Hours Ago');
console.log('=======================================');
console.log('Start:', sixHoursAgo.toISOString());
console.log('End:', fiveHoursAgo.toISOString());
console.log('');

// Prepare the request payload
const payload = JSON.stringify({
  startDate: sixHoursAgo.toISOString(),
  endDate: fiveHoursAgo.toISOString(),
  limit: 1,  // Just get one recording
  processTranscription: true  // Process through transcription
});

// Make request to local API
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/convoso/manual-pull',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': payload.length,
    'x-admin-secret': 'dev-secret'
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);

      if (json.success) {
        console.log('✅ SUCCESS!');
        console.log(`Endpoint used: ${json.endpoint}`);
        console.log(`Recordings found: ${json.recordings_found}`);
        console.log(`Calls processed: ${json.calls_processed}`);
        console.log('');

        if (json.calls && json.calls.length > 0) {
          const call = json.calls[0];
          console.log('Recording Details:');
          console.log('==================');
          console.log(`Call ID: ${call.call_id}`);
          console.log(`Lead ID: ${call.convoso_lead_id}`);
          console.log(`Agent: ${call.agent_name}`);
          console.log(`Phone: ${call.phone_number}`);
          console.log(`Duration: ${call.duration} seconds`);
          console.log(`Start Time: ${call.started_at}`);
          console.log(`Recording URL: ${call.recording_url ? '✓ Available' : '✗ Not available'}`);
          console.log(`Database ID: ${call.id}`);
          console.log(`Transcription Queued: ${call.transcription_queued ? '✓ Yes' : '✗ No'}`);

          if (call.recording_url) {
            console.log('');
            console.log('🎯 Recording URL:');
            console.log(call.recording_url);
            console.log('');
            console.log('📝 Transcription Status:');
            if (call.transcription_queued) {
              console.log('✓ Queued for transcription and analysis');
              console.log('✓ Processing will begin shortly');
              console.log('');
              console.log('Check progress at: http://localhost:3000/super-admin');
            } else {
              console.log('✗ Not queued (no recording URL)');
            }
          }
        } else {
          console.log('⚠️ No recordings found in the specified time range');
          console.log('Try a different time range or check if calls were made during that period');
        }
      } else {
        console.log('❌ Error:', json.error);
      }
    } catch (e) {
      console.log('Error parsing response:', e.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request failed:', e.message);
  console.log('');
  console.log('Make sure the app is running locally:');
  console.log('npm run dev');
});

req.write(payload);
req.end();