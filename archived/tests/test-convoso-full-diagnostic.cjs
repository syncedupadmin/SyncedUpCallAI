const fetch = require('node-fetch');

async function fullConvosoTest() {
  const authToken = '8nf3i9mmzoxidg3ntm28gbxvlhdiqo3p';
  const baseUrl = 'https://api.convoso.com/v1';

  console.log('=== FULL CONVOSO API DIAGNOSTIC ===\n');
  console.log('Testing various date ranges to find any available data...\n');

  const tests = [
    {
      name: 'Last 24 hours',
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date()
    },
    {
      name: 'Last 7 days',
      from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      to: new Date()
    },
    {
      name: 'Last 30 days',
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      to: new Date()
    },
    {
      name: 'Specific date (Sept 12, 2025)',
      from: new Date('2025-09-12'),
      to: new Date('2025-09-13')
    }
  ];

  for (const test of tests) {
    console.log(`\nTesting: ${test.name}`);
    console.log(`From: ${test.from.toISOString().split('T')[0]}`);
    console.log(`To: ${test.to.toISOString().split('T')[0]}`);

    // Test the leads/get-recordings endpoint
    const params = new URLSearchParams({
      auth_token: authToken,
      start_date: test.from.toISOString().split('T')[0],
      end_date: test.to.toISOString().split('T')[0],
      limit: '10',
      offset: '0'
    });

    const url = `${baseUrl}/leads/get-recordings?${params}`;

    try {
      console.log(`Calling: ${url}`);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log(`  ❌ HTTP ${response.status}: ${response.statusText}`);
        const text = await response.text();
        console.log(`  Response: ${text.substring(0, 200)}`);
      } else {
        const data = await response.json();
        console.log(`  ✅ Success: ${data.success}`);

        if (data.data) {
          console.log(`  Total records: ${data.data.total || 0}`);
          console.log(`  Entries: ${data.data.entries?.length || 0}`);

          if (data.data.entries && data.data.entries.length > 0) {
            console.log('  Sample entry:', JSON.stringify(data.data.entries[0], null, 2));
          }
        } else if (data.error) {
          console.log(`  Error: ${data.error}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Fetch error: ${error.message}`);
    }
  }

  // Also test if there's a different endpoint pattern
  console.log('\n\nTesting alternative endpoints...\n');

  const alternatives = [
    '/leads/recordings',
    '/recordings',
    '/calls',
    '/leads/calls'
  ];

  for (const endpoint of alternatives) {
    const url = `${baseUrl}${endpoint}?auth_token=${authToken}&limit=1`;
    console.log(`Testing: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        timeout: 5000
      });

      console.log(`  Status: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`  Response type: ${Array.isArray(data) ? 'array' : typeof data}`);
        if (data.success !== undefined) {
          console.log(`  Success: ${data.success}`);
        }
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }

  console.log('\n=== END DIAGNOSTIC ===');
}

fullConvosoTest().catch(console.error);