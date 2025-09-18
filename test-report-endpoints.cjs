// Try different report-related endpoints
const https = require('https');

const AUTH_TOKEN = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';

// Format dates
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

// More endpoints to try - based on common API patterns
const endpoints = [
  '/reports',
  '/report',
  '/reporting/calls',
  '/reporting/call-log',
  '/analytics/calls',
  '/data/calls',
  '/logs/calls',
  '/activity/calls',
  '/history/calls',
  '/call/history',
  '/call/logs',
  '/dialer/history',
  '/dialer/calls',
  '/agent/calls',
  '/campaign/calls'
];

console.log('Searching for Convoso report endpoints...');
console.log('=========================================\n');

async function tryEndpoint(path) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      auth_token: AUTH_TOKEN
    });

    const url = `https://api.convoso.com/v1${path}?${params.toString()}`;

    console.log(`Testing: ${path}`);

    const req = https.get(url, { timeout: 3000 }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        if (res.statusCode === 404) {
          console.log('  ❌ 404 Not Found\n');
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          console.log('  🔒 Auth required (endpoint exists!)\n');
        } else if (res.statusCode === 200) {
          console.log(`  ✅ 200 OK - Endpoint exists!`);

          // Try to parse response
          try {
            const json = JSON.parse(data);
            if (json.success !== undefined) {
              console.log(`  Response: ${json.success ? 'Success' : 'Failed'}`);
              if (json.data) {
                console.log(`  Has data field: YES`);
              }
            }
          } catch (e) {
            // Not JSON
          }
          console.log('');
        } else {
          console.log(`  Status: ${res.statusCode}\n`);
        }
        resolve();
      });
    });

    req.on('timeout', () => {
      console.log('  ⏱️ Timeout\n');
      req.destroy();
      resolve();
    });

    req.on('error', (err) => {
      if (err.code !== 'ECONNRESET') {
        console.log(`  ❌ Error: ${err.code}\n`);
      }
      resolve();
    });
  });
}

async function search() {
  for (const endpoint of endpoints) {
    await tryEndpoint(endpoint);
  }

  console.log('\n=========================================');
  console.log('Based on the documentation you provided:');
  console.log('The endpoint should be /reports/call-log');
  console.log('But it returns 404.');
  console.log('');
  console.log('The only working endpoint is /users/recordings');
  console.log('but it requires a specific user email.');
  console.log('');
  console.log('Possible issues:');
  console.log('1. The API documentation may be outdated');
  console.log('2. The endpoint requires different authentication');
  console.log('3. The endpoint path has changed');
}

search();