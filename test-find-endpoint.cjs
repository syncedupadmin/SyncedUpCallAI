// Try different endpoint variations to find the right one
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Format dates for 1 hour lookback
const now = new Date();
const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

const formatDateTime = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Endpoints to try
const endpoints = [
  { path: '/reports/call-log', params: ['start_date', 'end_date'] },
  { path: '/reports/calllog', params: ['start_date', 'end_date'] },
  { path: '/reports/call_log', params: ['start_date', 'end_date'] },
  { path: '/report/call-log', params: ['start_date', 'end_date'] },
  { path: '/report/calllog', params: ['start_date', 'end_date'] },
  { path: '/call-log', params: ['start_date', 'end_date'] },
  { path: '/calllog', params: ['start_date', 'end_date'] },
  { path: '/calls/log', params: ['start_date', 'end_date'] },
  { path: '/calls/report', params: ['start_date', 'end_date'] },
  { path: '/users/recordings', params: ['start_time', 'end_time'], needsUser: true },
  { path: '/lead/recordings', params: ['start_time', 'end_time'] },
  { path: '/leads/recordings', params: ['start_time', 'end_time'] }
];

console.log('Searching for the correct Convoso endpoint...');
console.log('==============================================\n');

async function tryEndpoint(endpoint) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      auth_token: AUTH_TOKEN,
      limit: '5',
      offset: '0'
    });

    // Add date parameters based on endpoint requirements
    if (endpoint.params.includes('start_date')) {
      params.append('start_date', formatDateTime(oneHourAgo));
      params.append('end_date', formatDateTime(now));
    } else {
      params.append('start_time', formatDateTime(oneHourAgo));
      params.append('end_time', formatDateTime(now));
    }

    // Add user parameter if needed
    if (endpoint.needsUser) {
      params.append('user', '*');
    }

    const url = `https://api.convoso.com/v1${endpoint.path}?${params.toString()}`;

    console.log(`Testing: ${endpoint.path}`);

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`  Status: ${res.statusCode}`);

        if (res.statusCode === 404) {
          console.log('  ❌ Not found\n');
          resolve({ endpoint: endpoint.path, success: false, status: 404 });
          return;
        }

        try {
          const json = JSON.parse(data);

          if (json.success === false) {
            console.log(`  ❌ API Error: ${json.text || json.error || 'Unknown'}\n`);
            resolve({ endpoint: endpoint.path, success: false, error: json.text });
          } else if (json.data) {
            const entries = json.data.entries || json.entries || [];
            console.log(`  ✅ SUCCESS! Found ${entries.length} entries`);

            if (entries.length > 0) {
              const sample = entries[0];
              console.log('  Sample fields:', Object.keys(sample).slice(0, 5).join(', '));

              // Check if it has complete call data
              if (sample.call_id && sample.lead_id && sample.agent_name) {
                console.log('  ✅ HAS COMPLETE CALL DATA!\n');
                resolve({ endpoint: endpoint.path, success: true, hasCompleteData: true, sample });
              } else if (sample.recording_id || sample.url) {
                console.log('  ⚠️ Has recording data but missing call details\n');
                resolve({ endpoint: endpoint.path, success: true, hasCompleteData: false, sample });
              } else {
                console.log('  ⚠️ Unknown data structure\n');
                resolve({ endpoint: endpoint.path, success: true, hasCompleteData: false, sample });
              }
            } else {
              console.log('  ⚠️ No data returned\n');
              resolve({ endpoint: endpoint.path, success: true, hasCompleteData: false });
            }
          } else {
            console.log('  ❌ No data field in response\n');
            resolve({ endpoint: endpoint.path, success: false });
          }
        } catch (e) {
          console.log('  ❌ Invalid JSON response\n');
          resolve({ endpoint: endpoint.path, success: false, error: 'Invalid JSON' });
        }
      });
    }).on('error', (err) => {
      console.log(`  ❌ Request failed: ${err.message}\n`);
      resolve({ endpoint: endpoint.path, success: false, error: err.message });
    });
  });
}

async function findEndpoint() {
  const results = [];

  for (const endpoint of endpoints) {
    const result = await tryEndpoint(endpoint);
    results.push(result);

    // If we found one with complete data, highlight it
    if (result.success && result.hasCompleteData) {
      console.log('🎯 FOUND THE CORRECT ENDPOINT!');
      console.log('================================');
      console.log(`Endpoint: ${endpoint.path}`);
      console.log(`Has complete call data: YES`);
      console.log('\nSample data:');
      console.log(JSON.stringify(result.sample, null, 2).substring(0, 500));
      return result;
    }
  }

  // Show summary
  console.log('\n=============================');
  console.log('SUMMARY');
  console.log('=============================');

  const working = results.filter(r => r.success);
  if (working.length > 0) {
    console.log('\nWorking endpoints:');
    working.forEach(r => {
      console.log(`  ${r.endpoint}: ${r.hasCompleteData ? '✅ Complete data' : '⚠️ Partial data'}`);
    });
  } else {
    console.log('\n❌ No working endpoints found');
  }

  return null;
}

findEndpoint();