// Test different ways to call the recordings endpoint
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

console.log('Testing Convoso Recordings Endpoints');
console.log('=====================================\n');

// Test configurations
const tests = [
  {
    name: 'leads/get-recordings with date range',
    endpoint: '/leads/get-recordings',
    params: {
      auth_token: AUTH_TOKEN,
      date_from: '2025-09-11',
      date_to: '2025-09-18'
    }
  },
  {
    name: 'leads/get-recordings with wildcard lead',
    endpoint: '/leads/get-recordings',
    params: {
      auth_token: AUTH_TOKEN,
      lead_id: '*',
      date_from: '2025-09-11',
      date_to: '2025-09-18'
    }
  },
  {
    name: 'leads/get-recordings with limit',
    endpoint: '/leads/get-recordings',
    params: {
      auth_token: AUTH_TOKEN,
      limit: '10'
    }
  },
  {
    name: 'leads/recordings (different path)',
    endpoint: '/leads/recordings',
    params: {
      auth_token: AUTH_TOKEN,
      date_from: '2025-09-11',
      date_to: '2025-09-18'
    }
  },
  {
    name: 'recordings/list',
    endpoint: '/recordings/list',
    params: {
      auth_token: AUTH_TOKEN,
      date_from: '2025-09-11',
      date_to: '2025-09-18'
    }
  },
  {
    name: 'call/recordings',
    endpoint: '/call/recordings',
    params: {
      auth_token: AUTH_TOKEN,
      date_from: '2025-09-11',
      date_to: '2025-09-18'
    }
  }
];

async function testEndpoint(test) {
  return new Promise((resolve) => {
    const params = new URLSearchParams(test.params);
    const url = `https://api.convoso.com/v1${test.endpoint}?${params.toString()}`;

    console.log(`Testing: ${test.name}`);
    console.log(`URL: ${test.endpoint}`);

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);

        if (res.statusCode === 404) {
          console.log('Result: ❌ Endpoint not found\n');
          resolve({ test: test.name, success: false, reason: '404' });
          return;
        }

        try {
          const json = JSON.parse(data);

          if (json.success === false) {
            console.log(`Result: ❌ API Error: ${json.text || json.error || 'Unknown'}`);
            console.log(`Error Code: ${json.code || 'N/A'}\n`);
            resolve({ test: test.name, success: false, reason: json.text });
          } else if (json.recordings && Array.isArray(json.recordings)) {
            console.log(`Result: ✅ SUCCESS! Found ${json.recordings.length} recordings`);
            if (json.recordings.length > 0) {
              console.log('Sample fields:', Object.keys(json.recordings[0]).slice(0, 5).join(', '));
            }
            console.log('');
            resolve({ test: test.name, success: true, count: json.recordings.length });
          } else if (json.data && json.data.recordings) {
            console.log(`Result: ✅ SUCCESS! Found ${json.data.recordings.length} recordings (in data field)`);
            console.log('');
            resolve({ test: test.name, success: true, count: json.data.recordings.length });
          } else {
            console.log('Result: ⚠️ Unexpected response structure');
            console.log('Keys:', Object.keys(json).join(', '));
            console.log('');
            resolve({ test: test.name, success: false, reason: 'unexpected structure' });
          }
        } catch (e) {
          console.log('Result: ❌ Invalid JSON response\n');
          resolve({ test: test.name, success: false, reason: 'invalid JSON' });
        }
      });
    }).on('error', (err) => {
      console.log(`Result: ❌ Request failed: ${err.message}\n`);
      resolve({ test: test.name, success: false, reason: err.message });
    });
  });
}

async function runTests() {
  const results = [];

  for (const test of tests) {
    const result = await testEndpoint(test);
    results.push(result);
  }

  console.log('\n=====================================');
  console.log('SUMMARY');
  console.log('=====================================');

  const successful = results.filter(r => r.success);
  if (successful.length > 0) {
    console.log('\n✅ Working endpoints:');
    successful.forEach(r => {
      console.log(`  - ${r.test}: ${r.count} recordings`);
    });
  } else {
    console.log('\n❌ No working endpoints found');
    console.log('\nAll endpoints either:');
    console.log('1. Return 404 (don\'t exist)');
    console.log('2. Require specific parameters we don\'t have');
    console.log('3. Need different authentication');
  }

  console.log('\n💡 Recommendations:');
  console.log('1. The API may require a specific lead_id (not wildcards)');
  console.log('2. Try using the webhook approach instead');
  console.log('3. Check Convoso documentation for the correct endpoint');
}

runTests();